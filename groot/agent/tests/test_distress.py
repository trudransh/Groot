import asyncio

import pytest

from voice_agent import distress, plant_state

ME = "groot.vantaraa.eth"
SAPLING = "sapling.vantaraa.eth"


def tree(label, thirsty=False):
    return {"label": label, "name": f"{label}.vantaraa.eth", "address": None, "species": "", "thirsty": thirsty, "reservoir_ml": None}


@pytest.fixture
def plant(monkeypatch, tmp_path):
    monkeypatch.setattr(plant_state, "STATE_PATH", tmp_path / "plant.json")
    facts = {"reservoir": 500, "usdc": "10"}

    async def fake_level():
        return facts["reservoir"]

    async def fake_usdc():
        return facts["usdc"]

    monkeypatch.setattr(distress.water, "level", fake_level)
    monkeypatch.setattr(distress, "_usdc_balance", fake_usdc)
    return facts


@pytest.mark.parametrize(
    "text, parsed",
    [
        ("!distress on", (True, None)),
        ("!distress off", (False, None)),
        ("  !Distress ON sapling ", (True, "sapling")),
        ("!distress off sapling.vantaraa.eth", (False, "sapling")),
        ("!distress", None),
        ("!distress maybe", None),
        ("please !distress on", None),
        ("!distress on Bad_Label", None),
        (None, None),
    ],
)
def test_command(text, parsed):
    assert distress.command(text) == parsed


def test_calls_are_other_thirsty_trees_only():
    trees = [tree("groot", thirsty=True), tree("sapling", thirsty=True), tree("fern")]
    assert [t["name"] for t in distress.calls(trees, ME)] == [SAPLING]


def test_sync_reports_raised_then_cleared(plant):
    def moves(trees):
        e = distress.sync(trees, ME)
        return e["raised"], e["cleared"]

    assert moves([tree("sapling", thirsty=True)]) == ([SAPLING], [])
    assert moves([tree("sapling", thirsty=True)]) == ([], [])
    assert distress.current() == [SAPLING]
    assert moves([tree("sapling")]) == ([], [SAPLING])
    assert distress.current() == []


def test_context_always_present_and_lists_calls(plant):
    assert "No plant in your forest is in distress" in distress.context()
    distress.sync([tree("sapling", thirsty=True)], ME)
    text = distress.context()
    assert SAPLING in text and "answer_distress" in text and "no pump" in text


def test_helping_needs_spare_water_and_money_and_a_fair_reward(plant):
    distress.sync([tree("sapling", thirsty=True)], ME)
    std = distress.standard_rate()
    assert "not in distress" in asyncio.run(distress.answer("fern.vantaraa.eth", True, std * 2, "why not"))
    assert "more than the standard" in asyncio.run(distress.answer(SAPLING, True, std, "cheap"))
    assert "too much" in asyncio.run(distress.answer(SAPLING, True, std * 11, "lavish"))
    plant["reservoir"] = 100
    assert "spare" in asyncio.run(distress.answer(SAPLING, True, std * 2, "kind"))
    plant["reservoir"] = 500
    plant["usdc"] = "0.1"
    assert "USDC" in asyncio.run(distress.answer(SAPLING, True, std * 2, "kind"))
    assert distress.commitment() is None


def test_helping_changes_primary_objective_until_signal_clears(plant):
    from voice_agent import inner_loop
    from voice_agent.persona import build_prompt

    distress.sync([tree("sapling", thirsty=True)], ME)
    reply = asyncio.run(distress.answer("sapling", True, 1.5, "I have plenty"))
    assert "Committed" in reply
    assert distress.commitment()["plant"] == SAPLING
    primary = distress.primary_objective()
    assert SAPLING in primary and "1.5 USDC" in primary
    assert primary in build_prompt() and primary in inner_loop._prompt()
    assert plant_state.status()["objectives"].splitlines()[0].startswith("Get a human to water sapling")
    assert plant_state.status()["plantsInDistress"] == [SAPLING]

    distress.sync([tree("sapling")], ME)
    assert distress.commitment() is None
    assert distress.primary_objective() is None
    assert SAPLING not in build_prompt().split("Distress calls")[0]
    assert "pay" in distress.context() and "1.5 USDC" in distress.context()
    assert plant_state.status()["plantsInDistress"] == []


def test_ignoring_is_remembered_and_can_be_changed(plant):
    distress.sync([tree("sapling", thirsty=True)], ME)
    assert "Ignoring" in asyncio.run(distress.answer(SAPLING, False, 0, "my own reservoir is low"))
    assert "chose not to help" in distress.context() and "my own reservoir is low" in distress.context()
    assert distress.commitment() is None
    asyncio.run(distress.answer(SAPLING, True, 1, "changed my mind"))
    assert distress.commitment()["plant"] == SAPLING
    assert "chose not to help" not in distress.context()


def test_cleared_signal_forgets_ignore(plant):
    distress.sync([tree("sapling", thirsty=True)], ME)
    asyncio.run(distress.answer(SAPLING, False, 0, "busy"))
    distress.sync([tree("sapling")], ME)
    distress.sync([tree("sapling", thirsty=True)], ME)
    assert "chose not to help" not in distress.context()


def test_inner_loop_can_answer_distress(plant, monkeypatch):
    from voice_agent import inner_loop

    assert "answer_distress" in inner_loop._TOOL_NAMES
    distress.sync([tree("sapling", thirsty=True)], ME)
    loop = inner_loop.InnerLoop.__new__(inner_loop.InnerLoop)
    notes = []

    async def note(kind, text, **extra):
        notes.append(text)

    async def on_change():
        pass

    loop._note = note
    loop.on_change = on_change
    reply = asyncio.run(loop._call("answer_distress", {"plant": "sapling", "help": True, "reward_usdc": 1, "reason": "plenty"}))
    assert "Committed" in reply and notes
    assert inner_loop.decision_label("answer_distress", {"plant": "sapling", "help": True}) == "Decided to help sapling"
    assert inner_loop.decision_label("answer_distress", {"plant": "sapling", "help": False}) == "Decided to ignore sapling"


def test_distress_text_command_sets_signal_without_the_agent(plant, monkeypatch):
    from livekit.agents.voice.room_io import TextInputEvent

    from voice_agent import assistant, forest

    sent, agent = [], []

    async def fake_signal(label, on):
        sent.append((label, on))
        return {}

    async def fake_fetch():
        return [tree("groot"), tree("sapling")]

    async def fake_default(sess, ev):
        agent.append(ev.text)

    monkeypatch.setattr(distress, "set_signal", fake_signal)
    monkeypatch.setattr(forest, "fetch", fake_fetch)
    monkeypatch.setattr(assistant, "_default_text_input_cb", fake_default)
    monkeypatch.setenv("PLANT_LABEL", "sapling")
    asyncio.run(assistant.handle_text_input(object(), TextInputEvent(text="!distress on")))
    asyncio.run(assistant.handle_text_input(object(), TextInputEvent(text="!distress off fern")))
    assert sent == [("sapling", True), ("fern", False)] and agent == []


def test_watch_tick_wakes_inner_loop_and_refreshes_on_change(plant, monkeypatch):
    from voice_agent import forest

    trees = {"now": [tree("sapling", thirsty=True)]}

    async def fake_fetch():
        return trees["now"]

    monkeypatch.setattr(forest, "fetch", fake_fetch)
    pokes, refreshes = [], []

    async def refresh():
        refreshes.append(1)

    asyncio.run(distress.tick(ME, pokes.append, refresh))
    assert len(pokes) == 1 and SAPLING in pokes[0] and "answer_distress" in pokes[0] and refreshes == [1]
    asyncio.run(distress.tick(ME, pokes.append, refresh))
    assert len(pokes) == 1 and refreshes == [1]
    trees["now"] = [tree("sapling")]
    asyncio.run(distress.tick(ME, pokes.append, refresh))
    assert len(pokes) == 2 and "off" in pokes[1] and refreshes == [1, 1]


def test_set_signal_posts_to_reservoir_server(monkeypatch):
    calls = []

    class FakeResponse:
        status_code = 200
        headers = {"content-type": "application/json"}

        def json(self):
            return {"signal": "1"}

    class FakeClient:
        def __init__(self, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def put(self, url, json):
            calls.append((url, json))
            return FakeResponse()

    monkeypatch.setenv("RESERVOIR_URL", "http://res")
    monkeypatch.setattr(distress.httpx, "AsyncClient", FakeClient)
    asyncio.run(distress.set_signal("sapling", True))
    asyncio.run(distress.set_signal("sapling", False))
    assert calls == [("http://res/signal/sapling", {"on": True}), ("http://res/signal/sapling", {"on": False})]


@pytest.fixture
def sapling(plant, monkeypatch):
    sent = []

    async def fake_resolver(name):
        return "0x" + "cf" * 20

    async def fake_send(to, data):
        sent.append((to, data))
        return {"hash": "0xabc", "explorer": "https://sepolia.etherscan.io/tx/0xabc"}

    monkeypatch.setattr(distress.sw, "find_resolver", fake_resolver)
    monkeypatch.setattr(distress.sw, "send_call", fake_send)
    monkeypatch.setattr(distress.plant_tools, "has_pump", lambda: False)
    monkeypatch.setenv("PLANT_LABEL", "sapling")
    monkeypatch.setenv("FOREST_ENS_NAME", "vantaraa.eth")
    return sent


def test_own_signal_writes_set_text_on_forest_resolver(sapling):
    from eth_abi import decode

    asyncio.run(distress.signal_distress(True, "dry soil"))
    (to, data), = sapling
    assert to == "0x" + "cf" * 20
    assert data[:10] == "0xc7279f88"
    name, key, value = decode(["bytes", "string", "string"], bytes.fromhex(data[10:]))
    assert name == distress.sw.dns_encode("vantaraa.eth") and key == "signal.sapling" and value == "1"


def test_plant_with_pump_and_water_cannot_cry_for_help(sapling, monkeypatch):
    monkeypatch.setattr(distress.plant_tools, "has_pump", lambda: True)
    assert "pump" in asyncio.run(distress.signal_distress(True, "thirsty"))
    assert sapling == []
    assert "Signal" in asyncio.run(distress.signal_distress(False, "fine"))


def test_plant_without_pump_raises_and_clears_own_signal(sapling):
    assert "on" in asyncio.run(distress.signal_distress(True, "dry soil"))
    assert distress.own_signal() is True
    assert "Your own distress signal is on" in distress.context()
    assert "off" in asyncio.run(distress.signal_distress(False, "watered by hand"))
    assert distress.own_signal() is False


def test_sync_tracks_own_signal_and_context_coaches_pumpless_plant(sapling):
    distress.sync([tree("sapling", thirsty=True), tree("groot")], SAPLING)
    assert distress.own_signal() is True
    assert distress.current() == []
    text = distress.context()
    assert "no pump" in text and "signal_distress" in text


def test_inner_loop_offers_signal_distress():
    from voice_agent import inner_loop

    assert "signal_distress" in inner_loop._TOOL_NAMES
    assert inner_loop.decision_label("signal_distress", {"on": True}) == "Decided to send a distress signal"
    assert inner_loop.decision_label("signal_distress", {"on": False}) == "Decided to turn my distress signal off"


def test_status_reports_pump_and_own_signal(sapling):
    s = plant_state.status()
    assert s["hasPump"] is False and s["distressOn"] is False
    asyncio.run(distress.signal_distress(True, "dry"))
    assert plant_state.status()["distressOn"] is True


def test_tick_asks_to_reconsider_once_when_help_becomes_affordable(plant, monkeypatch):
    from voice_agent import forest

    async def fake_fetch():
        return [tree("sapling", thirsty=True)]

    monkeypatch.setattr(forest, "fetch", fake_fetch)
    pokes, refreshes = [], []

    async def refresh():
        refreshes.append(1)

    plant["reservoir"] = 40
    asyncio.run(distress.tick(ME, pokes.append, refresh))
    asyncio.run(distress.answer(SAPLING, False, 0, "only 40 ml"))
    pokes.clear()
    asyncio.run(distress.tick(ME, pokes.append, refresh))
    assert pokes == []
    plant["reservoir"] = 600
    asyncio.run(distress.tick(ME, pokes.append, refresh))
    assert len(pokes) == 1 and "reconsider" in pokes[0].lower() and SAPLING in pokes[0]
    asyncio.run(distress.tick(ME, pokes.append, refresh))
    assert len(pokes) == 1
    plant["reservoir"] = 40
    asyncio.run(distress.tick(ME, pokes.append, refresh))
    plant["reservoir"] = 600
    asyncio.run(distress.tick(ME, pokes.append, refresh))
    assert len(pokes) == 2


def test_tick_refreshes_when_own_signal_changes(sapling, monkeypatch):
    from voice_agent import forest

    mine = {"thirsty": True}

    async def fake_fetch():
        return [tree("sapling", thirsty=mine["thirsty"]), tree("groot")]

    monkeypatch.setattr(forest, "fetch", fake_fetch)
    pokes, refreshes = [], []

    async def refresh():
        refreshes.append(1)

    asyncio.run(distress.tick(SAPLING, pokes.append, refresh))
    assert refreshes == [1] and distress.own_signal() is True
    asyncio.run(distress.tick(SAPLING, pokes.append, refresh))
    assert refreshes == [1]
    mine["thirsty"] = False
    asyncio.run(distress.tick(SAPLING, pokes.append, refresh))
    assert refreshes == [1, 1] and distress.own_signal() is False
