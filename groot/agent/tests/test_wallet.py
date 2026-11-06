from voice_agent import wallet

# Well-known Hardhat account #0, public test key.
KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"


def test_address_from_key(monkeypatch):
    monkeypatch.setenv("GROOT_PRIVATE_KEY", KEY)
    assert wallet.address() == ADDRESS


def test_key_without_0x(monkeypatch):
    monkeypatch.setenv("GROOT_PRIVATE_KEY", KEY[2:])
    assert wallet.address() == ADDRESS


def test_missing_or_bad_key(monkeypatch):
    monkeypatch.delenv("GROOT_PRIVATE_KEY", raising=False)
    assert wallet.address() is None
    monkeypatch.setenv("GROOT_PRIVATE_KEY", "nope")
    assert wallet.address() is None


def test_ens_name(monkeypatch):
    monkeypatch.setenv("PLANT_LABEL", "sapling")
    monkeypatch.setenv("FOREST_ENS_NAME", "vantaraa.eth")
    assert wallet.ens_name() == "sapling.vantaraa.eth"
    monkeypatch.delenv("PLANT_LABEL")
    assert wallet.ens_name() is None
