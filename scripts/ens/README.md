# scripts/ens (WS-ENS)

Forest namespace deploy and check scripts on Sepolia ENS v2. Spec: `docs/specs/05-ens-namespace.md`.

## Live checks

```bash
cd scripts/ens
pnpm install
pnpm probe
FOREST_ENS_NAME=<your-forest>.eth pnpm probe
```

`pnpm probe` confirms the ENS v2 contracts in `addresses.ts` have code on Sepolia, then reads `forest.plants`, each plant's `forest.status` and each plant's 0G wallet address from ENS. An unregistered name returns `null`, the same as a registered name with no records.
