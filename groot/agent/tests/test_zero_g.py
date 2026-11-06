import asyncio
import json
from types import SimpleNamespace

import httpx
import openai
import pytest

from voice_agent import zero_g


def test_config_reads_env(monkeypatch):
    monkeypatch.setenv("ZG_API_KEY", "sk-test")
    monkeypatch.setenv("ZG_BASE_URL", "https://example.test/v1")
    monkeypatch.setenv("ZG_MODEL", "some-model")
    config = zero_g.config()
    assert config.api_key == "sk-test"
    assert config.base_url == "https://example.test/v1"
    assert config.model == "some-model"


def test_config_defaults(monkeypatch):
    monkeypatch.setenv("ZG_API_KEY", "sk-test")
    monkeypatch.delenv("ZG_BASE_URL", raising=False)
    monkeypatch.delenv("ZG_MODEL", raising=False)
    config = zero_g.config()
    assert config.base_url == "https://router-api.0g.ai/v1"
    assert config.model == "qwen3-omni-flash"
    assert config.timeout == 8


def test_config_requires_key(monkeypatch):
    monkeypatch.delenv("ZG_API_KEY", raising=False)
    with pytest.raises(zero_g.ZeroGNotConfigured):
        zero_g.config()


def test_request_id_prefers_trace():
    response = SimpleNamespace(id="chatcmpl-1", x_0g_trace={"request_id": "zg-req-9"})
    assert zero_g.request_id(response) == "zg-req-9"


def test_request_id_falls_back_to_response_id():
    assert zero_g.request_id(SimpleNamespace(id="chatcmpl-1")) == "chatcmpl-1"


def test_request_id_reads_model_extra():
    response = SimpleNamespace(id="chatcmpl-1", model_extra={"x_0g_trace": {"request_id": "zg-req-7"}})
    assert zero_g.request_id(response) == "zg-req-7"


def _timeout_error():
    return openai.APITimeoutError(request=httpx.Request("POST", "https://router-api.0g.ai/v1/chat/completions"))


class FakeCompletions:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def fake_client(*outcomes):
    completions = FakeCompletions(outcomes)
    return SimpleNamespace(chat=SimpleNamespace(completions=completions)), completions


def _response(content=None, tool_calls=None):
    message = SimpleNamespace(
        content=content,
        tool_calls=tool_calls,
        model_dump=lambda exclude_none=True: {"role": "assistant", "content": content},
    )
    return SimpleNamespace(id="chatcmpl-x", choices=[SimpleNamespace(message=message)])


def _tool_call(name, arguments):
    return SimpleNamespace(id="call-1", function=SimpleNamespace(name=name, arguments=arguments))


@pytest.fixture
def inner(monkeypatch, tmp_path):
    from voice_agent import diary, inner_loop

    monkeypatch.setattr(diary, "write", lambda kind, text: None)
    monkeypatch.setattr(diary, "recent_text", lambda: "")
    monkeypatch.setattr(inner_loop.plant_state, "watering_summary", lambda: "")

    def build(client):
        loop = inner_loop.InnerLoop.__new__(inner_loop.InnerLoop)
        loop.room = None
        loop.is_busy = lambda: False
        loop.client = client
        loop.model = "qwen3-omni-flash"
        notes = []

        async def note(kind, text):
            notes.append((kind, text))

        async def on_change():
            pass

        loop._note = note
        loop.on_change = on_change
        loop.notes = notes
        return loop

    return build


def test_inner_loop_timeout_means_wait(inner):
    from voice_agent import inner_loop

    client, _ = fake_client(_timeout_error())
    loop = inner(client)
    minutes = asyncio.run(loop._moment(""))
    assert minutes == inner_loop.DEFAULT_SLEEP_MIN
    assert any(kind == "sleep" for kind, _ in loop.notes)


def test_inner_loop_unparseable_tool_args_mean_wait(inner, monkeypatch):
    from voice_agent import inner_loop

    pumped = []
    monkeypatch.setattr(inner_loop.plant_tools, "run_pump", lambda seconds: pumped.append(seconds))
    client, _ = fake_client(_response(tool_calls=[_tool_call("water_myself", "{not json")]))
    loop = inner(client)
    minutes = asyncio.run(loop._moment(""))
    assert minutes == inner_loop.DEFAULT_SLEEP_MIN
    assert pumped == []


def test_inner_loop_non_object_tool_args_mean_wait(inner, monkeypatch):
    from voice_agent import inner_loop

    pumped = []
    monkeypatch.setattr(inner_loop.plant_tools, "run_pump", lambda seconds: pumped.append(seconds))
    client, _ = fake_client(_response(tool_calls=[_tool_call("water_myself", "[5]")]))
    loop = inner(client)
    assert asyncio.run(loop._moment("")) == inner_loop.DEFAULT_SLEEP_MIN
    assert pumped == []


def test_inner_loop_sleep_minutes_validated(inner):
    from voice_agent import inner_loop

    client, _ = fake_client(_response(tool_calls=[_tool_call("sleep", json.dumps({"minutes": "lots"}))]))
    loop = inner(client)
    assert asyncio.run(loop._moment("")) == inner_loop.DEFAULT_SLEEP_MIN


def test_inner_loop_calls_zero_g_model(inner):
    client, completions = fake_client(_response(tool_calls=[_tool_call("sleep", json.dumps({"minutes": 15, "diary": "ok"}))]))
    loop = inner(client)
    assert asyncio.run(loop._moment("")) == 15
    assert completions.calls[0]["model"] == "qwen3-omni-flash"


def test_describe_photo_timeout_means_could_not_see(monkeypatch):
    from voice_agent import plant_tools

    client, _ = fake_client(_timeout_error())
    monkeypatch.setattr(plant_tools.zero_g, "client", lambda: client)
    monkeypatch.setattr(plant_tools.zero_g, "config", lambda: zero_g.ZeroGConfig("k", "u", "qwen3-omni-flash"))
    assert asyncio.run(plant_tools.describe_photo("data:image/jpeg;base64,AAAA")) == plant_tools.COULD_NOT_SEE
