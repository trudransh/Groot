"""Groot's own wallet: an address derived from GROOT_PRIVATE_KEY. The key never leaves this process."""

import os

from eth_account import Account


def address() -> str | None:
    key = os.environ.get("GROOT_PRIVATE_KEY", "").strip()
    if not key:
        return None
    try:
        return Account.from_key(key).address
    except Exception:
        return None


def ens_name() -> str | None:
    label = os.environ.get("PLANT_LABEL", "").strip().lower()
    forest = os.environ.get("FOREST_ENS_NAME", "vantaraa.eth").strip().lower()
    return f"{label}.{forest}" if label and forest else None
