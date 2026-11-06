import asyncio

import httpx

from voice_agent import plant_tools


def test_pump_health_unconfigured(monkeypatch):
    monkeypatch.setattr(plant_tools, "PUMP_URL", "")
    assert "not configured" in asyncio.run(plant_tools.pump_health())


def test_pump_health_ready_overrides_old_notes(monkeypatch):
    monkeypatch.setattr(plant_tools, "PUMP_URL", "http://pump")
    monkeypatch.setattr(plant_tools, "PUMP_TOKEN", "t")
    transport = httpx.MockTransport(lambda req: httpx.Response(200, json={"pump": "off"}))
    text = asyncio.run(plant_tools.pump_health(transport))
    assert "working" in text and "ignore" in text.lower()


def test_pump_health_unreachable(monkeypatch):
    monkeypatch.setattr(plant_tools, "PUMP_URL", "http://pump")
    monkeypatch.setattr(plant_tools, "PUMP_TOKEN", "t")

    def boom(req):
        raise httpx.ConnectError("no route")

    assert "did not answer" in asyncio.run(plant_tools.pump_health(httpx.MockTransport(boom)))
