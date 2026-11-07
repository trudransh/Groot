import asyncio
import json
import time
from types import SimpleNamespace

import httpx
import openai
import pytest

from voice_agent import zero_g


def test_config_reads_env(monkeypatch):
    monkeypatch.setenv("ZG_API_KEY", "sk-test")
    monkeypatch.setenv("ZG_BASE_URL", "https://example.test/v1")
    monkeypatch.setenv("ZG_MODEL", "some-model")
    monkeypatch.setenv("ZG_VISION_MODEL", "some-vision-model")
    config = zero_g.config()
    assert config.api_key == "sk-test"
    assert config.base_url == "https://example.test/v1"
    assert config.model == "some-model"
    assert config.vision_model == "some-vision-model"


def test_config_defaults(monkeypatch):
    monkeypatch.setenv("ZG_API_KEY", "sk-test")
    monkeypatch.delenv("ZG_BASE_URL", raising=False)
    monkeypatch.delenv("ZG_MODEL", raising=False)
    monkeypatch.delenv("ZG_VISION_MODEL", raising=False)
    config = zero_g.config()
    assert config.base_url == "https://router-api.0g.ai/v1"
    assert config.model == "deepseek-v4-flash"
    assert config.vision_model == "deepseek-v4-flash-vision-exp"
    assert config.timeout == 20


def test_reasoning_models_get_room_to_think():
    assert zero_g.MAX_TOKENS >= 2000


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

        async def note(kind, text, **extra):
            notes.append((kind, text))
            loop.saved.append({"kind": kind, "text": text, **extra})

        loop.saved = []

        async def on_change():
            pass

        minds = []

        details = []

        async def mind(state, step, sleep_min=None, **extra):
            minds.append((state, step, sleep_min))
            details.append({"step": step, **extra})

        async def look():
            return loop.sight

        async def pump():
            return loop.pump

        loop.pump = "pump ok"
        loop._pump = pump
        loop.sight = "no selfie"
        loop._look = look
        loop._note = note
        loop._mind = mind
        loop.on_change = on_change
        loop.notes = notes
        loop.minds = minds
        loop.details = details
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


def test_inner_loop_streams_its_mind(inner):
    client, _ = fake_client(_response(tool_calls=[_tool_call("sleep", json.dumps({"minutes": 15, "diary": "ok"}))]))
    loop = inner(client)
    asyncio.run(loop._moment(""))
    steps = [step for _, step, _ in loop.minds]
    assert loop.minds[0][0] == "awake"
    assert any("Thinking" in step for step in steps)
    assert "Decided to sleep for 15 min" in steps
    assert loop.minds[-1] == ("sleeping", "Sleeping 15 min", 15)


def test_decision_carries_thought_and_zero_g_time(inner):
    client, _ = fake_client(
        _response(content="Thirsty, apun ko selfie chahiye.", tool_calls=[_tool_call("take_selfie", "{}")]),
        _response(tool_calls=[_tool_call("sleep", json.dumps({"minutes": 5}))]),
    )
    loop = inner(client)
    loop._call = lambda name, args: asyncio.sleep(0, result="ok")
    asyncio.run(loop._moment(""))
    selfie = next(d for d in loop.details if d["step"] == "Decided to take a selfie")
    assert selfie["kind"] == "decision"
    assert selfie["thought"] == "Thirsty, apun ko selfie chahiye."
    assert isinstance(selfie["ms"], int) and selfie["ms"] >= 0
    assert all(d.get("kind") == "thinking" for d in loop.details if d["step"].startswith("Thinking"))


def test_thought_without_tools_is_one_step(inner):
    client, _ = fake_client(
        _response(content="Just resting my leaves."),
        _response(tool_calls=[_tool_call("sleep", json.dumps({"minutes": 5}))]),
    )
    loop = inner(client)
    asyncio.run(loop._moment(""))
    thought = next(d for d in loop.details if d.get("thought"))
    assert thought["step"] == "Thought"
    assert thought["thought"] == "Just resting my leaves."


def test_thought_without_tools_is_pushed_to_act(inner):
    client, completions = fake_client(
        _response(content="I'm so thirsty, I need water."),
        _response(tool_calls=[_tool_call("water_myself", "{}")]),
        _response(tool_calls=[_tool_call("sleep", json.dumps({"minutes": 5}))]),
    )
    loop = inner(client)
    called = []

    async def call(name, args):
        called.append(name)
        return "ok"

    loop._call = call
    asyncio.run(loop._moment(""))
    assert called == ["water_myself"]
    assert loop.minds[-1] == ("sleeping", "Sleeping 5 min", 5)


def test_inner_loop_timeout_streams_sleeping(inner):
    from voice_agent import inner_loop

    client, _ = fake_client(_timeout_error())
    loop = inner(client)
    asyncio.run(loop._moment(""))
    assert loop.minds[-1][0] == "sleeping"
    assert loop.minds[-1][2] == inner_loop.DEFAULT_SLEEP_MIN


def test_decision_labels():
    from voice_agent.inner_loop import decision_label

    assert decision_label("water_myself", {}) == "Decided to drink 20 ml from my reservoir"
    assert decision_label("take_selfie", {}) == "Decided to take a selfie"
    assert decision_label("sleep", {"minutes": 20}) == "Decided to sleep for 20 min"
    assert decision_label("mystery", {}) == "Decided to mystery"


def test_describe_photo_timeout_means_could_not_see(monkeypatch):
    from voice_agent import plant_tools

    client, _ = fake_client(_timeout_error())
    monkeypatch.setattr(plant_tools.zero_g, "client", lambda: client)
    monkeypatch.setattr(plant_tools.zero_g, "config", lambda: zero_g.ZeroGConfig("k", "u", "qwen3-omni-flash"))
    assert asyncio.run(plant_tools.describe_photo("data:image/jpeg;base64,AAAA")) == plant_tools.COULD_NOT_SEE


def test_describe_photo_leaves_room_to_think(monkeypatch):
    from voice_agent import plant_tools

    client, completions = fake_client(_response(content="a drooping plant"))
    monkeypatch.setattr(plant_tools.zero_g, "client", lambda: client)
    monkeypatch.setattr(plant_tools.zero_g, "config", lambda: zero_g.ZeroGConfig("k", "u", "deepseek-v4-flash"))
    assert asyncio.run(plant_tools.describe_photo("data:image/jpeg;base64,AAAA")) == "a drooping plant"
    assert completions.calls[0]["max_tokens"] == zero_g.MAX_TOKENS


def test_describe_photo_uses_the_vision_model(monkeypatch):
    from voice_agent import plant_tools

    client, completions = fake_client(_response(content="a drooping plant"))
    monkeypatch.setattr(plant_tools.zero_g, "client", lambda: client)
    monkeypatch.setattr(
        plant_tools.zero_g, "config", lambda: zero_g.ZeroGConfig("k", "u", "text-only-model", vision_model="sees-images")
    )
    asyncio.run(plant_tools.describe_photo("data:image/jpeg;base64,AAAA"))
    assert completions.calls[0]["model"] == "sees-images"


def test_inner_loop_leaves_room_to_think(inner):
    client, completions = fake_client(_response(tool_calls=[_tool_call("sleep", json.dumps({"minutes": 15, "diary": "ok"}))]))
    loop = inner(client)
    asyncio.run(loop._moment(""))
    assert completions.calls[0]["max_tokens"] == zero_g.MAX_TOKENS


def test_inner_prompt_names_only_its_own_tools():
    from voice_agent import inner_loop

    prompt = inner_loop._prompt()
    assert "only in conversations" in prompt
    for name in ("water_myself", "my_reservoir", "record_leaves", "sleep"):
        assert name in prompt


def test_unknown_inner_tool_lists_the_real_ones(inner):
    client, _ = fake_client()
    loop = inner(client)
    reply = asyncio.run(loop._call("offer_refill", {}))
    assert "not available" in reply and "water_myself" in reply and "conversation" in reply


def test_moment_looks_at_a_fresh_selfie_before_asking_zero_g(inner):
    client, completions = fake_client(_response(tool_calls=[_tool_call("sleep", json.dumps({"minutes": 5}))]))
    loop = inner(client)
    loop.sight = "Leaves drooping hard, soil dry and cracked."
    asyncio.run(loop._moment(""))
    assert "Leaves drooping hard, soil dry and cracked." in completions.calls[0]["messages"][1]["content"]


def test_inner_prompt_keeps_solo_objectives_and_drink_rule():
    from voice_agent import inner_loop
    from voice_agent.persona import INNER_OBJECTIVES, OBJECTIVES

    prompt = inner_loop._prompt()
    assert OBJECTIVES.strip() not in prompt
    assert INNER_OBJECTIVES.strip() in prompt
    assert "saving water never beats staying alive" in prompt.lower()
    assert "two short sentences" in prompt.lower()


def test_inner_prompt_separates_mild_from_critical_thirst():
    from voice_agent import inner_loop

    prompt = inner_loop._prompt().lower()
    assert "critical" in prompt and "mild" in prompt and "ration" in prompt
    water_tool = next(t for t in inner_loop._TOOLS if t["function"]["name"] == "water_myself")
    assert "critical" in water_tool["function"]["parameters"]["properties"]


def test_critical_label():
    from voice_agent.inner_loop import decision_label

    assert decision_label("water_myself", {"critical": True}) == "Decided to drink 20 ml from my reservoir (critical)"


def test_inner_loop_drinks_even_while_someone_is_talking(inner, monkeypatch):
    from voice_agent import inner_loop

    drank = []

    async def fake_water(run_pump, critical=False):
        drank.append(critical)
        return "Drank 20 ml"

    monkeypatch.setattr(inner_loop.water, "water_from_reservoir", fake_water)
    client, _ = fake_client()
    loop = inner(client)
    loop.is_busy = lambda: True
    assert asyncio.run(loop._call("water_myself", {"critical": True})) == "Drank 20 ml"
    assert drank == [True]


def test_inner_loop_has_no_camera_tools():
    from voice_agent import inner_loop

    names = [t["function"]["name"] for t in inner_loop._TOOLS]
    assert "take_selfie" not in names and "see_selfie" not in names


def test_look_reuses_a_fresh_selfie_without_the_camera(inner, monkeypatch):
    from voice_agent import inner_loop

    monkeypatch.setattr(inner_loop.plant_state, "fresh_look", lambda minutes: "soil dry, leaves flat")
    loop = inner(fake_client()[0])
    calls = []

    async def call(name, args):
        calls.append(name)
        return "ok"

    loop._call = call
    assert "soil dry, leaves flat" in asyncio.run(inner_loop.InnerLoop._look(loop))
    assert calls == []


def test_look_takes_one_selfie_when_none_is_fresh(inner, monkeypatch):
    from voice_agent import inner_loop

    monkeypatch.setattr(inner_loop.plant_state, "fresh_look", lambda minutes: None)
    loop = inner(fake_client()[0])
    calls = []

    async def call(name, args):
        calls.append(name)
        return "Selfie saved." if name == "take_selfie" else "leaves drooping"

    loop._call = call
    assert asyncio.run(inner_loop.InnerLoop._look(loop)) == "leaves drooping"
    assert calls == ["take_selfie", "see_selfie"]


def test_decisions_are_saved_to_the_diary_with_thought_and_time(inner):
    client, _ = fake_client(
        _response(content="Leaves flat, drinking.", tool_calls=[_tool_call("water_myself", json.dumps({"critical": True}))]),
        _response(content="Better.", tool_calls=[_tool_call("sleep", json.dumps({"minutes": 5, "diary": "drank"}))]),
    )
    loop = inner(client)
    loop._call = lambda name, args: asyncio.sleep(0, result="ok")
    asyncio.run(loop._moment(""))
    decisions = [e for e in loop.saved if e["kind"] == "decision"]
    assert [d["text"] for d in decisions] == [
        "Decided to drink 20 ml from my reservoir (critical)",
        "Decided to sleep for 5 min",
    ]
    assert decisions[0]["thought"] == "Leaves flat, drinking." and isinstance(decisions[0]["ms"], int)
    assert not any(e["kind"] == "thought" for e in loop.saved)


def test_moment_tells_zero_g_the_live_pump_state(inner):
    client, completions = fake_client(_response(tool_calls=[_tool_call("sleep", json.dumps({"minutes": 5}))]))
    loop = inner(client)
    loop.pump = "Your pump is connected and working right now."
    asyncio.run(loop._moment(""))
    assert "Your pump is connected and working right now." in completions.calls[0]["messages"][1]["content"]


def test_poke_during_a_moment_does_not_skip_the_next_rest(monkeypatch):
    from voice_agent import inner_loop

    monkeypatch.setattr(inner_loop, "POKE_MIN_GAP_MIN", 0.002)
    loop = inner_loop.InnerLoop.__new__(inner_loop.InnerLoop)

    async def rest():
        loop._poke = asyncio.Event()
        loop._poke_note = ""
        loop.poke("A conversation just ended")
        started = time.monotonic()
        note = await asyncio.wait_for(loop._rest(5), timeout=2)
        return note, time.monotonic() - started

    note, waited = asyncio.run(rest())
    assert note == "A conversation just ended"
    assert waited >= 0.002 * 60


def test_rest_without_poke_sleeps_the_full_time(monkeypatch):
    from voice_agent import inner_loop

    monkeypatch.setattr(inner_loop, "POKE_MIN_GAP_MIN", 0.001)
    loop = inner_loop.InnerLoop.__new__(inner_loop.InnerLoop)

    async def rest():
        loop._poke = asyncio.Event()
        loop._poke_note = ""
        started = time.monotonic()
        note = await loop._rest(0.003)
        return note, time.monotonic() - started

    note, waited = asyncio.run(rest())
    assert note == ""
    assert waited >= 0.003 * 60 - 0.01


def test_sleep_diary_carries_one_sleeping_suffix(inner):
    client, _ = fake_client(_response(tool_calls=[_tool_call("sleep", '{"minutes": 15, "diary": "Still thirsty. (sleeping 15 min) (sleeping 15 min)"}')]))
    loop = inner(client)
    asyncio.run(loop._moment(""))
    sleeps = [text for kind, text in loop.notes if kind == "sleep"]
    assert sleeps == ["Still thirsty. (sleeping 15 min)"]


def test_every_call_skips_thinking():
    assert zero_g.NO_THINKING == {"thinking": {"type": "disabled"}}


def test_inner_loop_skips_thinking(inner):
    client, completions = fake_client(_response(tool_calls=[_tool_call("sleep", json.dumps({"minutes": 15, "diary": "ok"}))]))
    loop = inner(client)
    asyncio.run(loop._moment(""))
    assert completions.calls[0]["extra_body"] == zero_g.NO_THINKING


def test_describe_photo_skips_thinking(monkeypatch):
    from voice_agent import plant_tools

    client, completions = fake_client(_response(content="a drooping plant"))
    monkeypatch.setattr(plant_tools.zero_g, "client", lambda: client)
    monkeypatch.setattr(plant_tools.zero_g, "config", lambda: zero_g.ZeroGConfig("k", "u", "deepseek-v4-flash"))
    asyncio.run(plant_tools.describe_photo("data:image/jpeg;base64,AAAA"))
    assert completions.calls[0]["extra_body"] == zero_g.NO_THINKING
