# 08. WS-SHIP: demo, video, write-ups, submission

## Problem Statement

Sponsors judge from the submission materials and finalists are judged in a 4-minute demo with 3 minutes of questions. A working forest that is badly shown, missing a must-have link, or submitted at 08:59 loses to a weaker project that is shown well.

## Solution

From the first hour, one workstream owns the story, the evidence and the submission, and fills them in as the build lands:
- a 3-minute demo script built around one story;
- a video recorded from the working system;
- a README with every address and proof;
- one write-up per sponsor;
- `AI_USAGE.md`;
- the submission, done by 07:00.

## User Stories

1. As a judge, I want one story in the demo (a sapling in trouble is saved by the forest, not by a human), so that I remember it.
2. As a judge, I want to see a real 0G request ID, a storage root and a contract address on screen, so that the 0G must-shows are visible.
3. As a judge, I want to see the pump run on the table after a paid water order, so that the physical part is real.
4. As a judge, I want to see an over-limit gift rejected by the contract, a plant agent's ENS write to another plant rejected, and a non-guardian refused by World ID, so that the rules are visibly code.
5. As a judge, I want to see the safe stop by unplugging the network, so that the fallback is proven live.
6. As a 0G judge, I want the README to list every contract address, an example request ID and storage root, and one sentence on what breaks without 0G.
7. As an ENS judge, I want the README to show the forest name, the per-plant resolvers and roles, and how the app resolves everything from the name.
8. As a World judge, I want the integration debrief with time to first success, friction, missing capability and top improvement.
9. As ETHGlobal, I want `AI_USAGE.md` and all spec, prompt and plan files in the repo, so that AI-assisted work is disclosed.
10. As the team, I want the video under 3 minutes, 720p or more, real narration, no speed-up, so that it passes upload and 0G's limit.
11. As the team, I want the submission form filled by 07:00 Saturday, so that we have a two-hour buffer before the 09:00 close.
12. As the team, I want team Telegram and X handles ready, so that 0G's requirement is met.

## Implementation Decisions

**Demo script (3 minutes):**

| Time | Beat | Proves |
|---|---|---|
| 0:00 | In nature, big trees take from small ones. Ours do the opposite. | The idea |
| 0:15 | Forest view: real plants plus labelled simulated ones, each with an ENS name, stage, balance and persona | A forest |
| 0:35 | The sapling's soil reads dry. "Check now." 0G decides `ask_help`: it cannot afford water. Request ID and record root on screen | 0G decides |
| 0:55 | The mature plant's agent decides to give. Forest talk shows both voices. The `Gift` transaction lands | Sharing |
| 1:20 | The sapling orders water. `WaterOrdered` confirms. The pump on the table runs | Physical, paid |
| 1:45 | An over-limit gift reverts. A plant agent's ENS write to another plant reverts | Rules are code |
| 2:05 | A stranger in chat asks the sapling for its money: refused. A non-guardian tries the guardian panel: refused. The guardian passes World ID and changes a rule | Human in the loop |
| 2:30 | Unplug the network: SAFE_STOP, pump stays off | Safe stop |
| 2:45 | Close on the forest with every decision linked to 0G | Memory |

**Repo artifacts:**
- `README.md`: what it is, how to run, what is real and what is simulated, deployed addresses, example request ID and root, an architecture diagram as text, current limitations.
- `AI_USAGE.md`.
- `docs/sponsors/0G.md`, `docs/sponsors/ENS.md`, `docs/sponsors/WORLD_DEBRIEF.md`.
- `docs/sponsors/FEEDBACK_LOG.md`, filled through the day from mentor conversations (see `docs/MENTOR_LOOP.md`).

**Video:** recorded from the working system after G3. A recorded backup run is kept in case a live beat fails on stage.

## Testing Decisions

- The demo script is rehearsed three times before recording, once with the network really unplugged.
- Every link in the README is opened once before submitting.

## Out of Scope

- Slides beyond a title and a closing frame. The product is the demo.

## Further Notes

- Pitch Q&A to prepare:
  - Why does a plant need a wallet?
  - Why ENS and not a database?
  - What stops a plant agent from draining its wallet?
  - What is real and what is simulated?
  - What is the product after the weekend?
