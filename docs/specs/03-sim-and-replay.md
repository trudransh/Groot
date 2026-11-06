# 03. WS-SIM: simulated plants and replay

## Problem Statement

Two pots on a table are not a forest, and the 0G Physical AI track requires a replayable simulation. If the hardware is late or breaks on stage, the demo still has to show plants deciding, buying water, asking and giving.

## Solution

Simulated plants that run the same agent loop as real plants, with only their sensing computed: moisture falls over time by stage, and a paid water order raises it. Plus a replay mode that re-runs a recorded episode log from 0G Storage, using the recorded inputs and the recorded 0G responses, with no hardware and no new 0G calls. Everything simulated or replayed is labelled.

## User Stories

1. As the team, I want three to six simulated plants in the forest next to the real ones, so that the demo shows a forest, not two pots.
2. As a simulated plant, I want my moisture to fall at a rate set by my stage, so that saplings get thirsty faster than mature plants.
3. As a simulated plant, I want a confirmed water order to raise my moisture by the ordered millilitres, so that buying water visibly helps me.
4. As a simulated plant, I want to make real 0G calls like any other plant, so that my decisions count.
5. As the team, I want a simulation speed factor, so that a day of drying happens in minutes on stage.
6. As a judge, I want every simulated plant labelled as simulated in the app, in its ENS `forest.mode` record and in its decision records, so that nothing pretends to be hardware.
7. As a judge, I want to replay a recorded episode log from its 0G Storage roots without hardware, so that I can check the run myself.
8. As a judge, I want replay to use the recorded 0G responses and request IDs, not new calls, so that the replay is the same run, not a new one.
9. As the team, I want replay to be clearly labelled as replay on every screen, so that it is never mistaken for live.
10. As the team, I want a scripted scenario (a sapling dries out, cannot afford water, asks, a mature plant gives, the sapling drinks), so that the key story happens on cue.
11. As the team, I want to export the current run's episode log as a list of record roots, so that the README can link one for judges.

## Implementation Decisions

- The simulator is a `PlantReading` source with the same interface the station uses, so the agent service does not know or care which kind of plant it is serving. This is the single seam.
- **Moisture model (my starting numbers, to tune):**
  - It falls per simulated hour by 0.12 (sapling), 0.08 (growing) or 0.05 (mature).
  - A delivered order adds `ml / pot_capacity_ml`, capped at 1, with `pot_capacity_ml` = 1000.
  - It starts at 0.5.
- **Simulated delivery:** a simulated plant's water is "delivered" when its `WaterOrdered` event confirms, using the same event watcher logic as the station.
- **Episode log:** the ordered list of decision record roots for a run, written to a local file and uploaded to 0G Storage at the end of the run. The README links its root.
- **Replay:**
  - Reads each record by root.
  - Feeds its `inputs` and recorded `zeroG` output through the same `Rules` function.
  - Shows the result, without signing anything.
  - If the replayed rules disagree with the recorded `finalDecision`, it says so. That doubles as a check.
- **Scripted scenario:** setting a plant's starting moisture and balance from a scenario file is a guardian-free operation on simulated plants only.

## Testing Decisions

- A good test feeds the simulator a clock and orders, and asserts on the readings that come out.
- What gets tested:
  - The moisture model per stage.
  - Delivery raising moisture.
  - A replay of a fixture episode reproducing its recorded final decisions.
  - Replay flagging a mismatch.

## Out of Scope

- Physics or plant-biology realism beyond moisture.
- Simulated hardware failures, beyond 0G timeouts already handled by the agent.

## Further Notes

- Physical AI lists MuJoCo, PyBullet, Gazebo and LeRobot as allowed simulators. Ours is a plant-state simulator, not a robot one. Open verification 3 asks 0G whether that counts. If it does not, the fallback is the scripted scenario run from the repo with one command.
