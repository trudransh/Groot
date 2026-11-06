"""Groot's inner life: a long-running loop, separate from conversations, where it thinks, checks itself, waters and sleeps."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Awaitable, Callable

from livekit import rtc
from openai import AsyncOpenAI

from voice_agent import diary, plant_state, plant_tools
from voice_agent.logger import get_logger
from voice_agent.persona import NAME, OBJECTIVES, PERSONA, PLANTS_IN_DISTRESS

logger = get_logger()

DIARY_TOPIC = "groot_diary"
DEFAULT_SLEEP_MIN = float(os.environ.get("INNER_DEFAULT_SLEEP_MIN", "20"))
MAX_STEPS = 6

_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "take_selfie",
            "description": "Flip your own camera to yourself and save a fresh selfie with its time.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "see_selfie",
            "description": "Look at your latest saved selfie: leaves, soil, thirst.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
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
            "description": "Run your pump for 1-30 seconds. Only when you are actually thirsty and not watered recently.",
            "parameters": {
                "type": "object",
                "properties": {"seconds": {"type": "integer", "minimum": 1, "maximum": 30}},
                "required": ["seconds"],
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


def _prompt() -> str:
    return "\n\n".join(
        (
            f"You are {NAME}, alone with your thoughts. This is your inner voice, not a conversation: nobody hears it.",
            PERSONA.strip(),
            "Your objectives:\n" + OBJECTIVES.strip(),
            "Plants in distress:\n" + PLANTS_IN_DISTRESS.strip(),
            "Live like a person: notice how you feel, decide whether anything needs doing, do it with your tools, "
            "then sleep. You only know how you look from your selfies; your memory says when the last one was taken. "
            "Write short, honest diary lines in your tapori voice. End every moment by calling sleep.",
        )
    )


class InnerLoop:
    def __init__(self, room: rtc.Room, is_busy: Callable[[], bool], on_change: Callable[[], Awaitable[None]]) -> None:
        self.room = room
        self.is_busy = is_busy
        self.on_change = on_change
        self.client = AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"])
        self.model = os.environ.get("INNER_LLM_MODEL", os.environ.get("LLM_MODEL", "z-ai/glm-5.3-flash"))
        self._poke = asyncio.Event()
        self._poke_note = ""

    def poke(self, note: str) -> None:
        """Wake the inner loop early, e.g. right after a conversation ends."""
        self._poke_note = note
        self._poke.set()

    async def publish(self) -> None:
        await self.room.local_participant.send_text(json.dumps(diary.load()[-100:]), topic=DIARY_TOPIC)

    async def _note(self, kind: str, text: str) -> None:
        diary.write(kind, text)
        await self.publish()

    async def run(self) -> None:
        await self.publish()
        sleep_min = 0.1
        while True:
            try:
                await asyncio.wait_for(self._poke.wait(), timeout=sleep_min * 60)
            except asyncio.TimeoutError:
                pass
            self._poke.clear()
            note, self._poke_note = self._poke_note, ""
            try:
                sleep_min = await self._moment(note)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Inner loop moment failed")
                sleep_min = DEFAULT_SLEEP_MIN

    async def _moment(self, note: str) -> float:
        await self._note("wake", "Woke up from a nap." if not note else note)
        messages: list[dict] = [
            {"role": "system", "content": _prompt()},
            {
                "role": "user",
                "content": f"Your memory:\n{plant_state.watering_summary()}\n\nYour recent diary:\n{diary.recent_text()}"
                + (f"\n\nJust now: {note}" if note else "")
                + "\n\nWhat do you think and do now?",
            },
        ]
        for _ in range(MAX_STEPS):
            resp = await self.client.chat.completions.create(model=self.model, messages=messages, tools=_TOOLS, max_tokens=400)
            msg = resp.choices[0].message
            if msg.content and msg.content.strip():
                await self._note("thought", msg.content)
            if not msg.tool_calls:
                break
            messages.append(msg.model_dump(exclude_none=True))
            for call in msg.tool_calls:
                args = json.loads(call.function.arguments or "{}")
                if call.function.name == "sleep":
                    minutes = float(args.get("minutes") or DEFAULT_SLEEP_MIN)
                    await self._note("sleep", f"{args.get('diary', '').strip()} (sleeping {minutes:.0f} min)")
                    return minutes
                result = await self._call(call.function.name, args)
                messages.append({"role": "tool", "tool_call_id": call.id, "content": result})
        await self._note("sleep", f"Dozed off (sleeping {DEFAULT_SLEEP_MIN:.0f} min)")
        return DEFAULT_SLEEP_MIN

    async def _call(self, name: str, args: dict) -> str:
        if self.is_busy() and name == "water_myself":
            return "Someone is talking to you right now; do this later."
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
        if name == "water_myself":
            hours = plant_state.hours_since_last_watering()
            if hours is not None and hours < plant_state.MIN_HOURS_BETWEEN_WATERINGS:
                return f"Refused: last watered {hours:.1f} hours ago."
            seconds = int(args.get("seconds", 5))
            try:
                await plant_tools.run_pump(seconds)
            except Exception as e:
                await self._note("action", f"Tried to water myself, pump failed ({e}).")
                return f"Pump failed ({e})."
            entry = plant_state.record_watering(seconds * plant_tools.PUMP_ML_PER_SECOND, seconds, "pump")
            await self._note("action", f"Watered myself: {seconds}s, about {entry['ml']} ml.")
            await self.on_change()
            return f"Watered about {entry['ml']} ml."
        return f"Unknown tool {name}."
