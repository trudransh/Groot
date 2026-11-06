# 12: Live ENS status and the reject demo

**What to build:** each plant agent keeps its own `forest.status` and `forest.decision` records current (at most every 5 minutes or on change), and the app has a demo button where a plant agent tries to write another plant's record and the registry rejects it.

**Blocked by:** 06

**Status:** ready-for-agent

**Owner:**

- [ ] Rate-limited agent writes to its own two keys
- [ ] Reject demo shows the revert and links the failed transaction
- [ ] Plant page shows ENS records with a link to the ENS app on Sepolia
