# 04. WS-CONTRACTS: plant wallets and the forest contract

## Problem Statement

If sharing were only a promise in the agents' prompts, a confused or manipulated agent could give away everything, and "plants that share" would just be a story. Each plant needs a wallet of its own, and the forest needs rules that hold no matter what the AI says.

## Solution

Two contracts on the 0G testnet.
- **`Forest`** holds the rules (water price, share limit, water caps), the list of registered plant wallets, the supplier, and the help requests.
- **`PlantWallet`** is one per plant. It holds that plant's money and lets only that plant's agent order water, ask for help, give and log decisions, each within the forest rules.

Every action carries the 0G request ID and the decision record's root, so each onchain event points back to the decision behind it. A guardian executor (the backend, after a World ID check) can change rules and reserves and withdraw.

## User Stories

1. As a plant, I want my own wallet address, so that anyone can send me money by my name and gifts are real transfers.
2. As a plant, I want to pay the forest's supplier for water at the forest's price, so that the pump runs for water I bought.
3. As a plant, I want water orders capped per order and per day, so that a bad decision cannot empty my wallet on water.
4. As a plant, I want to be able to spend my reserve on water, so that a broke plant can still drink.
5. As a sapling, I want to open one help request for an amount, so that the forest knows what I need.
6. As a mature plant, I want to give to a plant with an open help request, so that my surplus helps a sapling.
7. As a mature plant, I want any gift that would take me under my reserve to fail, so that I never give away what I need.
8. As a mature plant, I want my gifts limited to a share of my surplus per 24 hours, so that one sapling cannot drain me.
9. As a plant, I want gifts only to plants registered in my forest, so that money never leaves the forest through a gift.
10. As a sapling, I want my help request closed when it is filled, so that plants stop giving once I have enough.
11. As a plant, I want every action to emit an event with the request ID and record root, so that the app and judges can trace it to the decision.
12. As the guardian, I want to change the forest rules and a plant's reserve, so that the forest can be tuned.
13. As the guardian, I want to withdraw from a plant wallet, so that money can be recovered if something goes wrong.
14. As the guardian, I want to replace a plant's agent key, so that a leaked key can be rotated.
15. As anyone, I want all money-moving calls to fail for callers who are not the plant's agent or the guardian executor, so that the wallet cannot be used by strangers.
16. As the station and the simulator, I want a `WaterOrdered` event with an order ID and millilitres, so that I know exactly what to pump.

## Implementation Decisions

- Solidity ^0.8.24 with Foundry, deployed to the 0G Galileo testnet (chain 16602). The interfaces, events, errors and default values are fixed in `00-interfaces.md` section 6.
- Native 0G testnet token as the money. No ERC-20 in this build.
- A `PlantWallet` is deployed per plant by a deploy script, then registered with `Forest.registerPlant` by the guardian executor.
- **Share window:**
  - A fixed 24-hour window starts at the first gift after the previous window ended.
  - The surplus snapshot is taken at that first gift.
  - Gifts in the window are summed against `snapshot * shareLimitBps / 10000`.
- **Water cap:** a rolling day measured with the same fixed-window method, on millilitres.
- `orderWater` pays the supplier directly in the same call. Money leaves the plant as the order is placed. Delivery is reported offchain by the station.
- `guardianExecutor` is one address (the backend's guardian key), the same for the forest and every plant wallet. The World ID check happens before this key signs (spec 06).
- No upgradeability, no proxies. A redeploy is cheap on testnet.

## Testing Decisions

- Each test calls the contracts the way the agent or guardian would, and asserts on balances, events and revert errors. It never reads private storage.
- **Required tests, each a named Foundry test:**
  1. Funding a plant wallet emits `Funded` and raises its balance.
  2. `orderWater` pays the supplier exactly `ml * price` and emits `WaterOrdered`.
  3. `orderWater` reverts with `WaterCapExceeded` past the per-order cap, and past the per-day cap.
  4. `orderWater` may spend into the reserve.
  5. `askHelp` opens a request. A second `askHelp` while open reverts with `RequestAlreadyOpen`.
  6. `give` moves the amount, records it against the request, and closes the request when filled (`HelpFilled`).
  7. `give` reverts with each of `NotInForest`, `NoOpenRequest`, `ReserveBreached`, `OverShareLimit`.
  8. The share window resets after 24 hours.
  9. Every agent-only function reverts with `NotAgent` for other callers. Every guardian function reverts with `NotGuardian` for other callers.
  10. `guardianWithdraw`, `setReserve`, `setAgent` and `setRules` work for the guardian executor and emit their events.
- Fuzz test: for random gift sequences, the giver's balance never drops below its reserve through `give`.

## Out of Scope

- Physical delivery proof onchain, multiple forests, ERC-20 tokens, mainnet.
- Supplier logic beyond receiving payment.

## Further Notes

- Deployed addresses go into the README and the ENS `forest.contract` and plant address records. 0G Wildcard and every 0G track require the contract addresses.
