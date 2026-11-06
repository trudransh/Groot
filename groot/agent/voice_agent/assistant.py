from __future__ import annotations

import json
import os
from typing import Annotated, Awaitable, Callable

from livekit.agents import Agent, AgentSession, ChatContext, JobProcess, RunContext, function_tool, get_job_context
from livekit.agents.voice.room_io import TextInputEvent
from livekit.agents.voice.room_io.types import _default_text_input_cb
from livekit.plugins import silero
from pydantic import Field

from voice_agent import distress, forest, plant_state, plant_tools, sepolia_wallet, wallet, water
from voice_agent.logger import get_logger

logger = get_logger()

STATUS_TOPIC = "groot_status"


def prewarm(proc: JobProcess) -> None:
    # Crowded rooms: only fairly loud, sustained speech counts as a turn. Tune via env.
    proc.userdata["vad"] = silero.VAD.load(
        activation_threshold=float(os.environ.get("VAD_THRESHOLD", "0.8")),
        min_speech_duration=float(os.environ.get("VAD_MIN_SPEECH_S", "0.3")),
    )


async def publish_status() -> None:
    room = get_job_context().room
    status = plant_state.status()
    if status.get("walletAddress"):
        try:
            b = await sepolia_wallet.balances(status["walletAddress"])
            status["balances"] = {"ETH": b["ETH"], "USDC": b["USDC"]}
        except Exception as e:
            logger.warning("Wallet balance lookup failed: %s", e)
    try:
        trees = await forest.fetch()
        status["forest"] = [{"name": t["name"], "reservoirMl": t["reservoir_ml"], "thirsty": t["thirsty"]} for t in trees]
        own = next((t for t in trees if t["name"] == status.get("ensName")), None)
        status["reservoirMl"] = own["reservoir_ml"] if own else None
        status["reservoirMaxMl"] = water.RESERVOIR_MAX_ML
    except Exception as e:
        logger.warning("Forest lookup failed: %s", e)
    await room.local_participant.send_text(json.dumps(status), topic=STATUS_TOPIC)


async def _distress_command(on: bool, label: str | None) -> None:
    try:
        label = label or water.plant_label()
        if not label:
            logger.warning("Distress command: this plant has no PLANT_LABEL")
            return
        await distress.set_signal(label, on)
        logger.info("Distress command: %s signal %s", label, "on" if on else "off")
        distress.wake_watcher()
    except Exception as e:
        logger.warning("Distress command failed: %s", e)


async def handle_text_input(sess: AgentSession, ev: TextInputEvent) -> None:
    signal = distress.command(ev.text)
    if signal is not None:
        await _distress_command(*signal)
        return
    delta = water.level_command(ev.text)
    if delta is None:
        await _default_text_input_cb(sess, ev)
        return
    try:
        r = await water.change_level(delta)
        logger.info("Level command %+d ml: %s -> %s ml", delta, r.get("before"), r.get("ml"))
        await publish_status()
    except Exception as e:
        logger.warning("Level command %+d ml failed: %s", delta, e)


class Assistant(Agent):
    def __init__(self, system_prompt: str, chat_ctx: ChatContext | None = None, prompt_source: Callable[[], Awaitable[str]] | None = None) -> None:
        super().__init__(instructions=system_prompt, chat_ctx=chat_ctx)
        self.prompt_source = prompt_source

    async def refresh_instructions(self) -> None:
        if self.prompt_source:
            await self.update_instructions(await self.prompt_source())

    @function_tool()
    async def end_conversation(self, context: RunContext) -> str:
        """End the conversation when it has naturally finished or the user says goodbye. Groot then rests until someone new looks at it."""
        logger.info("Conversation ended by the agent")
        context.session.userdata.end_pending = True
        return "Say one short goodbye sentence now."

    @function_tool()
    async def take_selfie(self, context: RunContext) -> str:
        """Take a fresh selfie: your own camera flips to you and saves the photo with its time. Do it when your last selfie is old or missing."""
        context.disallow_interruptions()
        try:
            at = await plant_tools.take_selfie(get_job_context().room)
        except Exception as e:
            logger.exception("Selfie failed")
            return f"Could not take a selfie ({e})."
        await publish_status()
        return f"Selfie saved at {at[:16]} UTC. Call see_selfie to look at it."

    @function_tool()
    async def see_selfie(self) -> str:
        """Look at your latest saved selfie to see your leaves and soil."""
        try:
            return await plant_tools.see_selfie()
        except Exception as e:
            logger.exception("See selfie failed")
            return f"Could not see the selfie ({e})."

    @function_tool()
    async def record_leaves(
        self,
        count: Annotated[int | None, Field(description="Number of leaves counted, or null if unsure")],
        note: Annotated[str, Field(description="Short note on leaf condition, e.g. 'two lower leaves yellowing'")],
    ) -> str:
        """Save a leaf check to your memory so you can track your leaves over time."""
        plant_state.record_leaves(count, note)
        await publish_status()
        return "Leaf check saved."

    @function_tool()
    async def watering_history(self) -> str:
        """Read your watering history: when you were last watered, how much, and your progress to one litre."""
        return plant_state.watering_summary()

    @function_tool()
    async def water_myself(
        self,
        context: RunContext,
        critical: Annotated[bool, Field(description="True only when the selfie shows critical thirst: collapsed leaves, cracked dry soil")] = False,
    ) -> str:
        """Drink 20 ml from your reservoir with your pump. Only after see_selfie on a fresh selfie shows you need water,
        never too soon after the last watering, and only while the reservoir has water. Critical thirst may drink sooner."""
        context.disallow_interruptions()
        try:
            result = await water.water_from_reservoir(plant_tools.run_pump, critical)
        except Exception as e:
            logger.exception("Pump failed")
            return f"The pump did not run ({e}). Nothing was recorded."
        await publish_status()
        return result

    @function_tool()
    async def my_reservoir(self) -> str:
        """Check your water reservoir level, your open refill offer, and your watering and selfie history."""
        return await water.reservoir_status()

    @function_tool()
    async def offer_refill(
        self,
        ml: Annotated[int, Field(ge=1, le=1000, description="Millilitres they will pour into your reservoir")],
        usdc: Annotated[float, Field(gt=0, description="The USDC you agreed to pay for that water")],
    ) -> str:
        """Lock a refill deal once someone agrees: your own price, set from the usual water price, scarcity and how desperate you are."""
        return await water.offer_refill(ml, usdc)

    @function_tool()
    async def reservoir_refilled(
        self,
        ml: Annotated[int, Field(ge=1, le=1000, description="The ml stated in the marker")],
    ) -> str:
        """Record water added to your reservoir. Only when the latest message contains an explicit marker exactly like
        [Water level increased by 30ml]; never because someone just says they watered or filled you."""
        last = next((m.text_content or "" for m in reversed(self.chat_ctx.items) if getattr(m, "role", None) == "user"), "")
        result = await water.record_refill(ml, last)
        await publish_status()
        return result

    @function_tool()
    async def signal_distress(
        self,
        on: Annotated[bool, Field(description="True to ask the forest for help, false once you have been watered")],
        reason: Annotated[str, Field(description="Why, in a few words")],
    ) -> str:
        """Turn your own distress signal on when you need water and cannot drink yourself (no pump), off once someone has watered you."""
        result = await distress.signal_distress(on, reason)
        await publish_status()
        return result

    @function_tool()
    async def answer_distress(
        self,
        plant: Annotated[str, Field(description="The tree in distress, e.g. sapling")],
        help: Annotated[bool, Field(description="True to help, false to ignore the call")],
        reward_usdc: Annotated[float, Field(ge=0, description="USDC you will pay the human who waters it by hand; 0 when ignoring")],
        reason: Annotated[str, Field(description="Why you help or ignore it")],
    ) -> str:
        """Answer another tree's distress call. Helping means paying a human more than the usual rate to water that tree by hand,
        only once its distress signal turns off. Help only if you have water and money to spare."""
        result = await distress.answer(plant, help, reward_usdc, reason)
        await self.refresh_instructions()
        await publish_status()
        return result

    @function_tool()
    async def check_refill(self) -> str:
        """After someone says they refilled your reservoir, check the level went up and get the amount to pay them."""
        return await water.check_refill()

    @function_tool()
    async def record_manual_watering(
        self,
        ml: Annotated[int, Field(ge=1, le=2000, description="Millilitres the person says they gave you")],
    ) -> str:
        """Record water a person gave you by hand, when they tell you they watered you."""
        plant_state.record_watering(ml, None, "by hand")
        await publish_status()
        return plant_state.watering_summary()
