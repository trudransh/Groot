from voice_agent import diary


def test_diary_keeps_decision_extras(monkeypatch, tmp_path):
    monkeypatch.setattr(diary, "DIARY_PATH", tmp_path / "diary.json")
    diary.write("decision", "Decided to sleep for 5 min", thought="tired", ms=1200)
    diary.write("wake", "Woke up.")
    entries = diary.load()
    assert entries[0]["thought"] == "tired" and entries[0]["ms"] == 1200
    assert "thought" not in entries[1]
