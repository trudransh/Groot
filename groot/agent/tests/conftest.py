import pytest

from voice_agent import plant_tools


@pytest.fixture(autouse=True)
def plant_has_pump(monkeypatch):
    monkeypatch.setattr(plant_tools, "has_pump", lambda: True)
