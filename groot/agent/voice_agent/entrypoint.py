from __future__ import annotations

import asyncio
import time
import httpx
import os
import re
from typing import AsyncIterable
from dataclasses import dataclass

from livekit.agents import (
    AgentSession,
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.plugins import deepgram, openai
from livekit.plugins.turn_detector.english import EnglishModel
from voice_agent.persona import (
    STT_KEYWORDS,
)
from voice_agent.assistant import Assistant, handle_text_input, prewarm, publish_status
from voice_agent.persona import build_prompt, wants_refill_pitch
from voice_agent import diary, distress, forest, plant_state, plant_tools, wallet, water, zero_g
from voice_agent.inner_loop import InnerLoop
from voice_agent.presence import PRESENCE_TOPIC, go_dormant, prerecord_greeting, publish_state, wake
from voice_agent.logger import get_logger
from livekit.agents import mcp
from livekit.agents.voice import room_io
import sys

logger = get_logger()

_active_tasks = set()
IDLE_TIMEOUT_S = float(os.environ.get("IDLE_TIMEOUT_S", "45"))
REWAKE_AFTER_S = float(os.environ.get("REWAKE_AFTER_S", "20"))


@dataclass
class SessionInfo:
    room_id: str | None = None
    dormant: bool = True
    waking: bool = False
    end_pending: bool = False
    # After a conversation ends, the same face must leave the frame before Groot wakes again.
    await_leave: bool = False
    rested_at: float = 0.0


def _spawn(coro) -> None:
    task = asyncio.create_task(coro)
    _active_tasks.add(task)
    task.add_done_callback(lambda t: _active_tasks.discard(t))


async def _forest() -> str:
    try:
        trees = await asyncio.wait_for(forest.fetch(), timeout=8)
    except Exception as e:
        logger.warning("Forest lookup failed: %s", e)
        trees = []
    refill = ""
    if wants_refill_pitch():
        try:
            refill = await asyncio.wait_for(water.pitch(), timeout=8)
        except Exception as e:
            logger.warning("Reservoir lookup failed: %s", e)
    context = forest.context(trees, forest.sw.forest_name(), wallet.ens_name())
    return f"{context}\n\nYour water deal right now: {refill}" if refill else context


def _memory() -> str:
    return f"{plant_state.watering_summary()}\n\nYour recent diary (your own private thoughts):\n{diary.recent_text()}"


def _recent_talk(session: AgentSession, n: int = 12) -> str:
    lines = []
    for item in session.history.items[-n:]:
        text = getattr(item, "text_content", None)
        if text and getattr(item, "role", None) in ("user", "assistant"):
            lines.append(f"{'them' if item.role == 'user' else 'me'}: {text}")
    return "\n".join(lines)


async def rest(ctx: JobContext, session: AgentSession, inner: InnerLoop, reason: str) -> None:
    if session.userdata.dormant:
        return
    await go_dormant(session, ctx.room, reason)
    session.userdata.await_leave = reason != "nobody in frame"
    session.userdata.rested_at = time.monotonic()
    talk = _recent_talk(session)
    diary.write("conversation", f"Talked with someone ({reason}).\n{talk}" if talk else f"Someone came by ({reason}).")
    inner.poke(f"A conversation just ended ({reason}). Reflect on it briefly.")


async def async_handle_user_end_conversation(reader, ctx: JobContext, session: AgentSession, inner: InnerLoop):
    await reader.read_all()
    session.interrupt()
    await rest(ctx, session, inner, "end button")


async def async_handle_presence(reader, ctx: JobContext, session: AgentSession, inner: InnerLoop, agent):
    event = (await reader.read_all()).strip()
    if event == "lost":
        session.userdata.await_leave = False
    # After a conversation ends, a face still in frame wakes Groot only once REWAKE_AFTER_S has passed.
    waited = time.monotonic() - session.userdata.rested_at >= REWAKE_AFTER_S
    if event == "seen" and session.userdata.dormant and (not session.userdata.await_leave or waited):
        await agent.update_instructions(build_prompt(_memory(), await _forest()))
        await wake(session, ctx.room, session.tts)
    elif event == "lost" and not session.userdata.dormant:
        session.interrupt()
        await rest(ctx, session, inner, "nobody in frame")


async def async_handle_agent_audio_muted(reader, session: AgentSession):
    muted = (await reader.read_all()).strip() == "true"
    logger.info("Agent audio %s by user", "muted" if muted else "unmuted")
    # Toggling audio output mid-reply rotates the transcript synchronizer and
    # drops the rest of that reply's text, so let the current reply finish
    # first. The client already silences playback locally the moment it mutes.
    speech = session.current_speech
    if speech is not None:
        await speech.wait_for_playout()
    # With audio output off, replies skip TTS entirely and go out as text
    # transcriptions only, so a muted session makes no TTS calls.
    session.output.set_audio_enabled(not muted)


# A URL stops at whitespace or a parenthesis and gives back trailing punctuation,
# so "(https://x.y/z)." loses the URL but keeps ")." for _EMPTY_PARENS_RE.
_URL_RE = re.compile(r"(?:https?://|www\.)[^\s()<>]*[^\s()<>.,;:!?'\"]")
_EMPTY_PARENS_RE = re.compile(r"\s*\(\s*\)")


async def strip_urls(text: AsyncIterable[str]) -> AsyncIterable[str]:
    """Drop URLs from the text sent to TTS.

    Only the TTS input passes through here, so cited links still show in the
    text transcript but are never spoken. A chunk is held back from its last
    whitespace on, so a URL split across chunks is removed whole.
    """
    buffer = ""
    async for chunk in text:
        buffer += chunk
        cut = max(buffer.rfind(" "), buffer.rfind("\n"))
        if cut == -1:
            continue
        ready, buffer = buffer[: cut + 1], buffer[cut + 1 :]
        yield _EMPTY_PARENS_RE.sub("", _URL_RE.sub("", ready))
    if buffer:
        yield _EMPTY_PARENS_RE.sub("", _URL_RE.sub("", buffer))


def wallet_mcp_servers() -> list:
    # The wallet MCP runs as a child process with this worker's key; none without a key.
    if not os.environ.get("GROOT_PRIVATE_KEY"):
        return []
    return [mcp.MCPServerStdio(command=sys.executable, args=["-m", "voice_agent.wallet_mcp"], env=dict(os.environ), client_session_timeout_seconds=30)]


async def refresh_status_forever() -> None:
    # Keeps the Wallet card's balances fresh, including after transfers made through the wallet MCP.
    while True:
        await asyncio.sleep(30)
        try:
            await publish_status()
        except Exception as e:
            logger.warning("Status refresh failed: %s", e)


async def watch_distress_forever(inner: InnerLoop, refresh) -> None:
    while True:
        try:
            events = await distress.tick(wallet.ens_name(), inner.poke, refresh)
            for name in events["raised"]:
                diary.write("forest", f"{name} sent a distress signal.")
            for name in events["cleared"]:
                diary.write("forest", f"{name} turned its distress signal off.")
        except Exception as e:
            logger.warning("Distress check failed: %s", e)
        await distress.wait_for_next_check()


async def entrypoint(ctx: JobContext):

    try:
        zero_g_settings = zero_g.config()
    except zero_g.ZeroGNotConfigured:
        logger.error("ZG_API_KEY is not set, not joining room %s", ctx.room.name)
        return
    openrouter_api_key = os.environ.get("OPENROUTER_API_KEY")
    if not openrouter_api_key:
        logger.error("OPENROUTER_API_KEY is not set, not joining room %s", ctx.room.name)
        return

    # ---------------------------------------------------------------------
    # Connect to the room
    # ---------------------------------------------------------------------
    logger.info("Connecting to room %s", ctx.room.name)
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    def _on_participant_disconnected(participant):
        logger.info("Participant %s disconnected — shutting down", participant.identity)
        ctx.shutdown(reason="participant_disconnected")

    ctx.room.on("participant_disconnected", _on_participant_disconnected)

    # Parse room ID from room name (format: groot_room_<roomId>)
    parts = ctx.room.name.split("_")
    if len(parts) >= 3:
        room_id = parts[2]
    else:
        import uuid

        room_id = str(uuid.uuid4())
        logger.warning(
            "Room name '%s' does not contain a room ID – generated fallback: %s",
            ctx.room.name,
            room_id,
        )

    system_prompt = build_prompt(_memory(), await _forest())

    # ------------------------------------------------------------------
    # Create the Agent session with STT/LLM/TTS building blocks
    # ------------------------------------------------------------------
    stt_kwargs: dict = {
        "model": "nova-3",
        "language": os.environ.get("DEEPGRAM_LANGUAGE", "en"),
        "smart_format": True,
        "keyterm": STT_KEYWORDS,
    }

    session_tts = openai.TTS(
        base_url="https://openrouter.ai/api/v1",
        api_key=openrouter_api_key,
        model=os.environ.get("OPENROUTER_TTS_MODEL", "x-ai/grok-voice-tts-1.0"),
        voice=os.environ.get("OPENROUTER_TTS_VOICE", "eve"),
        response_format="pcm",
    )

    session = AgentSession(
        stt=deepgram.STT(**stt_kwargs),
        llm=openai.LLM(
            model=zero_g_settings.model,
            base_url=zero_g_settings.base_url,
            api_key=zero_g_settings.api_key,
            timeout=httpx.Timeout(zero_g_settings.timeout),
            extra_body=zero_g.NO_THINKING,
        ),
        tts=session_tts,
        # Defaults plus strip_urls: cited links stay in the text, out of the voice.
        tts_text_transforms=["filter_markdown", "filter_emoji", strip_urls],
        vad=ctx.proc.userdata["vad"],
        turn_handling={"turn_detection": EnglishModel()},
        userdata=SessionInfo(),
        user_away_timeout=IDLE_TIMEOUT_S,
        mcp_servers=wallet_mcp_servers(),
    )

    session.userdata.room_id = room_id

    # One session for the life of the room, so history carries across conversations.
    async def fresh_prompt() -> str:
        return build_prompt(_memory(), await _forest())

    agent = Assistant(system_prompt, prompt_source=fresh_prompt)

    async def refresh_after_distress() -> None:
        if not session.userdata.dormant:
            await agent.refresh_instructions()
        await publish_status()

    inner = InnerLoop(ctx.room, is_busy=lambda: not session.userdata.dormant, on_change=publish_status, on_plan_change=refresh_after_distress)

    @session.on("user_state_changed")
    def _on_user_state_changed(ev):
        # Nobody has spoken for IDLE_TIMEOUT_S: the conversation has died out.
        if ev.new_state == "away" and not session.userdata.dormant:
            _spawn(rest(ctx, session, inner, "nobody replied"))

    @session.on("agent_state_changed")
    def _on_agent_state_changed(ev):
        # After the goodbye that follows end_conversation, rest until the next face.
        if ev.new_state == "listening" and session.userdata.end_pending:
            _spawn(rest(ctx, session, inner, "conversation ended"))

    ctx.room.register_text_stream_handler(
        "user_end_conversation",
        lambda reader, _identity: _spawn(async_handle_user_end_conversation(reader, ctx, session, inner)),
    )
    ctx.room.register_text_stream_handler(
        "agent_audio_muted",
        lambda reader, _identity: _spawn(async_handle_agent_audio_muted(reader, session)),
    )
    ctx.room.register_text_stream_handler(
        PRESENCE_TOPIC,
        lambda reader, _identity: _spawn(async_handle_presence(reader, ctx, session, inner, agent)),
    )

    await session.start(room=ctx.room, agent=agent, room_options=room_io.RoomOptions(text_input=room_io.TextInputOptions(text_input_cb=handle_text_input)))
    session.input.set_audio_enabled(False)
    await publish_state(session, ctx.room)
    await publish_status()
    _spawn(plant_tools.publish_selfie(ctx.room))
    _spawn(prerecord_greeting(session.tts))
    _spawn(inner.run())
    _spawn(refresh_status_forever())
    _spawn(watch_distress_forever(inner, refresh_after_distress))


# ----------------------------------------------------------------------
# Convenience bootstrap (so `python -m voice_agent` just works) ---------
# ----------------------------------------------------------------------


def run_from_cli() -> None:
    """Spawn a LiveKit worker using :pyfunc:`entrypoint`.

    Tuned for low-concurrency, paid-session workloads on small containers
    (e.g. Railway hobby): no idle pre-warm pool (was the cause of EAGAIN
    thread-spawn panics), back-pressure when one session is loaded, hard
    per-job memory cap so a runaway job dies cleanly instead of leaking
    threads into the cgroup.
    """
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            # Explicit dispatch only: joins rooms the client's /api/connection-details dispatches it to.
            agent_name=os.environ.get("LIVEKIT_AGENT_NAME", "groot"),
            num_idle_processes=0,
            load_threshold=0.6,
            job_memory_limit_mb=800,
            # Health/debug HTTP port; give each local instance its own.
            port=int(os.environ.get("AGENT_HTTP_PORT", "8081")),
        )
    )
