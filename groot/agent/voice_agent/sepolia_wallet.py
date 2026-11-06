"""Groot's wallet on Sepolia: ETH and USDC balances and transfers, signed with GROOT_PRIVATE_KEY."""

from __future__ import annotations

import os
import re
from decimal import Decimal

import httpx
from eth_account import Account
from eth_utils import is_address, to_checksum_address

CHAIN_ID = 11155111
EXPLORER = "https://sepolia.etherscan.io"
ETH_DECIMALS = 18
# Circle's USDC on Sepolia.
USDC = {"symbol": "USDC", "address": os.environ.get("SEPOLIA_USDC_ADDRESS", "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"), "decimals": 6}


def rpc_url() -> str:
    return os.environ.get("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com")


def base_units(amount: str, decimals: int) -> int:
    m = re.fullmatch(r"(\d*)(?:\.(\d*))?", amount.strip())
    if not m or not (m.group(1) or m.group(2)):
        raise ValueError(f"{amount!r} is not an amount")
    frac = m.group(2) or ""
    if len(frac.rstrip("0")) > decimals:
        raise ValueError(f"{amount} has more than {decimals} decimals")
    value = int((m.group(1) or "0") + frac.ljust(decimals, "0")[:decimals])
    if value <= 0:
        raise ValueError("the amount must be more than 0")
    return value


def whole_units(value: int, decimals: int) -> str:
    text = format(Decimal(value) / (Decimal(10) ** decimals), "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def _word(address: str) -> str:
    return address[2:].lower().rjust(64, "0")


def transfer_data(to: str, value: int) -> str:
    return f"0xa9059cbb{_word(to)}{value:064x}"


def balance_of_data(owner: str) -> str:
    return f"0x70a08231{_word(owner)}"


def pick_token(symbol: str | None) -> dict | None:
    wanted = (symbol or "eth").strip().lower()
    if wanted == "eth":
        return None
    if wanted == "usdc":
        return USDC
    raise ValueError(f"only ETH and USDC on Sepolia, not {symbol}")


def _key() -> str:
    key = os.environ.get("GROOT_PRIVATE_KEY", "").strip()
    if not key:
        raise RuntimeError("no wallet: GROOT_PRIVATE_KEY is not set")
    return key


def own_address() -> str:
    return Account.from_key(_key()).address


async def _rpc(http: httpx.AsyncClient, method: str, params: list) -> object:
    res = await http.post(rpc_url(), json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    res.raise_for_status()
    body = res.json()
    if "error" in body:
        raise RuntimeError(f"{method}: {body['error'].get('message', body['error'])}")
    return body["result"]


async def balances(address: str | None = None) -> dict:
    owner = to_checksum_address(address) if address else own_address()
    async with httpx.AsyncClient(timeout=15) as http:
        eth = int(str(await _rpc(http, "eth_getBalance", [owner, "latest"])), 16)
        usdc = int(str(await _rpc(http, "eth_call", [{"to": USDC["address"], "data": balance_of_data(owner)}, "latest"])) or "0x0", 16)
    return {"address": owner, "ETH": whole_units(eth, ETH_DECIMALS), "USDC": whole_units(usdc, USDC["decimals"])}


async def transfer(to: str, amount: str, symbol: str = "ETH") -> dict:
    if not is_address(to):
        raise ValueError(f"{to} is not an 0x address")
    to = to_checksum_address(to)
    token = pick_token(symbol)
    value = base_units(amount, token["decimals"] if token else ETH_DECIMALS)
    account = Account.from_key(_key())
    call = {"to": to_checksum_address(token["address"]), "value": 0, "data": transfer_data(to, value)} if token else {"to": to, "value": value, "data": "0x"}
    async with httpx.AsyncClient(timeout=30) as http:
        nonce = int(str(await _rpc(http, "eth_getTransactionCount", [account.address, "pending"])), 16)
        gas = int(str(await _rpc(http, "eth_estimateGas", [{"from": account.address, "to": call["to"], "value": hex(call["value"]), "data": call["data"]}])), 16)
        block = await _rpc(http, "eth_getBlockByNumber", ["latest", False])
        tip = int(str(await _rpc(http, "eth_maxPriorityFeePerGas", [])), 16)
        base_fee = int(block["baseFeePerGas"], 16)  # type: ignore[index]
        tx = {**call, "chainId": CHAIN_ID, "nonce": nonce, "gas": gas, "maxPriorityFeePerGas": tip, "maxFeePerGas": base_fee * 2 + tip, "type": 2}
        signed = account.sign_transaction(tx)
        tx_hash = str(await _rpc(http, "eth_sendRawTransaction", ["0x" + signed.raw_transaction.hex().removeprefix("0x")]))
    return {"hash": tx_hash, "explorer": f"{EXPLORER}/tx/{tx_hash}", "sent": f"{amount} {token['symbol'] if token else 'ETH'}", "to": to}
