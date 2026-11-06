import asyncio

import pytest
from livekit.agents.voice.room_io import TextInputEvent

from voice_agent import assistant, water


@pytest.fixture
def chat(monkeypatch):
    calls = {"changes": [], "agent": []}

    async def fake_change(delta):
        calls["changes"].append(delta)
        return {"before": 100, "ml": 100 + delta}

    async def fake_default(sess, ev):
        calls["agent"].append(ev.text)

    async def no_status():
        return None

    monkeypatch.setattr(water, "change_level", fake_change)
    monkeypatch.setattr(assistant, "_default_text_input_cb", fake_default)
    monkeypatch.setattr(assistant, "publish_status", no_status)
    return calls


def send(text):
    asyncio.run(assistant.handle_text_input(object(), TextInputEvent(text=text)))


def test_level_command_skips_the_agent(chat):
    send("!-40ml")
    assert chat == {"changes": [-40], "agent": []}


def test_normal_messages_reach_the_agent(chat):
    send("hello groot, !30ml please")
    assert chat == {"changes": [], "agent": ["hello groot, !30ml please"]}


def test_failed_level_command_still_skips_the_agent(chat, monkeypatch):
    async def down(delta):
        raise RuntimeError("reservoir server down")

    monkeypatch.setattr(water, "change_level", down)
    send("!30ml")
    assert chat["agent"] == []
