# Mentor and sponsor loop

We keep sponsors in the loop all day, not just at submission. Every check-in has a purpose, a message ready to paste, and a place where the answer gets written down.

**Rule:** every answer goes into `docs/sponsors/FEEDBACK_LOG.md` within 10 minutes. If it changes a spec, the spec changes in the same commit.

## Check-ins

| When | Who | Purpose | Message (paste and adjust) |
|---|---|---|---|
| G0, first hour | 0G | Unblock testnet funds and model choice | "We're building autonomous plant agents for Physical AI: each plant decides on 0G Compute at every checkpoint, logs every decision to 0G Storage, and pays for its own water from its own wallet on the 0G testnet; a real pump runs only after the payment lands. Three asks: (1) can you send testnet 0G for the Compute ledger (3 0G plus 1 per provider)? (2) does any testnet provider take image input? (3) do two real plants plus simulated plants running the same loop with real 0G calls, plus replay of the stored decision log, count as the replayable sim?" |
| G0 | ENS | Confirm the v2 path | "Each plant is an agent with its own subname under our forest name on Sepolia ENS v2, one Permissioned Resolver per plant so its agent can write only its own forest.status and forest.decision keys. Which deployment and tooling should we use to deploy a UserRegistry and one PermissionedResolver per name, and which keys do ENSIP-25 and ENSIP-26 expect for agents?" |
| G0 | World | Confirm the guardian pattern | "Our plants chat with anyone, so only a forest's guardian can move money or change rules. We bind the guardian by their nullifier for the action forest-guardian and require a fresh proof (signal = hash of the exact action) for every protected action, refusing any other verified human. Is allowing repeated verifications on one action the right setup, what's the current backend verify endpoint, and how do we test without a phone?" |
| G1 | 0G, ENS, World channels | Show progress, invite early feedback | One screenshot or 20-second clip of the first real decision with its request ID and root, and one question: "Anything here you'd want to see done differently before we build on it?" |
| G2 | 0G and ENS mentors in person | Depth check | Show the gift path and the per-plant resolver roles. Ask: "What would make this a clear winner in your track rather than a good entry?" |
| G3 | Any available mentor | Dry run | Run the 3-minute demo script once in front of them. Note every question they ask; each one goes into the Q&A list in `docs/specs/08-ship.md` |
| Before submit | All three | Confirm must-shows | "Here's our README section for your track: is anything you need missing?" |

## Feedback log format

`docs/sponsors/FEEDBACK_LOG.md`, newest first:

| Time | Sponsor | Who | What they said | What we changed |
|---|---|---|---|---|
