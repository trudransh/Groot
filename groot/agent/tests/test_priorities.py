import asyncio

import pytest

from voice_agent import distress, inner_loop, persona, plant_state, plant_tools

SAPLING = "sapling.vantaraa.eth"


@pytest.fixture
def state(monkeypatch, tmp_path):
    monkeypatch.setattr(plant_state, "STATE_PATH", tmp_path / "plant.json")


@pytest.fixture
def no_pump(monkeypatch, state):
    monkeypatch.setattr(plant_tools, "has_pump", lambda: False)


@pytest.fixture
def helping(state):
    distress.sync([{"label": "sapling", "name": SAPLING, "thirsty": True}], "groot.vantaraa.eth")
    d = plant_state.load()["distress"]
    d["help"] = {"plant": SAPLING, "usdc": 0.6, "reason": "spare", "at": "2026-11-07T00:00:00+00:00"}
    s = plant_state.load()
    s["distress"] = d
    plant_state._save(s)


def test_groot_buys_its_own_water_when_nobody_needs_help(state):
    prompt = persona.build_prompt()
    assert "ask the person to fill it" in prompt
    assert persona.wants_refill_pitch() is True


def test_committed_groot_asks_for_the_other_tree_first(helping):
    prompt = persona.build_prompt()
    assert "ask the person to fill it" not in prompt
    assert "water sapling" in prompt and "0.6 USDC" in prompt
    assert "before" in persona.water_rule().lower() and "own reservoir" in persona.water_rule()
    assert persona.wants_refill_pitch() is False


def test_distress_comes_before_own_refill_when_water_to_spare(state):
    distress.sync([{"label": "sapling", "name": SAPLING, "thirsty": True}], "groot.vantaraa.eth")
    assert "comes before buying water for yourself" in distress.context()


def test_pumpless_plant_asks_for_help_and_never_offers_money(no_pump):
    prompt = persona.build_prompt()
    assert persona.OBJECTIVES.strip() not in prompt
    assert "ask the person to fill it" not in prompt
    assert "never offer money" in prompt.lower()
    assert "water you by hand" in prompt
    assert persona.wants_refill_pitch() is False


def test_pumpless_inner_loop_raises_signal_instead_of_drinking(no_pump):
    prompt = inner_loop._prompt()
    assert persona.INNER_OBJECTIVES.strip() not in prompt
    assert "signal_distress" in prompt
    assert "call water_myself" not in prompt
    assert "water_myself" not in inner_loop.act_hint()


def test_pumpless_sticky_note(no_pump, monkeypatch):
    note = plant_state.status()["objectives"]
    assert "water me by hand" in note and "Pay humans" not in note


def test_pumpless_plant_cannot_make_a_paid_refill_offer(no_pump):
    from voice_agent import water

    reply = asyncio.run(water.offer_refill(200, 1))
    assert "never pay" in reply and plant_state.refill_offer() is None
