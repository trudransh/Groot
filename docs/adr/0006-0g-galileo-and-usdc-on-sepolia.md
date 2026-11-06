# 0G Galileo for records and contracts, USDC on Sepolia for money

Supersedes the chain choice in ADR 0003.

The team's mainnet 0G did not arrive in time, and the 0G prize asks for a 0G call in the decision loop, a record per decision on 0G Storage and contract addresses, without requiring mainnet. So decisions still come from 0G Compute through the mainnet 0G Router (paid with router credits), while decision records go to 0G Storage on Galileo testnet (chain 16602) and the `Forest` and `PlantWallet` contracts are deployed on Galileo, funded from the guardian.

The money people see is USDC on Ethereum Sepolia, held by each plant agent's own key: plants help each other and pay World ID-verified humans in USDC. The `PlantWallet` on 0G pays only the tiny water order that must confirm before the pump runs, and logs every decision with its 0G request ID and storage root.

Each plant name carries both: its ENSIP-11 address for chain 16602 is its PlantWallet, and its address for Sepolia (coin type `2158638759`) is its agent key.

## Considered options

- Everything on 0G mainnet (ADR 0003): blocked on funds.
- Water paid in USDC on Sepolia: the pump would have to watch Sepolia transfers instead of `WaterOrdered`, an extra integration for no prize.
- Records and contracts on Galileo, money in USDC on Sepolia (chosen).

## Consequences

- Moving to 0G mainnet later is an env change (`ZERO_G_RPC_URL`, `ZERO_G_CHAIN_ID`, `ZERO_G_STORAGE_INDEXER`) and a redeploy.
- Readers resolving a plant for a payment must ask for the Sepolia coin type first, so USDC never goes to the PlantWallet contract.
