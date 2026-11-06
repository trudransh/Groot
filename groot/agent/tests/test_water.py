from datetime import datetime, timedelta, timezone

import pytest

from voice_agent import water

NOW = datetime(2026, 11, 6, 18, 0, tzinfo=timezone.utc)


def ago(**kw):
    return (NOW - timedelta(**kw)).isoformat()


def state(waterings=(), looks=()):
    return {"waterings": list(waterings), "leaf_checks": [], "looks": list(looks)}


THIRSTY_LOOK = {"at": ago(minutes=5), "saw": "dry soil, drooping leaves"}


def test_watering_needs_a_fresh_selfie():
    r = water.can_water(state(), 100, NOW)
    assert not r.ok and "selfie" in r.reason
    stale = {"at": ago(hours=2), "saw": "dry"}
    assert not water.can_water(state(looks=[stale]), 100, NOW).ok


def test_watering_waits_after_recent_watering():
    s = state(waterings=[{"at": ago(hours=1), "ml": 100, "seconds": 5, "source": "pump"}], looks=[THIRSTY_LOOK])
    r = water.can_water(s, 500, NOW)
    assert not r.ok and "wait" in r.reason.lower()


def test_watering_needs_a_reservoir_with_enough_water():
    s = state(looks=[THIRSTY_LOOK])
    assert "no water reservoir" in water.can_water(s, None, NOW).reason
    assert "empty" in water.can_water(s, 0, NOW).reason
    assert "empty" in water.can_water(s, 19, NOW).reason
    assert water.can_water(s, 20, NOW).ok


def test_every_drink_is_twenty_ml(monkeypatch):
    assert water.DRINK_ML == 20
    monkeypatch.setenv("PUMP_ML_PER_SECOND", "20")
    assert water.drink_seconds() == 1
    monkeypatch.setenv("PUMP_ML_PER_SECOND", "5")
    assert water.drink_seconds() == 4
    monkeypatch.setenv("PUMP_ML_PER_SECOND", "50")
    assert water.drink_seconds() == 1
    r = water.can_water(state(looks=[THIRSTY_LOOK]), 500, NOW)
    assert r.ok and r.seconds == water.drink_seconds()


def test_market_facts_give_reference_not_a_price():
    facts = water.market_facts(level=50, hours_since_water=30, availability="scarce", base_per_litre=2.0)
    assert "2.0 USDC per litre" in facts and "scarce" in facts
    assert "50 of 1000 ml" in facts and "30" in facts
    assert "your own price" in facts.lower()


def test_offer_bounds():
    assert water.offer_error(500, 1.5, level=50, base_per_litre=2.0) is None
    assert "space" in water.offer_error(1000, 1.5, level=50, base_per_litre=2.0)
    assert "more than 0" in water.offer_error(500, 0, level=50, base_per_litre=2.0)
    assert "too much" in water.offer_error(500, 50, level=50, base_per_litre=2.0)


def test_refill_payment_only_for_water_actually_added():
    offer = {"ml": 500, "usdc": 3.0, "baseline_ml": 50}
    assert water.refill_payment(offer, 50) is None
    assert water.refill_payment(offer, 300) == {"added_ml": 250, "usdc": 1.5}
    assert water.refill_payment(offer, 1000) == {"added_ml": 500, "usdc": 3.0}


import asyncio

from voice_agent import plant_state


@pytest.fixture
def plant(monkeypatch, tmp_path):
    monkeypatch.setattr(plant_state, "STATE_PATH", tmp_path / "plant.json")
    levels = {"now": 50}

    async def fake_level():
        return levels["now"]

    monkeypatch.setattr(water, "level", fake_level)
    assert not hasattr(water, "use")
    return levels


def test_water_from_reservoir_lets_the_pump_report_the_drain(plant):
    plant_state.record_look("dry soil")
    pumped = []

    async def pump(seconds):
        pumped.append(seconds)
        return {"on": True, "reservoir": {"usedMl": 20, "before": 50, "ml": 30}}

    reply = asyncio.run(water.water_from_reservoir(pump))
    assert pumped == [water.drink_seconds()]
    assert "20 ml" in reply and "30 ml left" in reply
    assert plant_state.load()["waterings"][-1]["ml"] == 20
    assert plant_state.load()["waterings"][-1]["source"] == "reservoir"


def test_water_from_reservoir_says_when_pump_could_not_update_level(plant):
    plant_state.record_look("dry soil")

    async def pump(seconds):
        return {"on": True, "reservoir": {"usedMl": 40, "error": "reservoir unreachable"}}

    assert "could not update" in asyncio.run(water.water_from_reservoir(pump)).lower()


def test_water_from_reservoir_refuses_without_selfie(plant):
    async def pump(seconds):
        raise AssertionError("must not pump")

    assert "selfie" in asyncio.run(water.water_from_reservoir(pump))


def test_refill_offer_then_payment_only_after_reservoir_grows(plant):
    levels = plant
    assert "too much" in asyncio.run(water.offer_refill(500, 99))
    offer = asyncio.run(water.offer_refill(500, 3))
    assert "3" in offer and "USDC" in offer
    assert "not grown" in asyncio.run(water.check_refill())
    levels["now"] = 550
    paid = asyncio.run(water.check_refill())
    assert "500 ml" in paid and "3.0 USDC" in paid and "wallet_transfer" in paid
    assert "No refill offer" in asyncio.run(water.check_refill())


@pytest.mark.parametrize(
    "text,ml",
    [
        ("[Water level increased by 30ml]", 30),
        ("hey [water level increased by 250 ml] thanks", 250),
        ("I filled you with 30ml", None),
        ("Water level increased by 30ml", None),
        ("[Water level increased by 0ml]", None),
        ("[Water level increased by 5000ml]", None),
        ("", None),
    ],
)
def test_refill_marker(text, ml):
    assert water.refill_marker(text) == ml


def test_record_refill_needs_matching_marker(plant, monkeypatch):
    calls = []

    async def fake_refill(ml):
        calls.append(ml)
        return {"before": 50, "ml": 80}

    monkeypatch.setattr(water, "refill", fake_refill)
    assert "marker" in asyncio.run(water.record_refill(30, "I gave you water"))
    assert "marker" in asyncio.run(water.record_refill(30, "[Water level increased by 20ml]"))
    assert calls == []
    reply = asyncio.run(water.record_refill(30, "[Water level increased by 30ml]"))
    assert calls == [30] and "80" in reply


def test_pitch_asks_for_a_refill_with_own_price_and_payment_conditions(plant):
    text = asyncio.run(water.pitch())
    assert "950 ml" in text and "USDC" in text
    assert "ENS name" in text and "World ID" in text
    assert "fill your reservoir" in text.lower()
    assert "your own price" in text.lower()


def test_pitch_when_full_or_missing(plant):
    plant["now"] = 1000
    assert "full" in asyncio.run(water.pitch())
    plant["now"] = None
    assert "no water reservoir" in asyncio.run(water.pitch()).lower()


def test_deal_texts_say_the_plant_pays(plant):
    from voice_agent.persona import OBJECTIVES

    assert "never ask anyone to send you usdc" in OBJECTIVES.lower()
    assert "they never pay you" in asyncio.run(water.pitch())
    assert "you will pay them" in asyncio.run(water.offer_refill(10, 0.1))
    plant["now"] = 60
    assert "You now owe them" in asyncio.run(water.check_refill())


def test_drink_budget_rations_reservoir_until_next_refill():
    text = water.drink_budget(60)
    assert "3 drinks" in text and "20 ml" in text
    assert "2 days" in text and "1.5 a day" in text
    assert "0 drinks" in water.drink_budget(10)
    assert water.drink_budget(None) == ""


def test_reservoir_status_includes_drink_budget(plant):
    plant["now"] = 100
    assert "5 drinks" in asyncio.run(water.reservoir_status())


def test_peace_lily_care_is_in_both_prompts():
    from voice_agent import inner_loop
    from voice_agent.persona import PLANT_CARE, build_prompt

    assert "peace lily" in PLANT_CARE.lower()
    assert "selfie" in PLANT_CARE.lower()
    assert PLANT_CARE.strip() in build_prompt()
    assert PLANT_CARE.strip() in inner_loop._prompt()


def test_critical_thirst_overrides_normal_spacing_but_not_one_hour_floor():
    recent = {"at": ago(hours=2), "ml": 20, "seconds": 1, "source": "reservoir"}
    s = state(waterings=[recent], looks=[THIRSTY_LOOK])
    assert not water.can_water(s, 500, NOW).ok
    assert water.can_water(s, 500, NOW, critical=True).ok
    just_now = {"at": ago(minutes=30), "ml": 20, "seconds": 1, "source": "reservoir"}
    r = water.can_water(state(waterings=[just_now], looks=[THIRSTY_LOOK]), 500, NOW, critical=True)
    assert not r.ok and "wait" in r.reason.lower()


def test_critical_drink_still_needs_a_selfie_and_water():
    assert "selfie" in water.can_water(state(), 500, NOW, critical=True).reason
    assert "empty" in water.can_water(state(looks=[THIRSTY_LOOK]), 10, NOW, critical=True).reason
    assert water.can_water(state(looks=[THIRSTY_LOOK]), 20, NOW, critical=True).ok


def test_critical_drink_is_recorded(plant):
    plant_state.record_look("leaves collapsed flat, soil cracked")

    async def pump(seconds):
        return {"reservoir": {"usedMl": 20, "ml": 30}}

    reply = asyncio.run(water.water_from_reservoir(pump, critical=True))
    assert "critical" in reply.lower()
    assert plant_state.load()["waterings"][-1]["source"] == "reservoir (critical)"


def test_two_drinks_at_once_run_the_pump_only_once(plant):
    plant_state.record_look("dry soil")
    pumped = []

    async def pump(seconds):
        pumped.append(seconds)
        await asyncio.sleep(0.05)
        return {"on": True, "reservoir": {"usedMl": 20, "ml": 30}}

    async def both():
        return await asyncio.gather(water.water_from_reservoir(pump, True), water.water_from_reservoir(pump, True))

    replies = asyncio.run(both())
    assert len(pumped) == 1
    assert sum(r.startswith("Refused") for r in replies) == 1


@pytest.mark.parametrize(
    "text, delta",
    [
        ("!30ml", 30),
        ("!-30ml", -30),
        ("!+25ml", 25),
        ("  !100 ML ", 100),
        ("!1000ml", 1000),
        ("!-1000ml", -1000),
        ("!0ml", None),
        ("!1001ml", None),
        ("!30", None),
        ("30ml", None),
        ("please !30ml", None),
        ("!3.5ml", None),
        ("", None),
        (None, None),
    ],
)
def test_level_command(text, delta):
    assert water.level_command(text) == delta


def test_change_level_routes_by_sign(monkeypatch):
    calls = []

    class FakeResponse:
        status_code = 200
        headers = {"content-type": "application/json"}

        def json(self):
            return {"before": 100, "ml": 130}

    class FakeClient:
        def __init__(self, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json):
            calls.append((url, json))
            return FakeResponse()

    monkeypatch.setenv("PLANT_LABEL", "groot")
    monkeypatch.setenv("RESERVOIR_URL", "http://res")
    monkeypatch.setattr(water.httpx, "AsyncClient", FakeClient)
    asyncio.run(water.change_level(30))
    asyncio.run(water.change_level(-20))
    assert calls == [("http://res/refill/groot", {"ml": 30}), ("http://res/use/groot", {"ml": 20})]
