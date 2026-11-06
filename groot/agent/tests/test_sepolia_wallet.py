import asyncio

import pytest

from voice_agent import sepolia_wallet as sw


def test_base_units():
    assert sw.base_units("1", 6) == 1_000_000
    assert sw.base_units("0.5", 6) == 500_000
    assert sw.base_units(".25", 18) == 250_000_000_000_000_000


@pytest.mark.parametrize("bad", ["", "abc", "0", "-1", "1.1234567", "1e3"])
def test_base_units_rejects(bad):
    with pytest.raises(ValueError):
        sw.base_units(bad, 6)


def test_whole_units():
    assert sw.whole_units(1_500_000, 6) == "1.5"
    assert sw.whole_units(0, 18) == "0"
    assert sw.whole_units(10**18, 18) == "1"


def test_erc20_calls():
    to = "0x" + "ab" * 20
    assert sw.transfer_data(to, 5) == "0xa9059cbb" + "00" * 12 + "ab" * 20 + f"{5:064x}"
    assert sw.balance_of_data(to) == "0x70a08231" + "00" * 12 + "ab" * 20


def test_pick_token():
    assert sw.pick_token("eth") is None
    assert sw.pick_token("USDC")["decimals"] == 6
    with pytest.raises(ValueError):
        sw.pick_token("doge")


def test_namehash_matches_ens_vectors():
    assert sw.namehash("eth").hex() == "93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae"
    assert sw.namehash("foo.eth").hex() == "de9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f"


def test_dns_encode():
    assert sw.dns_encode("banyan-01.vantaraa.eth") == b"\x09banyan-01\x08vantaraa\x03eth\x00"


@pytest.mark.parametrize("raw", ["0x" + "ab" * 20, "0xAbC", "ab" * 20, "", "eth", "bad name.eth", "x..eth"])
def test_transfer_names_reject_raw_addresses_and_junk(raw):
    with pytest.raises(ValueError):
        sw.normalize_name(raw)


def test_normalize_name():
    assert sw.normalize_name(" Tulsi-04.Vantaraa.ETH. ") == "tulsi-04.vantaraa.eth"


def test_in_forest(monkeypatch):
    monkeypatch.setenv("FOREST_ENS_NAME", "vantaraa.eth")
    assert sw.in_forest("tulsi-04.vantaraa.eth")
    assert not sw.in_forest("vantaraa.eth")
    assert not sw.in_forest("alice.eth")
    assert not sw.in_forest("evilvantaraa.eth")
    assert not sw.in_forest("tulsi.vantaraa.eth.evil.eth")


KEY = "0x" + "11" * 32
SOMEONE = "0x" + "22" * 20


async def _no_send(*args, **kwargs):
    raise AssertionError("must not send")


@pytest.fixture
def wallet(monkeypatch):
    monkeypatch.setenv("GROOT_PRIVATE_KEY", KEY)
    monkeypatch.setenv("FOREST_ENS_NAME", "vantaraa.eth")
    sent = []

    async def fake_send(address, amount, symbol):
        sent.append((address, amount, symbol))
        return {"hash": "0xh", "explorer": "x", "sent": f"{amount} {symbol}", "to": address}

    async def fake_resolve(name):
        return {"tulsi-04.vantaraa.eth": SOMEONE, "alice.eth": SOMEONE}.get(name)

    monkeypatch.setattr(sw, "_send", fake_send)
    monkeypatch.setattr(sw, "resolve_name", fake_resolve)
    return sent


def test_transfer_to_forest_plant_needs_no_verification(wallet):
    r = asyncio.run(sw.transfer("tulsi-04.vantaraa.eth", "1", "USDC"))
    assert wallet == [(SOMEONE, "1", "USDC")]
    assert r["to"] == "tulsi-04.vantaraa.eth"


def test_transfer_outside_forest_needs_world_id(wallet):
    with pytest.raises(PermissionError):
        asyncio.run(sw.transfer("alice.eth", "1", "USDC"))
    assert wallet == []


def test_transfer_outside_forest_with_matching_verification(wallet):
    asyncio.run(sw.transfer("alice.eth", "1", "USDC", verified_address=SOMEONE))
    assert wallet == [(SOMEONE, "1", "USDC")]


def test_transfer_refuses_when_name_moved_after_verification(wallet):
    with pytest.raises(PermissionError):
        asyncio.run(sw.transfer("alice.eth", "1", "USDC", verified_address="0x" + "33" * 20))
    assert wallet == []


def test_transfer_refuses_raw_address(wallet):
    with pytest.raises(ValueError):
        asyncio.run(sw.transfer(SOMEONE, "1", "ETH", verified_address=SOMEONE))
    assert wallet == []


def test_transfer_refuses_unresolved_name(wallet):
    with pytest.raises(ValueError):
        asyncio.run(sw.transfer("ghost.vantaraa.eth", "1", "ETH"))
    assert wallet == []


def test_world_approval_matches_only_exact_approved_request():
    from voice_agent import world_approval as wa

    pending = {"name": "alice.eth", "address": SOMEONE, "amount": "1", "token": "USDC"}
    assert wa.matches({**pending, "status": "approved"}, pending)
    assert not wa.matches({**pending, "status": "pending"}, pending)
    assert not wa.matches({**pending, "status": "approved", "amount": "100"}, pending)
    assert not wa.matches({**pending, "status": "approved", "address": "0x" + "33" * 20}, pending)
