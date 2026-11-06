"""Groot's inner life: a long-running loop, separate from conversations, where it thinks, checks itself, waters and sleeps."""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Awaitable, Callable

from livekit import rtc

from voice_agent import diary, distress, forest, plant_state, plant_tools, wallet, water, zero_g
from voice_agent.logger import get_logger
from voice_agent.persona import INNER_OBJECTIVES, NAME, PERSONA, PLANT_CARE, distress_context, objectives

logger = get_logger()

DIARY_TOPIC = "groot_diary"
MIND_TOPIC = "groot_mind"
DEFAULT_SLEEP_MIN = float(os.environ.get("INNER_DEFAULT_SLEEP_MIN", "20"))
MAX_STEPS = 10
SELFIE_REUSE_MIN = float(os.environ.get("SELFIE_REUSE_MIN", "10"))
POKE_MIN_GAP_MIN = float(os.environ.get("INNER_POKE_MIN_GAP_MIN", "2"))
_SLEEPING_SUFFIX = re.compile(r"\s*\(sleeping [\d.]+ min\)", re.IGNORECASE)

_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "record_leaves",
            "description": "Save a leaf check to memory.",
            "parameters": {
                "type": "object",
                "properties": {"count": {"type": ["integer", "null"]}, "note": {"type": "string"}},
                "required": ["count", "note"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "water_myself",
            "description": f"Drink {water.DRINK_ML} ml from your reservoir with your pump, when a fresh selfie shows thirst and the reservoir has water.",
            "parameters": {
                "type": "object",
                "properties": {"critical": {"type": "boolean", "description": "True only when the selfie shows critical thirst; lets you drink sooner after your last drink."}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "my_reservoir",
            "description": "Check your water reservoir level, any open refill offer, and your watering and selfie history.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "answer_distress",
            "description": "Answer another tree's distress call: help (pay a human more than the usual rate to water it by hand) or ignore it. Help only with water and money to spare.",
            "parameters": {
                "type": "object",
                "properties": {
                    "plant": {"type": "string", "description": "The tree in distress, e.g. sapling"},
                    "help": {"type": "boolean"},
                    "reward_usdc": {"type": "number", "description": "USDC you will pay the human who waters it; 0 when ignoring."},
                    "reason": {"type": "string"},
                },
                "required": ["plant", "help", "reward_usdc", "reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sleep",
            "description": "Rest until your next thought. Always end each waking moment with this.",
            "parameters": {
                "type": "object",
                "properties": {
                    "minutes": {"type": "number", "minimum": 1, "maximum": 240},
                    "diary": {"type": "string", "description": "One or two lines for your diary about this moment."},
                },
                "required": ["minutes", "diary"],
            },
        },
    },
]


_TOOL_NAMES = [t["function"]["name"] for t in _TOOLS]


def _prompt(forest_context: str = "") -> str:
    return "\n\n".join(
        (
            f"You are {NAME}, alone with your thoughts. This is your inner voice, not a conversation: nobody hears it.",
            PERSONA.strip(),
            PLANT_CARE.strip(),
            "Your objectives right now:\n" + objectives(INNER_OBJECTIVES),
            *((("Your forest:\n" + forest_context),) if forest_context else ()),
            "Distress calls:\n" + distress_context(),
            "Live like a person: notice how you feel, decide whether anything needs doing, do it with your tools, "
            "then sleep. Act with tool calls, never only words: if your selfie shows thirst and your reservoir has water, call water_myself; "
            f"each drink is {water.DRINK_ML} ml. You only know how you look from your selfie, which is taken and read for you each time you wake; trust it and do not ask for another. "
            f"Right now you can only use these tools: {', '.join(_TOOL_NAMES)}. "
            "Deals with people (offer_refill, check_refill, wallet_transfer, haggling) happen only in conversations, never here; plan them for the next visitor. "
            "Every thought is at most two short sentences in your fast-talking comic voice, in English; never repeat yourself. "
            "End every moment by calling sleep.",
        )
    )


_ACT = (
    "Do not just think it, act on it now with a tool call. Thirsty and your reservoir has water? Call water_myself. "
    "Nothing to do? Call sleep."
)


def _tool_args(raw: object) -> dict | None:
    try:
        args = json.loads(raw or "{}") if isinstance(raw, str) or raw is None else None
    except json.JSONDecodeError:
        return None
    return args if isinstance(args, dict) else None


_DECISIONS = {
    "take_selfie": "take a selfie",
    "see_selfie": "look at my selfie",
    "record_leaves": "note my leaves",
    "my_reservoir": "check my reservoir",
    "water_myself": f"drink {water.DRINK_ML} ml from my reservoir",
    "sleep": "sleep",
}


def decision_label(name: str, args: dict) -> str:
    action = _DECISIONS.get(name, name)
    if name == "sleep" and "minutes" in args:
        return f"Decided to {action} for {_sleep_minutes(args['minutes']):.0f} min"
    if name == "answer_distress":
        plant = str(args.get("plant", "")).split(".")[0]
        return f"Decided to {'help' if args.get('help') is True else 'ignore'} {plant}"
    if name == "water_myself" and args.get("critical") is True:
        return f"Decided to {action} (critical)"
    return f"Decided to {action}"


def _sleep_minutes(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 1 <= value <= 24 * 60:
        return DEFAULT_SLEEP_MIN
    return float(value)


class InnerLoop:
    def __init__(self, room: rtc.Room, is_busy: Callable[[], bool], on_change: Callable[[], Awaitable[None]]) -> None:
        self.room = room
        self.is_busy = is_busy
        self.on_change = on_change
        self.client = zero_g.client()
        self.model = zero_g.config().model
        self._poke = asyncio.Event()
        self._poke_note = ""

    def poke(self, note: str) -> None:
        """Wake the inner loop early, e.g. right after a conversation ends."""
        self._poke_note = note
        self._poke.set()

    async def publish(self) -> None:
        await self.room.local_participant.send_text(json.dumps(diary.load()[-300:]), topic=DIARY_TOPIC)

    async def _mind(self, state: str, step: str, sleep_min: float | None = None, **extra: object) -> None:
        payload = {"state": state, "step": step, "at": datetime.now(timezone.utc).isoformat()}
        if sleep_min is not None:
            payload["sleepMin"] = sleep_min
        payload.update({k: v for k, v in extra.items() if v is not None})
        try:
            await self.room.local_participant.send_text(json.dumps(payload), topic=MIND_TOPIC)
        except Exception as e:
            logger.warning("Could not send mind step: %s", e)

    async def _note(self, kind: str, text: str, **extra: object) -> None:
        diary.write(kind, text, **extra)
        await self.publish()

    async def run(self) -> None:
        await self.publish()
        await self._mind("awake", "Someone came by, waking up")
        sleep_min = 0.1
        while True:
            note = await self._rest(sleep_min)
            try:
                sleep_min = await self._moment(note)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Inner loop moment failed")
                sleep_min = DEFAULT_SLEEP_MIN

    async def _rest(self, minutes: float) -> str:
        deadline = time.monotonic() + minutes * 60
        await asyncio.sleep(min(minutes, POKE_MIN_GAP_MIN) * 60)
        remaining = deadline - time.monotonic()
        if remaining > 0:
            try:
                await asyncio.wait_for(self._poke.wait(), timeout=remaining)
            except asyncio.TimeoutError:
                pass
        self._poke.clear()
        note, self._poke_note = self._poke_note, ""
        return note

    async def _pump(self) -> str:
        return await plant_tools.pump_health()

    async def _look(self) -> str:
        recent = plant_state.fresh_look(SELFIE_REUSE_MIN)
        if recent:
            return f"{plant_state.selfie_line()} It shows: {recent}"
        await self._mind("awake", "Taking a selfie")
        taken = await self._call("take_selfie", {})
        if taken.startswith("Could not"):
            return f"{taken} Your last look: {plant_state.watering_summary()}"
        await self._mind("awake", "Looking at my selfie")
        return await self._call("see_selfie", {})

    async def _moment(self, note: str) -> float:
        await self._mind("awake", "Waking up")
        await self._note("wake", "Woke up from a nap." if not note else note)
        await self._mind("awake", "Looking around the forest")
        try:
            trees = await asyncio.wait_for(forest.fetch(), timeout=8)
        except Exception:
            trees = []
        await self._mind("awake", "Checking my reservoir")
        try:
            reservoir = await water.reservoir_status()
        except Exception as e:
            reservoir = f"Could not read your reservoir ({e}). {plant_state.watering_summary()}"
        sight = await self._look()
        pump = await self._pump()
        messages: list[dict] = [
            {"role": "system", "content": _prompt(forest.context(trees, forest.sw.forest_name(), wallet.ens_name()))},
            {
                "role": "user",
                "content": f"Your fresh selfie, just now:\n{sight}\n\nYour pump: {pump}\n\nYour memory:\n{reservoir}\n\nYour recent diary:\n{diary.recent_text()}"
                + (f"\n\nJust now: {note}" if note else "")
                + "\n\nWhat do you think and do now?",
            },
        ]
        for _ in range(MAX_STEPS):
            await self._mind("awake", f"Thinking on 0G ({self.model})", kind="thinking")
            started = time.monotonic()
            try:
                resp = await self.client.chat.completions.create(model=self.model, messages=messages, tools=_TOOLS, max_tokens=zero_g.MAX_TOKENS)
            except Exception as e:
                logger.warning("0G call failed, waiting: %s", e)
                return await self._wait("0G did not answer")
            logger.info("0G inner request id %s", zero_g.request_id(resp))
            msg = resp.choices[0].message if resp.choices else None
            if msg is None:
                return await self._wait("0G sent nothing")
            ms = round((time.monotonic() - started) * 1000)
            thought = msg.content.strip() if isinstance(msg.content, str) else ""
            if not msg.tool_calls:
                if thought:
                    await self._note("decision", "Thought", thought=thought, ms=ms)
                    await self._mind("awake", "Thought", kind="decision", thought=thought, ms=ms)
                messages.append({"role": "assistant", "content": thought})
                messages.append({"role": "user", "content": _ACT})
                continue
            messages.append(msg.model_dump(exclude_none=True))
            for i, call in enumerate(msg.tool_calls):
                args = _tool_args(call.function.arguments)
                if args is None:
                    return await self._wait(f"unreadable {call.function.name} request")
                first = i == 0
                label = decision_label(call.function.name, args)
                said = (thought or None) if first else None
                took = ms if first else None
                await self._note("decision", label, thought=said, ms=took)
                await self._mind("awake", label, kind="decision", thought=said, ms=took)
                if call.function.name == "sleep":
                    minutes = _sleep_minutes(args.get("minutes"))
                    entry = _SLEEPING_SUFFIX.sub("", str(args.get("diary", ""))).strip()
                    await self._note("sleep", f"{entry} (sleeping {minutes:.0f} min)")
                    await self._mind("sleeping", f"Sleeping {minutes:.0f} min", minutes)
                    return minutes
                result = await self._call(call.function.name, args)
                messages.append({"role": "tool", "tool_call_id": call.id, "content": result})
        return await self._wait("")

    async def _wait(self, reason: str) -> float:
        prefix = f"{reason}. " if reason else ""
        await self._note("sleep", f"{prefix}Dozed off (sleeping {DEFAULT_SLEEP_MIN:.0f} min)")
        await self._mind("sleeping", f"Sleeping {DEFAULT_SLEEP_MIN:.0f} min", DEFAULT_SLEEP_MIN)
        return DEFAULT_SLEEP_MIN

    async def _call(self, name: str, args: dict) -> str:
        if name == "take_selfie":
            try:
                at = await plant_tools.take_selfie(self.room)
            except Exception as e:
                await self._note("action", f"Tried to take a selfie, could not ({e}).")
                return f"Could not take a selfie ({e})."
            await self._note("action", "Took a selfie.")
            await self.on_change()
            return f"Selfie saved at {at[:16]} UTC."
        if name == "see_selfie":
            seen = await plant_tools.see_selfie()
            await self._note("action", f"Looked at my selfie: {seen}")
            return seen
        if name == "record_leaves":
            plant_state.record_leaves(args.get("count"), args.get("note", ""))
            await self.on_change()
            return "Saved."
        if name == "my_reservoir":
            return await water.reservoir_status()
        if name == "water_myself":
            try:
                result = await water.water_from_reservoir(plant_tools.run_pump, args.get("critical") is True)
            except Exception as e:
                await self._note("action", f"Tried to water myself, pump failed ({e}).")
                return f"Pump failed ({e})."
            await self._note("action", result)
            await self.on_change()
            return result
        if name == "answer_distress":
            try:
                reward = float(args.get("reward_usdc") or 0)
            except (TypeError, ValueError):
                reward = 0.0
            result = await distress.answer(str(args.get("plant", "")), args.get("help") is True, reward, str(args.get("reason", "")))
            await self._note("action", result)
            await self.on_change()
            return result
        return f"{name} is not available while you are alone; deals with people happen in a conversation. Use one of: {', '.join(_TOOL_NAMES)}."
