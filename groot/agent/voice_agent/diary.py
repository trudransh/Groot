"""Groot's diary: what its inner loop thought and did, kept in a JSON file across restarts."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

DIARY_PATH = Path(os.environ.get("DIARY_PATH", Path(__file__).resolve().parent.parent / "state" / "diary.json"))
KEEP = 500


def load() -> list[dict]:
    if DIARY_PATH.exists():
        return json.loads(DIARY_PATH.read_text())
    return []


def write(kind: str, text: str) -> dict:
    """kind: thought, action, sleep, wake or conversation."""
    entries = load()
    entry = {"at": datetime.now(timezone.utc).isoformat(), "kind": kind, "text": text.strip()}
    entries.append(entry)
    DIARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    DIARY_PATH.write_text(json.dumps(entries[-KEEP:], indent=2))
    return entry


def recent_text(n: int = 8) -> str:
    return "\n".join(f"{e['at'][:16]} [{e['kind']}] {e['text']}" for e in load()[-n:]) or "(empty)"
