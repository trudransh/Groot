# contracts (WS-CONTRACTS)

Forest and PlantWallet on the 0G mainnet. Spec: `docs/specs/04-contracts.md`. Plan: `docs/superpowers/plans/2026-11-06-forest-contracts.md`.

## Run

```bash
cd contracts
forge install --no-git foundry-rs/forge-std@v1.9.7   # once; lib/ is gitignored
forge test
cp .env.example .env                                  # fill in, then:
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

The deploy script writes `deployments/<chainId>.json` (`16661.json` on 0G mainnet). The deployer key needs 0G for gas, and so does the guardian executor key, which registers the plants.

## Paying humans

Beyond the spec's water, help and gift paths, plants can pay World ID-verified humans. The claim flow that verifies them is in `worldcoin/`.

- `Forest.registerHuman(address)` is guardian only. The backend calls it only after it has validated the person's fresh World ID verification; the contract cannot check World ID itself.
- `PlantWallet.payHuman(to, helpRequestId, amountWei, requestId, root)` is agent only and pays only registered humans (`NotVerifiedHuman`).
  - `helpRequestId` 0 is a reward for refilling this plant's own bottle.
  - Any other ID is the bounty on another plant's open help request: the payment counts toward filling it (`Forest.recordGift`), the request closes when filled, and a plant cannot fill its own request (`NoOpenRequest`).
- `give` and `payHuman` share one spending rule: the balance stays at or above the reserve (`ReserveBreached`), and their total in a 24-hour window stays within `shareLimitBps` of the surplus at the window's first payment (`OverShareLimit`).
- `giftedInWindowWei()` returns the total spent in the current window, and 0 once that window has ended.

## Deployed

0G Galileo testnet (chain 16602), explorer `https://chainscan-galileo.0g.ai`. Addresses in `deployments/16602.json`.

| Contract | Address |
|---|---|
| Forest | `0xD9ff9458Fd24c6cf3E1960965350Dedd94B826e3` |
| PlantWallet groot (agent `0x02871e1b819Dd5ce394337d0A2E8C19686887ba1`) | `0xc6a7084636e2fb95AAFdA1d0bc1E416a403259aF` |
| PlantWallet sapling (agent `0xA11E25e4135739027fdC6E62B5e183769821829F`) | `0xc663e2CD30E1B0f843F9802C333fF04F4fbd64A7` |

Guardian executor and supplier: `0xB2823cEA7bfca7162A6C73933B8aC22afB0eD75a`.
