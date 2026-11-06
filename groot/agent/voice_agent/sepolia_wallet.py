"""Groot's wallet on Sepolia: ETH and USDC balances and transfers, signed with GROOT_PRIVATE_KEY."""

from __future__ import annotations

import os
import re
from decimal import Decimal

import httpx
from eth_abi import decode, encode
from eth_account import Account
from eth_utils import keccak, to_checksum_address

CHAIN_ID = 11155111
ZERO_G_CHAIN_ID = 16661
ETH_COIN_TYPE = 60
RESOLVE_SELECTOR = keccak(text="resolve(bytes,bytes)")[:4]
ADDR_SELECTOR = keccak(text="addr(bytes32,uint256)")[:4]
_LABEL = re.compile(r"[a-z0-9-]+")
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


async def _rpc(http: httpx.AsyncClient, method: str, params: list, url: str | None = None) -> object:
    res = await http.post(url or rpc_url(), json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
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


def universal_resolver() -> str:
    return os.environ.get("SEPOLIA_ENS_UNIVERSAL_RESOLVER", "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe")


def forest_name() -> str:
    return os.environ.get("FOREST_ENS_NAME", "vantaraa.eth").strip().lower()


def normalize_name(name: str) -> str:
    n = name.strip().lower().rstrip(".")
    labels = n.split(".")
    if n.startswith("0x") or len(labels) < 2 or not all(_LABEL.fullmatch(label) for label in labels):
        raise ValueError(f"{name!r} is not an ENS name. Transfers go only to ENS names, never raw addresses.")
    return n


def namehash(name: str) -> bytes:
    node = b"\0" * 32
    for label in reversed(name.split(".")) if name else []:
        node = keccak(node + keccak(text=label))
    return node


def dns_encode(name: str) -> bytes:
    return b"".join(bytes([len(label)]) + label.encode() for label in name.split(".")) + b"\0"


def in_forest(name: str) -> bool:
    return name.endswith("." + forest_name())


def coin_type(chain_id: int) -> int:
    return 0x80000000 | chain_id


def mainnet_rpc_url() -> str:
    return os.environ.get("ENS_MAINNET_RPC_URL", "https://ethereum-rpc.publicnode.com")


async def resolve_name(name: str) -> str | None:
    address = await _resolve_on(rpc_url(), name)
    if address or in_forest(name):
        return address
    return await _resolve_on(mainnet_rpc_url(), name)


async def _resolve_on(rpc: str, name: str) -> str | None:
    async with httpx.AsyncClient(timeout=15) as http:
        for coin in (coin_type(CHAIN_ID), ETH_COIN_TYPE, coin_type(ZERO_G_CHAIN_ID)):
            query = ADDR_SELECTOR + encode(["bytes32", "uint256"], [namehash(name), coin])
            call = RESOLVE_SELECTOR + encode(["bytes", "bytes"], [dns_encode(name), query])
            try:
                out = str(await _rpc(http, "eth_call", [{"to": universal_resolver(), "data": "0x" + call.hex()}, "latest"], rpc))
                result, _ = decode(["bytes", "address"], bytes.fromhex(out.removeprefix("0x")))
                (raw,) = decode(["bytes"], result)
            except Exception:
                continue
            if len(raw) == 20 and any(raw):
                return to_checksum_address(raw)
    return None


async def transfer(to_name: str, amount: str, *, verified_address: str | None = None) -> dict:
    name = normalize_name(to_name)
    address = await resolve_name(name)
    if not address:
        raise ValueError(f"{name} has no wallet address set")
    if address == own_address():
        raise ValueError(f"{name} is your own wallet")
    if not in_forest(name):
        if verified_address is None:
            raise PermissionError(f"{name} is outside the {forest_name()} forest. Its owner must verify with World ID first.")
        if to_checksum_address(verified_address) != address:
            raise PermissionError(f"{name} now points to a different address than the one verified with World ID. Nothing was sent.")
    return {**await _send(address, amount), "to": name, "address": address}


async def _send(to: str, amount: str) -> dict:
    token = USDC
    value = base_units(amount, token["decimals"])
    account = Account.from_key(_key())
    call = {"to": to_checksum_address(token["address"]), "value": 0, "data": transfer_data(to, value)}
    async with httpx.AsyncClient(timeout=30) as http:
        nonce = int(str(await _rpc(http, "eth_getTransactionCount", [account.address, "pending"])), 16)
        gas = int(str(await _rpc(http, "eth_estimateGas", [{"from": account.address, "to": call["to"], "value": hex(call["value"]), "data": call["data"]}])), 16)
        block = await _rpc(http, "eth_getBlockByNumber", ["latest", False])
        tip = int(str(await _rpc(http, "eth_maxPriorityFeePerGas", [])), 16)
        base_fee = int(block["baseFeePerGas"], 16)  # type: ignore[index]
        tx = {**call, "chainId": CHAIN_ID, "nonce": nonce, "gas": gas, "maxPriorityFeePerGas": tip, "maxFeePerGas": base_fee * 2 + tip, "type": 2}
        signed = account.sign_transaction(tx)
        tx_hash = str(await _rpc(http, "eth_sendRawTransaction", ["0x" + signed.raw_transaction.hex().removeprefix("0x")]))
    return {"hash": tx_hash, "explorer": f"{EXPLORER}/tx/{tx_hash}", "sent": f"{amount} USDC", "to": to}
