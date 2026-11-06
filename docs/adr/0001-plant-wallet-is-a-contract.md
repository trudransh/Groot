# Each plant's wallet is a smart contract, not a plain key

Every plant has its own address, because gifts must be real transfers between plants and the plant's ENS name must resolve to something that is that plant's. We made that address a small `PlantWallet` contract owned by the plant agent's key rather than the key itself, so the forest rules (reserve, share limit, open help request, water caps) are enforced by code. A plain key per plant would leave the rules inside the agent, where a bug or a persuasive chat message could send everything.

## Considered options

- Plain key per plant: rejected, rules only in agent code.
- One shared contract holding budgets: rejected, plants would not really own wallets.
