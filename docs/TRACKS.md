# Track checklist

Submission: form in by Sat 7 Nov 07:00 IST (closes 09:00). Owners: R = Rudransh, D = Dhairya, Ra = Raveesh.

## Blockers for everything

- [x] B1. Switched Storage and contracts to 0G Galileo testnet, funded from the guardian; Compute stays on the mainnet Router. Was: 0G mainnet funds on Groot `0x02871e1b819Dd5ce394337d0A2E8C19686887ba1` (about 0.2 0G) and Sapling `0xA11E25e4135739027fdC6E62B5e183769821829F` (about 0.1 0G). Owner: R
- [x] B2. Team decision: USDC stays on Sepolia; 0G (Galileo) carries decision records and the decision log. Owner: all
- [ ] B3. Merge `dhairya` into `main` once T-D1 and T-D2 below land. Owner: D

## 0G (Physical AI + Wildcard)

Must-shows: 0G call in the decision loop, a record per decision on 0G Storage with its request ID, a contract address on 0G mainnet, safe stop, replayable simulation, one sentence on what breaks without 0G, video under 3 minutes, live demo link, team Telegram and X.

- [x] 0G1. Decisions come from the 0G Router with a request ID (TS checkpoint and Groot's inner loop)
- [x] 0G2. Storage upload code (`agent/src/live/storage.ts`), reaches the submit transaction
- [x] 0G3. First real storage root on mainnet (needs B1). Owner: R
- [x] 0G4. Deploy on 0G mainnet: `Forest` + one `PlantWallet` per plant, or a minimal decision log, write `contracts/deployments/16661.json`. Owner: Ra
- [x] 0G5. `/water` and `/signal` endpoints in the TS agent: record to Storage, `logDecision`/`orderWater` on 0G, pump, ENS signal. Owner: R
- [ ] 0G6. Groot's `water_myself` calls `/water` instead of the ESP32 directly, passing its 0G request ID. Owner: D
- [x] 0G7. Safe stop shown live: 0G unreachable means no water and status `safe_stop`. Owner: R
- [x] 0G8. Replay: run a stored record again from its root (command in README is enough). Owner: R
- [x] 0G9. `docs/sponsors/0G.md` filled: request ID, storage root, contract address, the "what breaks without 0G" sentence. Owner: R
- [ ] 0G10. Team Telegram and X handles in the submission. Owner: R

## ENS v2

Must-shows: subname registry, Enhanced Access Control, Permissioned Resolver at the centre; agents with their own identity and permissions; no hard-coded values; Sepolia; live demo link; open source.

- [x] E1. `vantaraa.eth` registered, forest subname registry, one Permissioned Resolver
- [x] E2. `groot.vantaraa.eth` and `sapling.vantaraa.eth` live with their 0G address record and `forest.plants`
- [x] E3. Each agent can write only `signal.<own label>`; live signal sent by Sapling
- [x] E4. Live rejected write: Groot writing Sapling's signal reverts
- [x] E5. Groot reads the forest and distress signals from ENS (no hard-coded plants)
- [ ] E6. Agents write their own signal automatically when thirsty and when satisfied (via 0G5/0G6). Owner: R + D
- [ ] E7. Sapling sees `signal.groot=1` and helps Groot (demo beat). Owner: D
- [x] E8. Plant records: `description`, `url`, persona, species, stage, mode on both names, forest contract and chain on the forest name (`pnpm describe`); no avatar image yet. Owner: R
- [x] E9. ADR 0005 and spec 05 updated to one resolver with a key per plant. Owner: R
- [x] E10. `docs/sponsors/ENS.md` filled with names, resolver, roles, tx links for the signal and the rejected write. Owner: R

## World ID

Must-shows: full journey (request, person verifies, backend validates, protected action runs), a failed path, backend validation, integration debrief.

- [x] W1. Claim flow: fresh World ID Agent Pass, backend checks, guardian registers the human
- [x] W2. Transfer flow: Groot sends USDC outside the forest only after World ID, and only if the name still resolves to the verified address
- [ ] W3. Spending caps in Groot's wallet: per transfer, per day, and a reserve it never spends. Owner: D
- [ ] W4. One World ID transfer per person per window. Owner: Ra
- [ ] W5. Failed path recorded for the demo: unverified person asks for money, nothing sent. Owner: D
- [ ] W6. `registerHuman` running for real on 0G (needs 0G4). Owner: Ra
- [ ] W7. `docs/sponsors/WORLD_DEBRIEF.md` filled. Owner: Ra

## Ship

- [ ] S1. README: what it is, how to run, real vs simulated, every address and proof link. Owner: R
- [ ] S2. `AI_USAGE.md` up to date for every workstream. Owner: all
- [ ] S3. Demo script rehearsed: Groot thirsty, signal on ENS, Sapling pays, pump runs, rejected ENS write, World ID refusal, safe stop. Owner: all
- [ ] S4. Video under 3 minutes, recorded from the working system. Owner: all
- [ ] S5. Form submitted by 07:00. Owner: R
