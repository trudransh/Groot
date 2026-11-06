from __future__ import annotations

import json
import os
from typing import Annotated

from livekit.agents import Agent, ChatContext, JobProcess, RunContext, function_tool, get_job_context
from livekit.plugins import silero
from pydantic import Field

from voice_agent import plant_state, plant_tools
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
    await room.local_participant.send_text(json.dumps(plant_state.status()), topic=STATUS_TOPIC)


class Assistant(Agent):
    def __init__(self, system_prompt: str, chat_ctx: ChatContext | None = None) -> None:
        super().__init__(instructions=system_prompt, chat_ctx=chat_ctx)

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
        seconds: Annotated[int, Field(ge=1, le=30, description="How long to run the pump, 1-30 seconds")],
    ) -> str:
        """Run your water pump to water yourself. Only when the soil is dry or leaves show thirst, and never too soon after the last watering."""
        hours = plant_state.hours_since_last_watering()
        if hours is not None and hours < plant_state.MIN_HOURS_BETWEEN_WATERINGS:
            return f"Refused: last watered {hours:.1f} hours ago. {plant_state.watering_summary()}"
        context.disallow_interruptions()
        try:
            await plant_tools.run_pump(seconds)
        except Exception as e:
            logger.exception("Pump failed")
            return f"The pump did not run ({e}). Nothing was recorded."
        entry = plant_state.record_watering(seconds * plant_tools.PUMP_ML_PER_SECOND, seconds, "pump")
        await publish_status()
        return f"Pump ran {seconds}s, about {entry['ml']} ml. {plant_state.watering_summary()}"

    @function_tool()
    async def record_manual_watering(
        self,
        ml: Annotated[int, Field(ge=1, le=2000, description="Millilitres the person says they gave you")],
    ) -> str:
        """Record water a person gave you by hand, when they tell you they watered you."""
        plant_state.record_watering(ml, None, "by hand")
        await publish_status()
        return plant_state.watering_summary()
