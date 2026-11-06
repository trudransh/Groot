# 11: Replay and the scripted scenario

**What to build:** the team can start the scripted scenario (sapling dries out, asks, mature plant gives, sapling drinks) on cue, export the run's episode log to 0G Storage, and anyone can replay an episode log by its root without hardware, clearly labelled as replay.

**Blocked by:** 05

**Status:** ready-for-agent

**Owner:**

- [ ] Scenario file sets simulated plants' starting moisture and balances
- [ ] Episode log (ordered record roots) uploaded at end of run; root printed
- [ ] `POST /replay` replays from a root using recorded inputs and 0G outputs, signs nothing, flags any mismatch
- [ ] README has the one command to replay the reference run
