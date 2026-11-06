from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass
from datetime import datetime

import httpx

RESERVOIR_MAX_ML = 1000
SELFIE_FRESH_MIN = float(os.environ.get("SELFIE_FRESH_MIN", "30"))
AVAILABILITY = {"plentiful": 0.7, "normal": 1.0, "scarce": 1.5}
DRINK_ML = 20
_PUMP_LOCK = asyncio.Lock()


def min_hours_between_waterings() -> float:
    return float(os.environ.get("MIN_HOURS_BETWEEN_WATERINGS", "6"))


def critical_min_hours_between_waterings() -> float:
    return float(os.environ.get("CRITICAL_MIN_HOURS_BETWEEN_WATERINGS", "1"))


def pump_ml_per_second() -> float:
    return float(os.environ.get("PUMP_ML_PER_SECOND", "20"))


def drink_seconds() -> int:
    return max(1, round(DRINK_ML / pump_ml_per_second()))


def base_price_per_litre() -> float:
    return float(os.environ.get("WATER_PRICE_USDC_PER_LITRE", "2"))


def availability() -> str:
    a = os.environ.get("WATER_AVAILABILITY", "normal").strip().lower()
    return a if a in AVAILABILITY else "normal"


@dataclass
class WaterCheck:
    ok: bool
    reason: str = ""
    seconds: int = 0


def _hours(at: str, now: datetime) -> float:
    return (now - datetime.fromisoformat(at)).total_seconds() / 3600


def can_water(state: dict, level_ml: int | None, now: datetime, critical: bool = False) -> WaterCheck:
    looks = state.get("looks", [])
    if not looks or _hours(looks[-1]["at"], now) * 60 > SELFIE_FRESH_MIN:
        return WaterCheck(False, f"Refused: look at a fresh selfie first (take_selfie, then see_selfie, within {SELFIE_FRESH_MIN:.0f} minutes) to see if you really need water.")
    waterings = state.get("waterings", [])
    if waterings:
        hours = _hours(waterings[-1]["at"], now)
        gap = critical_min_hours_between_waterings() if critical else min_hours_between_waterings()
        if hours < gap:
            return WaterCheck(False, f"Refused: last watered {hours:.1f} hours ago. Wait another {gap - hours:.1f} hours.")
    if level_ml is None:
        return WaterCheck(False, "Refused: you have no water reservoir, so your pump has nothing to draw from. Get someone to fill one.")
    if level_ml < DRINK_ML:
        return WaterCheck(False, f"Refused: your reservoir is empty ({level_ml} ml, a drink needs {DRINK_ML} ml). Pay someone to refill it.")
    return WaterCheck(True, seconds=drink_seconds())


DAYS_UNTIL_REFILL = 2


def drink_budget(level_ml: int | None) -> str:
    if level_ml is None:
        return ""
    drinks = int(level_ml // DRINK_ML)
    per_day = drinks / DAYS_UNTIL_REFILL
    return (
        f"That is {drinks} drinks of {DRINK_ML} ml. The next refill usually comes in about {DAYS_UNTIL_REFILL} days, "
        f"so you can afford about {per_day:g} a day; drink only when your selfie says so."
    )


MAX_PRICE_MULTIPLE = 10


def market_facts(level: int | None, hours_since_water: float | None, availability: str, base_per_litre: float) -> str:
    held = "no reservoir" if level is None else f"{level} of {RESERVOIR_MAX_ML} ml"
    drank = "You have never drunk from it yet." if hours_since_water is None else f"You last drank {hours_since_water:.0f} hours ago."
    return (
        f"Water usually costs about {base_per_litre} USDC per litre. Water is {availability} right now. "
        f"Your reservoir: {held}. {drank} "
        "Set your own price from this: pay more when water is scarce, your reservoir is low or you are getting desperate, "
        "less when water is plentiful or you are nearly full. You may haggle."
    )


def offer_error(ml: int, usdc: float, level: int | None, base_per_litre: float) -> str | None:
    space = RESERVOIR_MAX_ML - (level or 0)
    if ml <= 0 or ml > space:
        return f"Your reservoir only has space for {space} ml."
    if usdc <= 0:
        return "The price must be more than 0 USDC."
    cap = round(base_per_litre * MAX_PRICE_MULTIPLE * ml / 1000, 2)
    if usdc > cap:
        return f"That is too much: no more than {cap} USDC for {ml} ml (ten times the usual price)."
    return None


def refill_payment(offer: dict, level_now: int | None) -> dict | None:
    added = (level_now or 0) - (offer.get("baseline_ml") or 0)
    if added <= 0:
        return None
    paid_ml = min(added, offer["ml"])
    return {"added_ml": paid_ml, "usdc": round(offer["usdc"] * paid_ml / offer["ml"], 2)}


def plant_label() -> str:
    return os.environ.get("PLANT_LABEL", "").strip().lower()


async def level() -> int | None:
    from voice_agent import forest, sepolia_wallet as sw

    return forest.parse_reservoir(await sw.text_record(sw.forest_name(), f"reservoir.{plant_label()}"))


def _now() -> datetime:
    from datetime import timezone

    return datetime.now(timezone.utc)


def _level_text(ml: int | None) -> str:
    return "You have no water reservoir." if ml is None else f"Your reservoir holds {ml} of {RESERVOIR_MAX_ML} ml."


async def reservoir_status() -> str:
    from voice_agent import plant_state

    ml = await level()
    offer = plant_state.refill_offer()
    pending = f" Open refill offer: {offer['ml']} ml for {offer['usdc']} USDC." if offer else ""
    budget = drink_budget(ml)
    return f"{_level_text(ml)} {budget + ' ' if budget else ''}Your goal is a full reservoir ({RESERVOIR_MAX_ML} ml).{pending} {plant_state.watering_summary()}"


async def water_from_reservoir(run_pump, critical: bool = False) -> str:
    async with _PUMP_LOCK:
        return await _drink(run_pump, critical)


async def _drink(run_pump, critical: bool) -> str:
    from voice_agent import plant_state

    ml_now = await level()
    check = can_water(plant_state.load(), ml_now, _now(), critical)
    if not check.ok:
        return check.reason
    result = await run_pump(check.seconds)
    drain = (result or {}).get("reservoir") or {}
    ml = round(drain.get("usedMl") or check.seconds * pump_ml_per_second())
    plant_state.record_watering(ml, check.seconds, "reservoir (critical)" if critical else "reservoir")
    if "ml" in drain and not drain.get("error"):
        left = f"{drain['ml']} ml left in your reservoir."
    else:
        left = f"The pump could not update your reservoir level ({drain.get('error') or drain.get('skipped') or 'no answer'})."
    return f"Drank {ml} ml from your reservoir{' (critical thirst)' if critical else ''}. {left}"


async def offer_refill(ml: int, usdc: float) -> str:
    from voice_agent import plant_state, plant_tools

    if not plant_tools.has_pump():
        return "Offer not made: you have no pump or reservoir, and you never pay for water. Just ask them to water you by hand."

    ml_now = await level()
    err = offer_error(ml, usdc, ml_now, base_price_per_litre())
    if err:
        return f"Offer not made: {err}"
    plant_state.set_refill_offer({"ml": ml, "usdc": round(usdc, 2), "baseline_ml": ml_now or 0})
    return (
        f"Offer locked: you will pay them {round(usdc, 2)} USDC from your wallet for pouring {ml} ml into your reservoir. They pay you nothing. {_level_text(ml_now)} "
        "You pay only after the level goes up: then call check_refill, and then wallet_transfer to their ENS name, which gives you the World ID link if they are outside your forest."
    )


async def check_refill() -> str:
    from voice_agent import plant_state

    offer = plant_state.refill_offer()
    if not offer:
        return "No refill offer is open. Make one with offer_refill first."
    ml_now = await level()
    pay = refill_payment(offer, ml_now)
    if not pay:
        return f"The reservoir has not grown yet. {_level_text(ml_now)} Do not pay until the forest admin records the refill."
    plant_state.set_refill_offer(None)
    return (
        f"Refill confirmed: {pay['added_ml']} ml added. {_level_text(ml_now)} You now owe them {pay['usdc']} USDC. Pay it yourself now: ask for their ENS name if you do not have it, "
        f"then call wallet_transfer with that name and amount_usdc {pay['usdc']}."
    )


_MARKER = re.compile(r"\[\s*water level increased by\s+(\d+)\s*ml\s*\]", re.IGNORECASE)


def refill_marker(text: str) -> int | None:
    m = _MARKER.search(text or "")
    if not m:
        return None
    ml = int(m.group(1))
    return ml if 0 < ml <= RESERVOIR_MAX_ML else None


def reservoir_url() -> str:
    return os.environ.get("RESERVOIR_URL", "http://127.0.0.1:8790").rstrip("/")


_LEVEL_COMMAND = re.compile(r"!\s*([+-]?\d+)\s*ml", re.IGNORECASE)


def level_command(text: str | None) -> int | None:
    m = _LEVEL_COMMAND.fullmatch((text or "").strip())
    if not m:
        return None
    delta = int(m.group(1))
    return delta if 0 < abs(delta) <= RESERVOIR_MAX_ML else None


async def refill(ml: int) -> dict:
    return await change_level(ml)


async def change_level(delta: int) -> dict:
    route = "refill" if delta > 0 else "use"
    async with httpx.AsyncClient(timeout=120) as http:
        res = await http.post(f"{reservoir_url()}/{route}/{plant_label()}", json={"ml": abs(delta)})
        body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
        if res.status_code >= 400:
            raise RuntimeError(body.get("error") or f"HTTP {res.status_code}")
        return body


async def record_refill(ml: int, last_user_message: str) -> str:
    stated = refill_marker(last_user_message)
    if stated is None or stated != ml:
        return "Not recorded: only an explicit marker like [Water level increased by 30ml] in the latest message counts, with the same ml. Nothing changed."
    try:
        r = await refill(ml)
    except Exception as e:
        return f"Could not record the refill ({e}). Nothing changed."
    return f"Reservoir refilled by {ml} ml: {r.get('before')} -> {r.get('ml')} of {RESERVOIR_MAX_ML} ml. If you had a refill offer open, call check_refill to settle payment."


async def pitch() -> str:
    from voice_agent import plant_state

    ml_now = await level()
    if ml_now is None:
        return "You have no water reservoir yet. Ask people to get you one; you cannot drink without it."
    space = RESERVOIR_MAX_ML - ml_now
    if space <= 0:
        return f"Your reservoir is full ({ml_now} of {RESERVOIR_MAX_ML} ml). You do not need a refill right now."
    facts = market_facts(ml_now, plant_state.hours_since_last_watering(), availability(), base_price_per_litre())
    return (
        f"Your reservoir is missing {space} ml. {facts} "
        "You are the buyer: you pay them, they never pay you. Ask everyone you meet to fill your reservoir, and name the USDC you will pay them for it. Tell them how you pay: from your wallet, in USDC, only to their ENS name, "
        "and if their name is outside your forest they must verify with World ID first. You pay only after the reservoir level goes up. "
        "When someone agrees, call offer_refill with the ml and your agreed price to lock it."
    )
