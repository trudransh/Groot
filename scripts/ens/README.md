# scripts/ens (WS-ENS)

Forest namespace deploy and check scripts on Sepolia ENS v2. Spec: `docs/specs/05-ens-namespace.md`.

## Live checks

```bash
cd scripts/ens
pnpm install
pnpm probe
FOREST_ENS_NAME=<your-forest>.eth pnpm probe
```

`pnpm probe` confirms the ENS v2 contracts in `addresses.ts` have code on Sepolia, then reads `forest.plants`, each plant's `signal.<label>`, its PlantWallet on 0G and its agent address on Sepolia. An unregistered name returns `null`, the same as a registered name with no records.

## Commands

| Command | What it does | Key |
|---|---|---|
| `pnpm deploy-forest` | registers the forest name if missing, adds plants from `PLANTS=label:agent[:wallet],...`, tops agents up with Sepolia gas | `GUARDIAN_KEY` |
| `pnpm describe` | sets forest and plant records from `plants.json` and `contracts/deployments/<chainId>.json` | `GUARDIAN_KEY` |
| `pnpm signal <label> <0\|1>` | writes `signal.<label>` | `AGENT_KEY` |
| `pnpm read` | prints every plant and its signal | none |
| `pnpm break:fork` | 16 attack and quirk checks on an anvil fork | none |
