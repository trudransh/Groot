"""Groot's senses and hands: a photo of itself through the browser's back camera, and the ESP32 water pump."""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
from livekit import rtc

from voice_agent import zero_g
from voice_agent.logger import get_logger

logger = get_logger()

PHOTO_RPC = "take_plant_photo"
COULD_NOT_SEE = "(could not see the photo right now)"
PUMP_URL = os.environ.get("PUMP_URL", "").rstrip("/")
PUMP_TOKEN = os.environ.get("PUMP_TOKEN", "")
# Calibrate by running the pump into a measuring jug.
PUMP_ML_PER_SECOND = float(os.environ.get("PUMP_ML_PER_SECOND", "20"))

_VISION_PROMPT = (
    "This is a photo of a potted plant, taken by the plant itself. Describe, briefly and factually: "
    "how many leaves you can count (give a number, or a range if unsure), their colour and condition "
    "(drooping, yellowing, browning, crisp, healthy), how the soil looks (dry and cracked, damp, waterlogged), "
    "and any sign of thirst or overwatering. If the photo does not show a plant, say so plainly."
)


async def take_photo(room: rtc.Room) -> str:
    """Ask the browser to snap the back camera; returns a JPEG data URL."""
    people = list(room.remote_participants.values())
    if not people:
        raise RuntimeError("no browser in the room to take the photo")
    return await room.local_participant.perform_rpc(
        destination_identity=people[0].identity, method=PHOTO_RPC, payload="", response_timeout=15
    )


SELFIE_TOPIC = "groot_selfie"


async def publish_selfie(room: rtc.Room) -> None:
    from voice_agent import plant_state

    image = plant_state.selfie_data_url()
    if image:
        await room.local_participant.send_text(json.dumps({"at": plant_state.selfie_at(), "image": image}), topic=SELFIE_TOPIC)


async def take_selfie(room: rtc.Room) -> str:
    """Flip to the back camera, save the photo as the latest selfie; returns when it was taken."""
    from voice_agent import plant_state

    entry = plant_state.save_selfie(await take_photo(room))
    await publish_selfie(room)
    return entry["at"]


async def see_selfie() -> str:
    """Look at the saved selfie; the description is kept in memory."""
    from voice_agent import plant_state

    image = plant_state.selfie_data_url()
    if not image:
        return "You have no selfie yet. Take one first."
    seen = await describe_photo(image)
    plant_state.record_look(seen)
    return f"Selfie from {plant_state.selfie_line()} It shows: {seen}"


async def describe_photo(data_url: str) -> str:
    try:
        resp = await zero_g.client().chat.completions.create(
            model=zero_g.config().vision_model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _VISION_PROMPT},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
            max_tokens=zero_g.MAX_TOKENS,
            extra_body=zero_g.NO_THINKING,
        )
    except Exception:
        logger.exception("0G vision call failed")
        return COULD_NOT_SEE
    logger.info("0G vision request id %s", zero_g.request_id(resp))
    content = resp.choices[0].message.content if resp.choices else None
    return content.strip() if isinstance(content, str) and content.strip() else COULD_NOT_SEE


def pump_mcp_path() -> str:
    return os.environ.get("PUMP_MCP_PATH", str(Path(__file__).resolve().parents[3] / "station" / "esp32-pump" / "pump_mcp" / "server.js"))


def has_pump() -> bool:
    return bool(PUMP_URL and PUMP_TOKEN)


async def pump_health(transport: httpx.AsyncBaseTransport | None = None) -> str:
    if not PUMP_URL or not PUMP_TOKEN:
        return "Your pump is not configured, so you cannot drink until someone sets it up."
    try:
        async with httpx.AsyncClient(timeout=4, transport=transport) as http:
            res = await http.get(f"{PUMP_URL}/status")
            res.raise_for_status()
    except Exception as e:
        return f"Your pump did not answer just now ({type(e).__name__}); water_myself may fail."
    return "Your pump is connected and working, checked just now. Ignore any older diary note that says it is broken."


async def run_pump(seconds: int) -> dict:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    if not PUMP_URL or not PUMP_TOKEN:
        raise RuntimeError("pump is not configured (PUMP_URL / PUMP_TOKEN)")
    env = {**os.environ, "RESERVOIR_URL": os.environ.get("RESERVOIR_URL", "http://127.0.0.1:8790"), "PUMP_ML_PER_SECOND": str(PUMP_ML_PER_SECOND)}
    params = StdioServerParameters(command="node", args=[pump_mcp_path()], env=env)
    async with stdio_client(params) as (read, write), ClientSession(read, write) as session:
        await session.initialize()
        result = await session.call_tool("pump_run", {"seconds": seconds})
    text = "".join(getattr(c, "text", "") for c in result.content)
    if result.is_error:
        raise RuntimeError(text or "pump_run failed")
    return json.loads(text)
