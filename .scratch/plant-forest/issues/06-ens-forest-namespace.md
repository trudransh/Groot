# 06: ENS forest namespace

**What to build:** the forest's name exists on Sepolia ENS v2 with a subname per plant, one Permissioned Resolver per plant, the plant wallet's 0G address record, identity records and scoped roles; the agent service and the app discover the forest and its plants from the forest name alone.

**Blocked by:** 01, 02

**Status:** ready-for-agent

**Owner:**

- [ ] Script creates the forest subregistry, each plant subname, its resolver and its records in one run
- [ ] Plant agent key holds `ROLE_SET_TEXT` only for `forest.status` and `forest.decision` on its own resolver
- [ ] `forest.plants`, `forest.contract`, `forest.chain`, `forest.supplier` set on the forest name
- [ ] Post-deploy check script runs the five checks in `docs/specs/05-ens-namespace.md`
- [ ] Agent service loads plants and wallets from ENS at start-up; no addresses in its config
