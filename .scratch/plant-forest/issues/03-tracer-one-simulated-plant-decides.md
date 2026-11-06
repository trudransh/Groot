# 03: Tracer bullet: one simulated plant decides on 0G

**What to build:** one simulated plant's checkpoint runs end to end: reading, real 0G Compute decision, hard rules, decision record uploaded to 0G Storage, `logDecision` on its PlantWallet. `GET /forest` shows the plant with the request ID, the root and the transaction hash.

**Blocked by:** 01, 02

**Status:** ready-for-agent

**Owner:**

- [ ] `Decider` 0G implementation returns a `Decision` plus request ID (from `ZG-Res-Key` or `data.id`)
- [ ] `Rules` implements every rule in `00-interfaces.md` section 4, with table tests
- [ ] `RecordStore` uploads a `DecisionRecord` and returns the root
- [ ] Checkpoint order is fixed; no onchain call without a stored root (tested with fakes)
- [ ] A 0G timeout produces `wait` and `SAFE_STOP` (tested)
- [ ] Live run prints a request ID, a root and a tx hash on the 0G explorer (gate G1)
