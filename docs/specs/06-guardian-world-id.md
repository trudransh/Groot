# 06. WS-GUARDIAN: a verified human protects the plants

## Problem Statement

Plants talk to strangers and hold money. Anyone who can chat with a plant can try to talk it into sending its money away or changing its rules. Some actions have to stay human, and they must be done by the forest's own guardian, not by any person who happens to be verified.

## Solution

One guardian per forest, bound once through World ID, verified again for every protected action. The plant refuses money and rule requests in chat and points to the guardian. The guardian panel asks for a fresh World ID proof bound to the exact action. The backend validates it with World, checks that the nullifier matches the bound guardian, and only then signs the action with the guardian executor key. An unverified person, or a verified person who is not the guardian, is refused, and nothing happens.

## User Stories

1. As the guardian, I want to bind myself to the forest with one World ID verification, so that the forest knows its one human.
2. As the guardian, I want every protected action to ask me for a fresh verification, so that a stolen browser session cannot act for me.
3. As the guardian, I want my proof tied to the exact action I approve, so that it cannot be replayed for a different action.
4. As the guardian, I want to change the forest rules: water price, share limit, water caps.
5. As the guardian, I want to change a plant's reserve, persona or stage.
6. As the guardian, I want to withdraw from a plant wallet to an address I choose.
7. As the guardian, I want to reset a plant out of `SAFE_STOP`.
8. As a stranger, when I ask a plant in chat to send me money, I want a clear answer that only its guardian can, so that I understand why it refused.
9. As a verified human who is not the guardian, I want my action refused with a clear reason, so that being verified is not the same as being trusted.
10. As a judge, I want to see the failed path live: an unverified or wrong-person attempt, and the action does not happen.
11. As a judge, I want the proof validated in the backend, never in the browser, so that the client cannot fake it.
12. As the team, I want every guardian action logged with its nullifier hash, action and transaction, so that there is an audit trail.
13. As World's judges, I want an integration debrief, so that we hear time to first success, friction, the missing capability and the top improvement.

## Implementation Decisions

- **Endpoints:**
  - The World ID widget (IDKit) runs in the app.
  - `POST /guardian/bind` and `POST /guardian/action` in the agent service carry the proof.
  - Shapes are in `00-interfaces.md` sections 8 and 9.
- **World action:** `forest-guardian`, configured to allow repeated verifications by the same person. The same person proving it again yields the same nullifier hash, which is how the backend knows it is the guardian.
- **Signal:** `keccak256` of the canonical JSON of the `GuardianAction` (sorted keys).
- **Replay protection:** `nonce` must be greater than the last one used.
- **Order in `POST /guardian/action`:**
  1. Verify the proof with World's backend API.
  2. Check the nullifier equals the bound guardian.
  3. Check the signal matches the action.
  4. Check the nonce.
  5. Execute with the guardian executor key: a contract call or an ENS write.
  6. Log the action.
- Any failure returns 403 with one of `invalid_proof`, `not_guardian`, `signal_mismatch`, `stale_nonce`, and nothing is executed.
- **Rebinding:** only possible by clearing the stored nullifier in the service's config. This is a deliberate hackathon limit, stated in the README.
- The guardian executor key never leaves the backend.

## Testing Decisions

- A good test posts to the endpoints with a faked World verifier and asserts on the response and on whether the executor was called.
- What gets tested:
  - Bind once; then a second bind with a different nullifier is refused.
  - An action with a valid guardian proof executes.
  - Each of the four failure codes executes nothing.
  - The chat refusal path (shared with WS-AGENT).
- One live test with a real World ID proof before G2.

## Out of Scope

- Several guardians, guardian recovery, onchain World ID verification on the 0G chain.

## Further Notes

- Open verification 6: confirm the current verify endpoint, the IDKit version, whether the action can allow repeated verifications, and how to test without a phone.
- The World debrief is written as we go in `docs/sponsors/WORLD_DEBRIEF.md`, not on Saturday morning.
