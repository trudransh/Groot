# ENS v2: how the forest uses it

The forest is `vantaraa.eth` on Sepolia ENS v2. Every plant is an agent with its own subname, its own wallets in its records, and the right to write exactly one record: its own distress signal. Design: `docs/specs/05-ens-namespace.md`, ADR 0005.

## Must-shows

| Requirement | Where it is |
|---|---|
| Own subname registry for the forest | `UserRegistry` proxy `0x61A8E3dC1AddBd343F669260e93fb34CbD7D8a35`, holding `groot.vantaraa.eth` and `sapling.vantaraa.eth` |
| Permissioned Resolver with scoped roles (Enhanced Access Control) | One forest resolver `0xCF51DeCa6eD605502D53B60FCA4d3A3e69737adf`; each agent holds `ROLE_SET_TEXT` on its own `signal.<label>` key only (`grantSetterRoles`), the guardian holds the rest |
| Plants as agents with their own identity and permissions | Each plant agent signs its own signal writes with its own key and pays its own gas; records carry persona, stage, species, mode, PlantWallet on 0G and USDC address on Sepolia |
| A rejected write | Groot's agent writing Sapling's signal: [reverted tx](https://sepolia.etherscan.io/tx/0x701428587ccedded8bbeb284278d9007ae84674681b1c198d30dce054918d702) |
| A live distress signal | Sapling's agent set `signal.sapling=1`: [tx](https://sepolia.etherscan.io/tx/0x22ba994d210750095d5c0f2b97d935744ec08ab4fa165116315d3278c705a7d2) |
| No hard-coded values: everything resolves from the forest name | `forest.plants` lists plants; each plant name resolves to its PlantWallet (coin type `2147500250`, 0G Galileo) and agent (coin type `2158638759`, Sepolia); `forest.contract` gives the Forest on 0G. The agent finds its PlantWallet through ENS (`agent/scripts/checkpoint.ts`), Groot reads the forest and every signal from ENS (`groot/agent/voice_agent/forest.py`) |
| Sepolia deployment, live demo link, open source | Sepolia; repo `https://github.com/trudransh/Groot`; demo link in the README |

## How a plant asks for help

1. Groot decides on 0G that it is thirsty and calls `POST /water` on the agent service.
2. The agent service stores the decision on 0G Storage, orders water on Groot's PlantWallet, and writes `signal.groot=1` on `vantaraa.eth` with Groot's own key.
3. Sapling's agent reads `signal.groot` from the forest name, sees `1`, and sends USDC to `groot.vantaraa.eth`.
4. When Groot is fine, it writes `signal.groot=0`.

## Try it

```bash
cd scripts/ens
pnpm read                                  # every plant and its signal, from vantaraa.eth
pnpm probe                                 # contracts, plants, signals, both wallet addresses
AGENT_KEY=<sapling key> pnpm signal sapling 1
AGENT_KEY=<groot key>   pnpm signal sapling 0   # reverts: not Groot's key
pnpm break:fork                            # 16 attack and quirk checks on a Sepolia fork
```

## Why one resolver, not one per plant

Permissioned Resolver roles are scoped per key, not per name. Instead of a resolver per plant, each plant gets its own key on the forest name. One deploy, one place to read every signal, and the access rule is ENS's own (ADR 0005).
