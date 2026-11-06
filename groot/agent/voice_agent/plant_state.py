"""Groot's memory of its own body: every watering and every leaf check, kept in a JSON file across restarts."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

STATE_PATH = Path(os.environ.get("PLANT_STATE_PATH", Path(__file__).resolve().parent.parent / "state" / "plant.json"))

# Never water again sooner than this after the last watering.
MIN_HOURS_BETWEEN_WATERINGS = float(os.environ.get("MIN_HOURS_BETWEEN_WATERINGS", "6"))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def load() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"waterings": [], "leaf_checks": [], "looks": []}


def _save(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2))


def record_watering(ml: float | None, seconds: int | None, source: str) -> dict:
    state = load()
    entry = {"at": _now().isoformat(), "ml": round(ml) if ml else None, "seconds": seconds, "source": source}
    state["waterings"].append(entry)
    _save(state)
    return entry


def set_refill_offer(offer: dict | None) -> None:
    state = load()
    state["refill_offer"] = {**offer, "at": _now().isoformat()} if offer else None
    _save(state)


def refill_offer() -> dict | None:
    return load().get("refill_offer")


def record_leaves(count: int | None, note: str) -> dict:
    state = load()
    entry = {"at": _now().isoformat(), "count": count, "note": note}
    state["leaf_checks"].append(entry)
    _save(state)
    return entry


def record_look(description: str) -> dict:
    state = load()
    entry = {"at": _now().isoformat(), "saw": description}
    state.setdefault("looks", []).append(entry)
    _save(state)
    return entry


SELFIE_PATH = STATE_PATH.parent / "selfie.jpg"


def save_selfie(data_url: str) -> dict:
    import base64

    SELFIE_PATH.parent.mkdir(parents=True, exist_ok=True)
    SELFIE_PATH.write_bytes(base64.b64decode(data_url.split(",", 1)[1]))
    state = load()
    state["selfie"] = {"at": _now().isoformat()}
    _save(state)
    return state["selfie"]


def selfie_data_url() -> str | None:
    import base64

    if not SELFIE_PATH.exists():
        return None
    return "data:image/jpeg;base64," + base64.b64encode(SELFIE_PATH.read_bytes()).decode()


def selfie_at() -> str | None:
    return (load().get("selfie") or {}).get("at")


def fresh_look(max_minutes: float) -> str | None:
    at = selfie_at()
    looks = load().get("looks", [])
    if not at or not looks:
        return None
    age_min = (_now() - datetime.fromisoformat(at)).total_seconds() / 60
    if not 0 <= age_min <= max_minutes or looks[-1]["at"] < at:
        return None
    return looks[-1]["saw"]


def selfie_line() -> str:
    at = selfie_at()
    return f"Last selfie taken {_ago(at)} (at {at[:16]} UTC)." if at else "You have never taken a selfie."


def _ago(iso: str) -> str:
    hours = (_now() - datetime.fromisoformat(iso)).total_seconds() / 3600
    return f"{hours * 60:.0f} minutes ago" if hours < 1 else f"{hours:.1f} hours ago"


def hours_since_last_watering(state: dict | None = None) -> float | None:
    state = state or load()
    if not state["waterings"]:
        return None
    last = datetime.fromisoformat(state["waterings"][-1]["at"])
    return (_now() - last).total_seconds() / 3600


def total_water_ml(state: dict | None = None) -> int:
    state = state or load()
    return sum(w["ml"] or 0 for w in state["waterings"])


def watering_summary() -> str:
    state = load()
    hours = hours_since_last_watering(state)
    if hours is None:
        last = "You have never been watered (no record)."
    else:
        w = state["waterings"][-1]
        amount = f"{w['ml']} ml" if w["ml"] else "amount unknown"
        last = f"Last watered {_ago(w['at'])} ({amount}, {w['source']}, at {w['at']} UTC)."
    wait = ""
    if hours is not None and hours < MIN_HOURS_BETWEEN_WATERINGS:
        wait = f" Do not water again for another {MIN_HOURS_BETWEEN_WATERINGS - hours:.1f} hours."
    recent = ", ".join(f"{w['at'][:16]} {w['ml'] or '?'}ml" for w in state["waterings"][-5:]) or "none"
    leaves = state["leaf_checks"][-1] if state["leaf_checks"] else None
    leaf = f" Last leaf check {_ago(leaves['at'])}: {leaves['count']} leaves, {leaves['note']}." if leaves else ""
    looks = state.get("looks", [])
    look = f" Last time you saw your selfie ({_ago(looks[-1]['at'])}): {looks[-1]['saw']}" if looks else ""
    return (
        f"{last}{wait} Total water received so far: {total_water_ml(state)} ml. "
        f"Recent waterings: {recent}.{leaf} {selfie_line()}{look}"
    )


TOOL_NAMES = ["take_selfie", "see_selfie", "record_leaves", "watering_history", "my_reservoir", "water_myself", "offer_refill", "reservoir_refilled", "check_refill", "record_manual_watering", "answer_distress", "sleep"]


def status() -> dict:
    from voice_agent import distress, wallet
    from voice_agent.persona import OBJECTIVES_NOTE

    state = load()
    last_leaf = state["leaf_checks"][-1] if state["leaf_checks"] else None
    return {
        "objectives": "\n".join(x for x in (distress.objective_note(), OBJECTIVES_NOTE.strip()) if x),
        "plantsInDistress": distress.current(),
        "lastWateredAt": state["waterings"][-1]["at"] if state["waterings"] else None,
        "waterMl": total_water_ml(state),
        "leafCount": last_leaf["count"] if last_leaf else None,
        "selfieAt": selfie_at(),
        "tools": TOOL_NAMES,
        "walletAddress": wallet.address(),
        "ensName": wallet.ens_name(),
    }
