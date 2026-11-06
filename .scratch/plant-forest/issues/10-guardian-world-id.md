# 10: Guardian with World ID

**What to build:** the guardian binds once with World ID; every protected action asks for a fresh proof bound to that exact action; the backend verifies with World, checks the nullifier is the guardian's, checks the signal and nonce, and only then executes; anyone else is refused and nothing happens.

**Blocked by:** 02, 07

**Status:** ready-for-agent

**Owner:**

- [ ] `POST /guardian/bind` and `POST /guardian/action` exactly as `docs/specs/06-guardian-world-id.md`
- [ ] The four failure codes each execute nothing (tested with a faked verifier)
- [ ] One live run with a real World ID proof: a rule change succeeds, a second person is refused
- [ ] Guardian panel in the app with success and refusal states
- [ ] `docs/sponsors/WORLD_DEBRIEF.md` started with time to first success
