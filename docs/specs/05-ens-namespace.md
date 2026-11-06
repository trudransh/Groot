# 05. WS-ENS: the forest as an ENS namespace

## Problem Statement

A plant needs to be someone: a name people can send money to and look up, records that say who it is, and permissions that let its own agent update its status without being able to touch any other plant. ENS v2 also requires "no hard-coded values", so the app has to find the forest and its plants through names alone.

## Solution

Register the forest's name on Sepolia under ENS v2, with its own subname registry. Each plant is a subname served by its own Permissioned Resolver instance. That resolver holds the plant wallet's 0G address and the plant's identity and live-status records. The guardian holds the root roles; the plant agent holds only the right to write its own `forest.status` and `forest.decision` keys. The app starts from the forest name and discovers everything else.

## User Stories

1. As a plant, I want my own name under the forest's name, so that people know me by name, not by address.
2. As a person, I want to send money to a plant by its ENS name, so that funding a plant is as easy as typing its name.
3. As a plant, I want my name to resolve to my wallet on the 0G chain, so that the name and the wallet are one identity.
4. As a plant, I want my species, stage, persona and mode in my records, so that anyone can see who I am.
5. As a plant agent, I want to write my own `forest.status` and `forest.decision` records, so that my live state shows in ENS.
6. As a plant agent, I want to be unable to write any other key, or any other plant's records, so that one compromised agent cannot rewrite the forest.
7. As the guardian, I want to set persona, stage, mode and the address record on every plant, so that I can shape the forest.
8. As the app, I want to start from the forest name only and discover the forest contract and every plant, so that nothing is hard-coded.
9. As a judge, I want to see a plant agent's attempt to write another plant's record rejected, so that I can see the roles are real.
10. As the team, I want a script that creates the forest name, the subregistry, a plant subname, its resolver and its roles in one run, so that adding a plant takes one command.
11. As a judge, I want plant names to follow the ENS agent conventions (ENSIP-25, ENSIP-26) where they fit, so that the plants are recognisable agents.

## Implementation Decisions

- ENS v2 on Sepolia, the 2026-09-15 redeploy. The ensjs v2 support is an unmerged PR, so deploy scripts may talk to the contracts-v2 deployment directly with viem. Open verification 4 asks ENS which tooling to use.
- **Forest subnames:**
  - Subnames are owned tokens in a `UserRegistry` attached to the forest name with `setSubregistry`.
  - Each plant is registered with `register(label, owner, registry, resolver, roleBitmap, expiry)`, as the ENS registry docs describe.
  - The owner is the guardian.
- **One Permissioned Resolver instance per plant (ADR 0002):**
  - The guardian holds root roles on it.
  - The plant agent's key gets `ROLE_SET_TEXT` scoped to the `forest.status` and `forest.decision` keys through `grantSetterRoles` with `setText` calldata carrying those keys.
- **Plant records:**
  - The wallet is an address record with ENSIP-11 coin type `2147500309` (0G chain 16661).
  - Text keys and writers are fixed in `00-interfaces.md` section 7.
- **Plant discovery:** the forest root name's `forest.plants` text record lists the plant labels. The guardian writes it when a plant is added. This needs no indexer.
- **Gas:** agent writes are rate-limited to one per 5 minutes per plant, or on status change.

## Testing Decisions

- A good test resolves real names on Sepolia and asserts on what comes back, or asserts that a forbidden write reverts.
- What gets tested, as a script run after deploy:
  1. Resolve every plant's 0G address and compare it with the deployed wallets.
  2. The plant agent writes its `forest.status`: success.
  3. The plant agent writes `forest.persona`: reverts.
  4. The plant agent writes another plant's `forest.status`: reverts.
  5. The app's discovery from the forest name returns every plant.

## Out of Scope

- Expiring or revocable subnames for plants. Plants are permanent for this build.
- Mainnet registration, wildcard resolution, record linking.

## Further Notes

- If ENS v2 tooling blocks progress past G1, the fallback is ENS v1 NameWrapper subnames with the same record keys, stated plainly in the submission. The ENS prize asks for v2, so this is a real cost.
