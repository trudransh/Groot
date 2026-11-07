from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

DEFAULT_BASE_URL = "https://router-api.0g.ai/v1"
DEFAULT_MODEL = "deepseek-v4-flash"
DEFAULT_VISION_MODEL = "deepseek-v4-flash-vision-exp"
TIMEOUT_SECONDS = 20
MAX_TOKENS = 2000
NO_THINKING = {"thinking": {"type": "disabled"}}


class ZeroGNotConfigured(RuntimeError):
    pass


@dataclass(frozen=True)
class ZeroGConfig:
    api_key: str
    base_url: str
    model: str
    timeout: float = TIMEOUT_SECONDS
    vision_model: str = DEFAULT_VISION_MODEL


def config() -> ZeroGConfig:
    api_key = os.environ.get("ZG_API_KEY", "")
    if not api_key:
        raise ZeroGNotConfigured("ZG_API_KEY is not set")
    return ZeroGConfig(
        api_key=api_key,
        base_url=os.environ.get("ZG_BASE_URL") or DEFAULT_BASE_URL,
        model=os.environ.get("ZG_MODEL") or DEFAULT_MODEL,
        vision_model=os.environ.get("ZG_VISION_MODEL") or DEFAULT_VISION_MODEL,
    )


def client() -> AsyncOpenAI:
    settings = config()
    return AsyncOpenAI(base_url=settings.base_url, api_key=settings.api_key, timeout=settings.timeout, max_retries=0)


def request_id(response: Any) -> str:
    trace = getattr(response, "x_0g_trace", None)
    if trace is None:
        trace = (getattr(response, "model_extra", None) or {}).get("x_0g_trace")
    if isinstance(trace, dict) and trace.get("request_id"):
        return str(trace["request_id"])
    return str(getattr(response, "id", ""))
