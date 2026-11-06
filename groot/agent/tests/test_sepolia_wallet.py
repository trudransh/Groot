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
