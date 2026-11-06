from __future__ import annotations

import os

import httpx


def app_url() -> str:
    url = os.environ.get("WORLDCOIN_APP_URL", "").strip().rstrip("/")
    if not url:
        raise RuntimeError("WORLDCOIN_APP_URL is not set, so transfers outside the forest cannot be verified")
    return url


async def request(name: str, address: str, amount: str, token: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as http:
        res = await http.post(f"{app_url()}/api/transfer/request", json={"name": name, "address": address, "amount": amount, "token": token})
        res.raise_for_status()
        return res.json()


async def status(request_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as http:
        res = await http.get(f"{app_url()}/api/transfer/status", params={"id": request_id})
        res.raise_for_status()
        return res.json()


def matches(approval: dict, pending: dict) -> bool:
    return approval.get("status") == "approved" and all(approval.get(k) == pending[k] for k in ("name", "address", "amount", "token"))
