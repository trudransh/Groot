# Money and decisions live on 0G mainnet, names live on Sepolia

The chain choice is superseded by ADR 0006: records and contracts on 0G Galileo, money in USDC on Sepolia.

0G's tracks require the decision loop, the decision records and the contracts on 0G (mainnet, chain 16661). ENS v2 is deployed on Ethereum mainnet and Sepolia only. So plant wallets, the forest contract and water orders are on 0G, and the forest's names and records are on Sepolia. Each plant name carries its wallet address as an ENSIP-11 address record for chain 16661, which is how the app goes from a name to a wallet without hard-coded addresses.
