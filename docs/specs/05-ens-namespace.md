# 05. WS-ENS: the forest as an ENS namespace

## Problem Statement

A plant needs to be someone: a name people can send money to and look up, records that say who it is, and permissions that let its own agent update its status without being able to touch any other plant. ENS v2 also requires "no hard-coded values", so the app has to find the forest and its plants through names alone.

## Solution

The forest is `vantaraa.eth` on Sepolia ENS v2, with its own subname registry and one Permissioned Resolver that serves the forest name and every plant name (ADR 0005). Each plant is a subname (`groot.vantaraa.eth`, `sapling.vantaraa.eth`) whose records hold its PlantWallet on 0G, its agent's Sepolia address (USDC) and its identity. The distress signal lives on the forest name as `signal.<label>` (`1` thirsty, `0` ok); each plant agent holds `ROLE_SET_TEXT` on its own signal key only. The guardian holds every other role. Readers start from the forest name: `forest.plants` lists the plants, the signals sit next to it, and each plant name resolves to its wallets.

## User Stories

1. As a plant, I want my own name under the forest's name, so that people know me by name, not by address.
2. As a person, I want to send money to a plant by its ENS name, so that funding a plant is as easy as typing its name.
3. As a plant, I want my name to resolve to my wallet on the 0G chain, so that the name and the wallet are one identity.
4. As a plant, I want my species, stage, persona and mode in my records, so that anyone can see who I am.
5. As a plant agent, I want to write my own distress signal `signal.<label>` on the forest name, so that the forest sees I am thirsty.
6. As a plant agent, I want to be unable to write any other plant's signal or any record the guardian owns, so that one compromised agent cannot rewrite the forest.
7. As the guardian, I want to set persona, stage, mode and the address record on every plant, so that I can shape the forest.
8. As the app, I want to start from the forest name only and discover the forest contract and every plant, so that nothing is hard-coded.
9. As a judge, I want to see a plant agent's attempt to write another plant's record rejected, so that I can see the roles are real.
10. As the team, I want a script that creates the forest name, the subregistry, a plant subname, its resolver and its roles in one run, so that adding a plant takes one command.
11. As a judge, I want plant names to follow the ENS agent conventions (ENSIP-25, ENSIP-26) where they fit, so that the plants are recognisable agents.

## Implementation Decisions

- ENS v2 on Sepolia (2026-09-15 redeploy), driven with viem; contract addresses in `scripts/ens/addresses.ts`, checked by `pnpm probe`. viem's default Sepolia universal resolver is the v2 proxy, so `getEnsText` and `getEnsAddress` read v2 names with no override.
- **Forest name:** `vantaraa.eth`, registered through the ETH Registrar (commit, 60 s, register, paid in MockUSDC) for 28 days. `scripts/ens/deployments/sepolia.json` keeps the resolver and registry.
- **One resolver (ADR 0005)**, a `PermissionedResolverImpl` proxy deployed through the `VerifiableFactory` with the guardian's roles set in `initialize`.
- **Subnames:** a `UserRegistry` proxy attached to the forest name; plants are registered with `register(label, guardian, 0, resolver, roles, expiry)`.
- **Signal:** text record `signal.<label>` on the forest name. `addPlant` grants the agent `ROLE_SET_TEXT` for that key with `grantSetterRoles`. The agent service writes it on status change (`agent/src/live/ensSignal.ts`); `pnpm signal <label> <0|1>` writes it by hand.
- **Records:** keys and writers are in `00-interfaces.md` section 7. `pnpm describe` sets the forest and plant records from `scripts/ens/plants.json` and `contracts/deployments/<chainId>.json` in one multicall.
- **Coin types:** a plant's 0G address uses `0x80000000 | <0G chain ID>` (Galileo `2147500250`); its Sepolia address (`2158638759`) is its agent key. Payers ask for the Sepolia address so USDC never goes to the PlantWallet (ADR 0006).
- **Writes use DNS-encoded names** (`packetToBytes`), not namehashes.
- **Listening:** the resolver emits `TextUpdated(recordId, keyHash, key, value)`; readers can read signals on a timer and use the event as a hint. No indexer is needed.
- **Gas:** every agent pays its own signal writes in Sepolia ETH; `pnpm deploy-forest` tops agents below 0.005 up to 0.01 from the guardian. The guardian must be a plain key with no EIP-7702 code, or it cannot receive the name token.

## Testing Decisions

- `pnpm break:fork` runs 16 checks on an anvil fork of Sepolia: discovery, wallet resolution, a plant's own signal, a plant writing another plant's signal (reverts `EACUnauthorizedAccountRoles`), an agent granting itself roles (reverts `EACCannotGrantRoles`), an agent redirecting a wallet address (reverts), writes on other names being ignored by readers, the guardian resetting a signal and revoking an agent.
- Live on Sepolia: Sapling's agent set `signal.sapling=1`; Groot's agent writing `signal.sapling` reverted on chain; `pnpm read` and `pnpm probe` resolve everything from `vantaraa.eth`.

## Out of Scope

- Expiring or revocable subnames for plants. Plants are permanent for this build.
- Mainnet registration, wildcard resolution, record linking.
- Writing the latest decision root to ENS (`decision.<label>`); the root is on 0G Storage and in the PlantWallet's events.

## Further Notes

- If ENS v2 tooling blocks progress past G1, the fallback is ENS v1 NameWrapper subnames with the same record keys, stated plainly in the submission. The ENS prize asks for v2, so this is a real cost.
