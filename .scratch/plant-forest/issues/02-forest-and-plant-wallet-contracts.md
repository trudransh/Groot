# 02: Forest and PlantWallet contracts

**What to build:** the forest's rules exist onchain. Plant wallets can be funded, order water, ask for help, give within the rules and log decisions, and the guardian executor can tune and withdraw. Deployed to the 0G testnet with all tests green.

**Blocked by:** None (can start immediately; deploy needs 01).

**Status:** ready-for-agent

**Owner:**

- [ ] Interfaces, events, errors and defaults exactly as `docs/specs/00-interfaces.md` section 6
- [ ] All ten required tests and the reserve fuzz test in `docs/specs/04-contracts.md` pass
- [ ] Deploy script deploys Forest plus one PlantWallet per plant and registers them
- [ ] Addresses written to `contracts/deployments/16602.json` and the README
