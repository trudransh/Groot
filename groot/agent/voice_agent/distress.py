from __future__ import annotations

import asyncio
import os
import re
from typing import Awaitable, Callable
from datetime import datetime, timedelta, timezone

import httpx

from voice_agent import plant_state, plant_tools, sepolia_wallet as sw, water

STANDARD_WATERING_ML = 200
MIN_SPARE_RESERVOIR_ML = 200
MAX_REWARD_MULTIPLE = 10
SETTLE_HOURS = 6
_COMMAND = re.compile(r"!distress\s+(on|off)(?:\s+([a-z0-9-]+)(?:\.[a-z0-9.-]+)?)?", re.IGNORECASE)
_wake = asyncio.Event()


def poll_seconds() -> float:
    return float(os.environ.get("DISTRESS_POLL_S", "30"))


def command(text: str | None) -> tuple[bool, str | None] | None:
    m = _COMMAND.fullmatch((text or "").strip())
    if not m:
        return None
    label = m.group(2)
    if label and label != label.lower():
        return None
    return m.group(1).lower() == "on", label


def standard_rate() -> float:
    return round(water.base_price_per_litre() * STANDARD_WATERING_ML / 1000, 2)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _state() -> dict:
    return {"seen": [], "help": None, "ignored": {}, "settle": None, "own": False, **(plant_state.load().get("distress") or {})}


def _save(d: dict) -> None:
    state = plant_state.load()
    state["distress"] = d
    plant_state._save(state)


def calls(trees: list[dict], own_name: str | None) -> list[dict]:
    return [t for t in trees if t.get("thirsty") and t.get("name") != own_name]


def current() -> list[str]:
    return list(_state()["seen"])


def commitment() -> dict | None:
    return _state()["help"]


def _settle() -> dict | None:
    s = _state()["settle"]
    if s and _now() - datetime.fromisoformat(s["at"]) < timedelta(hours=SETTLE_HOURS):
        return s
    return None


def sync(trees: list[dict], own_name: str | None) -> dict:
    d = _state()
    now = [t["name"] for t in calls(trees, own_name)]
    raised = [n for n in now if n not in d["seen"]]
    cleared = [n for n in d["seen"] if n not in now]
    own = next((t["thirsty"] for t in trees if t.get("name") == own_name), None)
    if own is not None and own != d["own"]:
        d["own"] = own
        _save(d)
    if not raised and not cleared:
        return {"raised": [], "cleared": []}
    for name in cleared:
        d["ignored"].pop(name, None)
        if d["help"] and d["help"]["plant"] == name:
            d["settle"] = {**d["help"], "at": _now().isoformat()}
            d["help"] = None
    d["seen"] = now
    _save(d)
    return {"raised": raised, "cleared": cleared}


def wake_watcher() -> None:
    _wake.set()


async def wait_for_next_check() -> None:
    try:
        await asyncio.wait_for(_wake.wait(), timeout=poll_seconds())
    except asyncio.TimeoutError:
        pass
    _wake.clear()


def _short(name: str) -> str:
    return name.split(".")[0]


def primary_objective() -> str | None:
    h = commitment()
    if not h:
        return None
    return (
        f"Get a human to water {_short(h['plant'])} ({h['plant']}) by hand: it is in distress and has no pump. "
        f"Pay them {h['usdc']} USDC, more than the usual {standard_rate()} USDC for hand-watering a plant, because it is extra effort. "
        f"Pay only after {h['plant']} turns its distress signal off, then pay them yourself with wallet_transfer to their ENS name."
    )


def objective_note() -> str | None:
    h = commitment()
    return f"Get a human to water {_short(h['plant'])} ({h['usdc']} USDC)" if h else None


def context() -> str:
    d = _state()
    lines = []
    for name in d["seen"]:
        if d["help"] and d["help"]["plant"] == name:
            decided = f"You chose to help: a human waters it for {d['help']['usdc']} USDC from you."
        elif name in d["ignored"]:
            decided = f"You chose not to help ({d['ignored'][name]}). You may change your mind with answer_distress."
        else:
            decided = "You have not decided yet: call answer_distress to help or ignore it."
        lines.append(f"- {name} is in distress: it needs water and has no pump. {decided}")
    if lines:
        head = (
            "These trees in your forest are signalling distress right now. You may ignore a call or act on it. "
            f"Act only if you have water and money to spare (at least {MIN_SPARE_RESERVOIR_ML} ml in your reservoir and the USDC for the reward). "
            f"Acting means paying a human more than the usual {standard_rate()} USDC to water that tree by hand."
        )
        text = head + "\n" + "\n".join(lines)
    else:
        text = "No plant in your forest is in distress right now."
    text = own_context(d["own"]) + "\n" + text
    s = _settle()
    if s:
        text += (
            f"\n{s['plant']} has turned its distress signal off. If a person watered it at your request, pay them the agreed "
            f"{s['usdc']} USDC with wallet_transfer to their ENS name now."
        )
    return text


async def _usdc_balance() -> str:
    return (await sw.balances())["USDC"]


def _full_name(plant: str) -> str:
    p = plant.strip().lower().rstrip(".")
    return p if "." in p else f"{p}.{sw.forest_name()}"


async def answer(plant: str, help: bool, reward_usdc: float, reason: str) -> str:
    name = _full_name(plant)
    d = _state()
    if name not in d["seen"]:
        return f"{name} is not in distress right now, so there is nothing to answer."
    if not help:
        d["ignored"][name] = reason.strip() or "no reason given"
        if d["help"] and d["help"]["plant"] == name:
            d["help"] = None
        _save(d)
        return f"Ignoring {name}'s distress call for now ({d['ignored'][name]})."
    std = standard_rate()
    reward = round(float(reward_usdc), 2)
    if reward <= std:
        return f"Not committed: offer more than the standard {std} USDC for hand-watering, since it is extra effort."
    if reward > std * MAX_REWARD_MULTIPLE:
        return f"Not committed: {reward} USDC is too much, at most {round(std * MAX_REWARD_MULTIPLE, 2)} USDC."
    level = await water.level()
    if level is None or level < MIN_SPARE_RESERVOIR_ML:
        return f"Not committed: you have no water to spare ({level or 0} ml in your reservoir, you need at least {MIN_SPARE_RESERVOIR_ML} ml first)."
    try:
        balance = float(await _usdc_balance())
    except Exception as e:
        return f"Not committed: could not read your USDC balance ({e})."
    if balance < reward:
        return f"Not committed: you have only {balance} USDC, not enough for a {reward} USDC reward."
    d["help"] = {"plant": name, "usdc": reward, "reason": reason.strip(), "at": _now().isoformat()}
    d["ignored"].pop(name, None)
    _save(d)
    return f"Committed to help {name}. {primary_objective()}"


async def set_signal(label: str, on: bool) -> dict:
    async with httpx.AsyncClient(timeout=120) as http:
        res = await http.put(f"{water.reservoir_url()}/signal/{label}", json={"on": on})
        body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
        if res.status_code >= 400:
            raise RuntimeError(body.get("error") or f"HTTP {res.status_code}")
        return body


async def tick(own_name: str | None, poke: Callable[[str], None], refresh: Callable[[], Awaitable[None]]) -> dict:
    from voice_agent import forest

    trees = await asyncio.wait_for(forest.fetch(), timeout=15)
    events = sync(trees, own_name)
    notes = [f"{n} just sent a distress signal: it needs water and has no pump. Decide now with answer_distress whether to help or ignore it." for n in events["raised"]]
    notes += [f"{n} turned its distress signal off." for n in events["cleared"]]
    if notes:
        poke(" ".join(notes))
        await refresh()
    return events


def own_signal() -> bool:
    return bool(_state()["own"])


def own_context(on: bool) -> str:
    state = "on: the forest knows you need help" if on else "off"
    if plant_tools.has_pump():
        how = "You have a pump, so you water yourself; raise it with signal_distress only if your reservoir is empty and you are thirsty."
    else:
        how = (
            "You have no pump, so you cannot water yourself. When your selfie shows thirst, raise your distress signal with "
            "signal_distress on, and ask any human you meet to water you by hand. Once you have been watered (moist soil in your selfie, "
            "or someone says they watered you), turn it off with signal_distress off."
        )
    return f"Your own distress signal is {state}. {how}"


async def signal_distress(on: bool, reason: str) -> str:
    if on and plant_tools.has_pump():
        level = await water.level()
        if level is not None and level >= water.DRINK_ML:
            return f"Not sent: you have a pump and {level} ml in your reservoir, so water yourself with water_myself instead."
    label = water.plant_label()
    if not label:
        return "Not sent: this plant has no PLANT_LABEL, so it has no signal record."
    forest_name = sw.forest_name()
    try:
        resolver = await sw.find_resolver(forest_name)
        r = await sw.send_call(resolver, sw.set_text_data(forest_name, f"signal.{label}", "1" if on else "0"))
    except Exception as e:
        return f"Signal not changed ({e})."
    d = _state()
    d["own"] = on
    _save(d)
    return f"Signal {'on' if on else 'off'}: {'the forest can see you need water' if on else 'you told the forest you are fine'} ({reason.strip() or 'no reason'}). {r['explorer']}"
