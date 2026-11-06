# Forest contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy `Forest` and one `PlantWallet` per plant to the 0G testnet, enforcing the forest rules in code, with every test in the spec green.

**Architecture:**
- `Forest` holds rules, registered plant wallets, the supplier and help requests.
- Each `PlantWallet` holds one plant's native-token balance. It lets only its agent order water, ask, give and log decisions, and only the guardian executor tune it and withdraw.
- Gifts call back into `Forest` to record against the help request.

**Tech Stack:** Solidity ^0.8.24, Foundry (forge, forge-std), no other dependencies.

**Spec:** `docs/specs/04-contracts.md` and `docs/specs/00-interfaces.md` section 6 (interfaces, events, errors, defaults are fixed there).

## Global Constraints

- Chain: 0G Galileo testnet, chain ID 16602, RPC from `contracts/.env` (`RPC_URL`), never hard-coded.
- Money is the native token. No ERC-20.
- Defaults at deploy:
  - `waterPriceWeiPerMl` = 1e12
  - `shareLimitBps` = 2500
  - `maxWaterMlPerOrder` = 150
  - `maxWaterMlPerDay` = 500
- `Action` encoding: water 0, wait 1, ask_help 2, give 3.
- No proxies, no upgradeability.
- Single-line comments only, and only where needed.
- Commit after each task, one feature per commit, under the human's own git identity. No AI co-author lines.

## Review Focus

1. **A gift exactly equal to the remaining unfilled amount** must succeed and close the request. A gift one wei above must revert with `NoOpenRequest`. Test in Task 4.
2. **The share window boundary:** a gift at exactly 24 hours after the window start opens a new window with a fresh snapshot. Test in Task 4.
3. **A plant giving to itself** must revert with `NoOpenRequest` if it is not the request's owner, and with `NotInForest` if `to` is not registered. The plant's own open request does not make a self-gift valid. Test in Task 4.
4. **Water cap at the per-day boundary:** orders summing to exactly 500 ml succeed; the next 1 ml reverts. Test in Task 3.
5. **`guardianWithdraw` to the zero address** reverts, rather than burning funds. Test in Task 5.

---

### Task 1: Foundry project and Forest registry

**Files:**
- Create: `contracts/foundry.toml`, `contracts/src/Forest.sol`, `contracts/test/Forest.t.sol`, `contracts/.env.example`

**Interfaces:**
- Produces: `Forest` constructor; `registerPlant`, `setRules`, `isPlant`; events `PlantRegistered` and `RulesSet`; error `NotGuardian`. Exact signatures in `00-interfaces.md` section 6.

- [ ] **Step 1: Write the failing tests** `test_registerPlant_onlyGuardian` (a non-guardian reverts `NotGuardian`; the guardian emits `PlantRegistered` and `isPlant` returns true) and `test_setRules_emits`.
- [ ] **Step 2: Run** `forge test --match-contract ForestTest -vv`. Expected: FAIL (contract missing).
- [ ] **Step 3: Implement** the constructor, storage of the rules, `registerPlant`, `setRules`, `isPlant` in `contracts/src/Forest.sol`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(contracts): forest registry and rules`.

### Task 2: PlantWallet funding, agent and guardian access

**Files:**
- Create: `contracts/src/PlantWallet.sol`, `contracts/test/PlantWallet.t.sol`

**Interfaces:**
- Consumes: `Forest.isPlant`, `Forest` rule getters.
- Produces:
  - `PlantWallet` constructor, `receive`, `logDecision`, `setReserve`, `setAgent`.
  - Events `Funded`, `DecisionLogged`, `GuardianAction`; errors `NotAgent`, `NotGuardian`.
  - A test helper `_deployForestWithPlants(uint256 n)` in the test base, used by Tasks 3 to 5.

- [ ] **Step 1: Write the failing tests** `test_receive_emitsFunded`, `test_logDecision_onlyAgent` (asserts the event fields `action`, `requestId`, `root`), `test_setReserve_onlyGuardian`, `test_setAgent_onlyGuardian`.
- [ ] **Step 2: Run** `forge test --match-contract PlantWalletTest -vv`. Expected: FAIL.
- [ ] **Step 3: Implement** these in `contracts/src/PlantWallet.sol`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(contracts): plant wallet funding and access`.

### Task 3: Water orders

**Files:**
- Modify: `contracts/src/PlantWallet.sol`, `contracts/test/PlantWallet.t.sol`

**Interfaces:**
- Produces: `orderWater(uint32 ml, string requestId, bytes32 root) returns (uint256 orderId)`, event `WaterOrdered`, errors `WaterCapExceeded` and `InsufficientBalance`. `orderId` starts at 1 and increments per wallet.

- [ ] **Step 1: Write the failing tests:**
  - `test_orderWater_paysSupplier`: the supplier balance rises by exactly `ml * 1e12`, and `WaterOrdered(1, ml, cost, requestId, root)` is emitted.
  - `test_orderWater_perOrderCap`: 151 ml reverts `WaterCapExceeded`.
  - `test_orderWater_perDayCap`: 150 + 150 + 150 + 50 succeed, then 1 ml reverts (Review Focus 4).
  - `test_orderWater_canSpendReserve`.
  - `test_orderWater_insufficientBalance`.
  - `test_orderWater_dayResets`: after `vm.warp(+24h)` the cap is fresh.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `orderWater`, with the per-day cap as a fixed window starting at the first order after the last window ended.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(contracts): paid water orders with caps`.

### Task 4: Help requests and gifts

**Files:**
- Modify: `contracts/src/Forest.sol`, `contracts/src/PlantWallet.sol`, both test files

**Interfaces:**
- Produces:
  - `Forest.openHelpRequest`, `Forest.recordGift`, `Forest.helpRequest`, `Forest.openRequestOf`; events `HelpRequested`, `HelpFilled`.
  - `PlantWallet.askHelp` and `PlantWallet.give`; event `Gift`.
  - Errors `NotInForest`, `NoOpenRequest`, `ReserveBreached`, `OverShareLimit`, `RequestAlreadyOpen`.
  - Help request IDs start at 1; `openRequestOf` returns 0 when there is none.

- [ ] **Step 1: Write the failing tests:**
  - `test_askHelp_opensRequest` (asserts the `HelpRequested` fields).
  - `test_askHelp_secondWhileOpen_reverts`.
  - `test_give_movesAndRecords`.
  - `test_give_exactRemaining_closesRequest` and `test_give_oneWeiOver_reverts` (Review Focus 1).
  - `test_give_notInForest`, `test_give_noOpenRequest`, `test_give_selfGift_reverts` (Review Focus 3).
  - `test_give_reserveBreached`.
  - `test_give_overShareLimit`: reserve 1e16, balance 5e16, so surplus 4e16 and the limit is 1e16. A gift of 1e16 succeeds; a further 1 wei reverts.
  - `test_shareWindow_resetsAt24h` (Review Focus 2).
  - `testFuzz_give_neverBelowReserve`.
  - `recordGift` called by a non-plant reverts `NotInForest`.
- [ ] **Step 2: Run** `forge test -vv`. Expected: FAIL.
- [ ] **Step 3: Implement** the request storage and lifecycle in `Forest`, and `askHelp` and `give` in `PlantWallet`, with the window rule from `04-contracts.md`.
- [ ] **Step 4: Run.** Expected: PASS, including the fuzz test at the default 256 runs.
- [ ] **Step 5: Commit** `feat(contracts): help requests and rule-bound gifts`.

### Task 5: Guardian withdraw and deploy script

**Files:**
- Modify: `contracts/src/PlantWallet.sol`, `contracts/test/PlantWallet.t.sol`
- Create: `contracts/script/Deploy.s.sol`, `contracts/deployments/.gitkeep`

**Interfaces:**
- Produces:
  - `guardianWithdraw(address to, uint256 amountWei)`, reverting on `to == address(0)`.
  - The deploy script reads `GUARDIAN_EXECUTOR`, `SUPPLIER`, `PLANT_AGENTS` (comma-separated addresses) and `PLANT_RESERVES_WEI` from the environment.
  - It writes `contracts/deployments/16602.json`: `{ forest, plants: [{ agent, wallet, reserveWei }] }`.

- [ ] **Step 1: Write the failing tests** `test_guardianWithdraw_onlyGuardian`, `test_guardianWithdraw_zeroAddress_reverts` (Review Focus 5), `test_guardianWithdraw_moves`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `guardianWithdraw` and the deploy script. The script deploys, then calls `registerPlant` for each wallet from the guardian executor.
- [ ] **Step 4: Run** `forge test -vv`, then `forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast`. Expected: all tests PASS; `deployments/16602.json` written; every address has code (`cast code <addr> --rpc-url $RPC_URL` is not `0x`).
- [ ] **Step 5: Commit** `feat(contracts): guardian withdraw and testnet deploy`. Add the addresses to the README in the same commit.
