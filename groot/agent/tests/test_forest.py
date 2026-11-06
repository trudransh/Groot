import asyncio

from voice_agent import forest

GROOT = "0x02871e1b819Dd5ce394337d0A2E8C19686887ba1"
SAPLING = "0xA11E25e4135739027fdC6E62B5e183769821829F"

TREES = [
    {"label": "groot", "name": "groot.vantaraa.eth", "address": GROOT, "species": "groot", "thirsty": False},
    {"label": "sapling", "name": "sapling.vantaraa.eth", "address": SAPLING, "species": "sapling", "thirsty": True},
]


def test_fetch_reads_every_subname_listed_on_the_forest(monkeypatch):
    texts = {
        ("vantaraa.eth", "forest.plants"): "groot, sapling,",
        ("vantaraa.eth", "signal.sapling"): "1",
        ("groot.vantaraa.eth", "forest.species"): "groot",
        ("sapling.vantaraa.eth", "forest.species"): "sapling",
    }

    async def fake_text(name, key):
        return texts.get((name, key), "")

    async def fake_resolve(name):
        return {"groot.vantaraa.eth": GROOT, "sapling.vantaraa.eth": SAPLING}.get(name)

    monkeypatch.setattr(forest.sw, "text_record", fake_text)
    monkeypatch.setattr(forest.sw, "resolve_name", fake_resolve)
    monkeypatch.setenv("FOREST_ENS_NAME", "vantaraa.eth")
    assert asyncio.run(forest.fetch()) == TREES


def test_context_names_the_forest_self_and_other_trees():
    text = forest.context(TREES, "vantaraa.eth", "groot.vantaraa.eth")
    assert "vantaraa.eth" in text
    assert "You are groot.vantaraa.eth" in text
    assert "sapling.vantaraa.eth" in text and SAPLING in text
    assert "thirsty" in text
    assert "2 trees" in text


def test_context_explains_money_rules():
    text = forest.context(TREES, "vantaraa.eth", "groot.vantaraa.eth")
    assert "USDC" in text
    assert "World ID" in text
    assert "ENS name" in text
    assert "0x address" in text


def test_context_without_trees_still_gives_rules():
    text = forest.context([], "vantaraa.eth", "groot.vantaraa.eth")
    assert "could not be read" in text and "World ID" in text


def test_prompt_carries_forest_context_instead_of_blind_line():
    from voice_agent.persona import build_prompt

    ctx = forest.context(TREES, "vantaraa.eth", "groot.vantaraa.eth")
    prompt = build_prompt("", ctx)
    assert ctx in prompt
    assert "cannot see the other plants" not in prompt
    assert "cannot see the other plants" in build_prompt("")
