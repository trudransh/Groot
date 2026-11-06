"""Dormant and awake: the room stays open, Groot sleeps until the camera sees someone looking at it."""

from __future__ import annotations

from typing import AsyncIterable

from livekit import rtc
from livekit.agents import AgentSession, tts as lk_tts

from voice_agent.logger import get_logger
from voice_agent.persona import WAKE_GREETING

logger = get_logger()

# Client -> agent: "seen" (a face looked at the camera long enough) or "lost" (nobody in frame for a while).
PRESENCE_TOPIC = "presence"
# Agent -> client: "dormant" or "awake".
STATE_TOPIC = "groot_state"

_greeting_frames: list[rtc.AudioFrame] | None = None


async def _cached_greeting(tts: lk_tts.TTS) -> list[rtc.AudioFrame]:
    global _greeting_frames
    if _greeting_frames is None:
        frames: list[rtc.AudioFrame] = []
        async with tts.synthesize(WAKE_GREETING) as stream:
            async for chunk in stream:
                frames.append(chunk.frame)
        _greeting_frames = frames
        logger.info("Recorded wake greeting: %d frames", len(frames))
    return _greeting_frames


async def _replay(frames: list[rtc.AudioFrame]) -> AsyncIterable[rtc.AudioFrame]:
    for frame in frames:
        yield frame


async def prerecord_greeting(tts: lk_tts.TTS) -> None:
    try:
        await _cached_greeting(tts)
    except Exception:
        logger.exception("Could not prerecord the wake greeting; will retry on first wake")


async def publish_state(session: AgentSession, room: rtc.Room) -> None:
    state = "dormant" if session.userdata.dormant else "awake"
    await room.local_participant.send_text(state, topic=STATE_TOPIC)


async def go_dormant(session: AgentSession, room: rtc.Room, reason: str) -> None:
    if session.userdata.dormant:
        return
    logger.info("Going dormant (%s)", reason)
    session.userdata.dormant = True
    session.userdata.end_pending = False
    session.input.set_audio_enabled(False)
    session.clear_user_turn()
    await publish_state(session, room)


async def wake(session: AgentSession, room: rtc.Room, tts: lk_tts.TTS) -> None:
    if not session.userdata.dormant or session.userdata.waking:
        return
    session.userdata.waking = True
    try:
        logger.info("Face seen, waking")
        session.userdata.dormant = False
        await publish_state(session, room)
        frames = await _cached_greeting(tts)
        handle = session.say(WAKE_GREETING, audio=_replay(frames), allow_interruptions=False)
        await handle.wait_for_playout()
        session.input.set_audio_enabled(True)
    finally:
        session.userdata.waking = False
