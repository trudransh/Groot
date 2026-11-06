from datetime import datetime, timedelta, timezone

from voice_agent import plant_state


def test_fresh_look_only_for_a_recent_selfie_that_was_seen(monkeypatch, tmp_path):
    monkeypatch.setattr(plant_state, "STATE_PATH", tmp_path / "plant.json")
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(plant_state, "selfie_at", lambda: (now - timedelta(minutes=3)).isoformat())
    assert plant_state.fresh_look(10) is None
    plant_state.record_look("soil dry")
    assert plant_state.fresh_look(10) == "soil dry"
    monkeypatch.setattr(plant_state, "selfie_at", lambda: (now - timedelta(minutes=30)).isoformat())
    assert plant_state.fresh_look(10) is None
    monkeypatch.setattr(plant_state, "selfie_at", lambda: (now + timedelta(minutes=1)).isoformat())
    assert plant_state.fresh_look(10) is None
