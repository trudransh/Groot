# 09. Personas and voice: making the forest feel alive

## Problem Statement

The demo has to feel like a living forest, not a dashboard. If every plant sounds the same, or a line arrives ten seconds late because 0G was slow, the magic is gone and the judges see a chat wrapper.

## Solution

Six plants with distinct personalities, each written as an ENS `forest.persona` record, so the same event sounds different from every plant.

- 0G writes each plant's lines and chat replies in its persona, grounded in the real event.
- Every persona also has a fixed fallback line for each kind of talk, so forest talk never stalls on stage.
- A scripted scenario sets the starting state so the key story (a sapling saved by the forest) happens on cue.

## Personas

| Label | Species | Stage | Gives | Voice |
|---|---|---|---|---|
| banyan-01 | banyan | mature | readily | Old, warm, proverbs, calls others "little one" |
| neem-02 | neem | mature | after complaining | Practical, grumpy tired doctor, always helps |
| aloe-03 | aloe | growing | rarely, with ceremony | Self-reliant, proud, dry humour |
| tulsi-04 | tulsi | sapling | barely | Shy, polite, anxious, thanks twice |
| mint-05 | mint | sapling | barely | Chatty, dramatic, always thirsty |
| fern-06 | fern | growing | small and often | Calm, curious, asks questions |

The real plant(s) on the table take whichever persona fits the species the team brings, with `forest.mode` set to `real`. The persona texts live in `agent/src/personas.ts` and are written to ENS by the guardian at deploy.

## User Stories

1. As a visitor, I want each plant to sound like itself, so that I can tell them apart without reading names.
2. As a visitor, I want the generous banyan and the stingy aloe to react differently to the same help request, so that personality is visible.
3. As the team on stage, I want a line to appear the moment the transaction confirms, even if 0G is slow, so that the feed never stalls.
4. As a judge, I want persona to change tone and willingness, never the forest rules, so that personality cannot bypass the contract.
5. As the team, I want a scenario file that sets the simulated plants' starting moisture and balances, so that the demo story happens on cue.

## Implementation Decisions

- **Generosity is a prompt input, not a rule.** It shapes whether 0G chooses `give` and how much. The hard rules and the contract still decide.
- **A voice line gets 3 seconds.** If 0G has not produced it, the fallback line from `agent/src/voice/templates.ts` is shown, marked with a small "template" tag in the app. The 0G line replaces it if it arrives later.
- **Refusal lines** for chat all say the same two facts: only the guardian can do this, and only after a World ID check.
- **Scenario:** `agent/scenarios/demo.json` sets starting moisture, balance and reserve for simulated plants only. Its beats are the demo script's core. tulsi-04 starts with less than one water order's cost, so its first checkpoint triggers `cannot_afford_water`.

## Testing Decisions

- `test/templates.test.ts` checks:
  - every persona has a line for every kind;
  - placeholders are filled;
  - unknown plants get the generic voice;
  - lines are deterministic.
- Persona prompts are checked by hand in rehearsal: every plant answers "who are you?" in character.

## Out of Scope

- Text-to-speech, plant avatars drawn per persona, persona changes by the plants themselves.
