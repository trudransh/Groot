from __future__ import annotations

import asyncio

from voice_agent import sepolia_wallet as sw

PLANTS_KEY = "forest.plants"
THIRSTY = "1"
RESERVOIR_MAX_ML = 1000


def parse_reservoir(value: str) -> int | None:
    v = value.strip()
    if not v.isdigit():
        return None
    ml = int(v)
    return ml if ml <= RESERVOIR_MAX_ML else None


async def _tree(forest_name: str, label: str) -> dict:
    name = f"{label}.{forest_name}"
    address, species, signal, reservoir = await asyncio.gather(
        sw.resolve_name(name),
        sw.text_record(name, "forest.species"),
        sw.text_record(forest_name, f"signal.{label}"),
        sw.text_record(forest_name, f"reservoir.{label}"),
    )
    return {"label": label, "name": name, "address": address, "species": species, "thirsty": signal == THIRSTY, "reservoir_ml": parse_reservoir(reservoir)}


async def fetch() -> list[dict]:
    forest_name = sw.forest_name()
    labels = [label.strip().lower() for label in (await sw.text_record(forest_name, PLANTS_KEY)).split(",") if label.strip()]
    return list(await asyncio.gather(*(_tree(forest_name, label) for label in labels)))


def _line(tree: dict, own_name: str | None) -> str:
    who = "you" if tree["name"] == own_name else "another tree"
    species = f", species {tree['species']}" if tree["species"] else ""
    wallet = f", wallet {tree['address']}" if tree["address"] else ", no wallet set yet"
    ml = tree.get("reservoir_ml")
    reservoir = f", water reservoir at {ml} of {RESERVOIR_MAX_ML} ml" if ml is not None else ", no water reservoir"
    state = ", signalling it is thirsty and needs help" if tree["thirsty"] else ""
    return f"- {tree['name']} ({who}{species}{wallet}{reservoir}{state})"


def context(trees: list[dict], forest_name: str, own_name: str | None) -> str:
    me = f"You are {own_name}, a tree in it. " if own_name else ""
    if trees:
        listing = f"The forest has {len(trees)} trees, one for each subname of {forest_name}:\n" + "\n".join(_line(t, own_name) for t in trees)
    else:
        listing = f"The list of trees in {forest_name} could not be read right now, so do not name any other trees."
    reservoirs = (
        "Each tree may have a water reservoir that feeds its pump, set by the forest admin. "
        "A low or missing reservoir means that tree will soon need water or money for water, so mention it when it matters."
    )
    rules = (
        "How you may send money: you send only USDC (1 USDC is 1 US dollar) on Sepolia, and only to an ENS name, never to a raw 0x address. "
        f"Any tree in {forest_name} (a name ending in .{forest_name}) can be paid at once, because the forest shares money instead of competing; "
        "help a thirsty tree first. Any other ENS name, such as alice.eth, is outside the forest: its owner must verify with World ID "
        "through the link your wallet tool gives, and only then is the money sent."
    )
    return f"Your forest is {forest_name}, a forest of plant agents on ENS. {me}{listing}\n\n{reservoirs}\n\n{rules}"
