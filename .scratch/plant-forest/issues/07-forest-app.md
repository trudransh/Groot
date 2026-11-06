# 07: Forest app: forest view, plant page, forest talk

**What to build:** from the forest name, the app shows every plant live (name, stage, health, balance, real or simulated, status), a plant page with records, decisions and proof links, and the forest talk feed, all updating from the event stream, with a "check now" button per plant and a way to send money to a plant by name.

**Blocked by:** 03

**Status:** ready-for-agent

**Owner:**

- [ ] Initial state from `GET /forest`, live updates from `GET /events`
- [ ] Every decision links its request ID, its 0G Storage root and its transaction
- [ ] SIMULATED, REPLAY and SAFE_STOP labels, one treatment each, everywhere they apply
- [ ] Names and wallets resolved from ENS in the browser once ticket 06 lands
- [ ] Readable on a 1080p projector and on a phone
- [ ] Runs on port 3000
