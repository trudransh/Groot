# Plant forest: guide for agents

Autonomous plant agents that share money instead of competing, growing as a forest. Each plant decides on 0G, pays for its own water from its own wallet, lives as an ENS name, and is protected by a World ID-verified guardian. Built at ETHGlobal Mumbai, 6 to 7 Nov 2026.

## Before any work

1. Read `GLOSSARY.md` and use its words in code, tests, commits and tickets.
2. Read `docs/specs/00-interfaces.md`. It is the contract between workstreams: every shared type, event, endpoint and record key. Change it there first, then in code.
3. Read the spec for your workstream and the ADRs in `docs/adr/` that touch it.
4. Pick your work from the frontier in `.scratch/plant-forest/issues/` (open, all blockers resolved). Set `Status: claimed` before you start.

## Map

| Workstream | Folder | Spec | Plan |
|---|---|---|---|
| WS-STATION | `station/` | `docs/specs/01-station.md` | ticket 08 |
| WS-AGENT | `agent/` | `docs/specs/02-agent-service.md` | `docs/superpowers/plans/2026-11-06-agent-checkpoint.md` |
| WS-SIM | `agent/src/sim/` | `docs/specs/03-sim-and-replay.md` | tickets 03, 11 |
| WS-CONTRACTS | `contracts/` | `docs/specs/04-contracts.md` | `docs/superpowers/plans/2026-11-06-forest-contracts.md` |
| WS-ENS | `scripts/ens/` | `docs/specs/05-ens-namespace.md` | tickets 06, 12 |
| WS-GUARDIAN | `agent/src/guardian/`, `app/` | `docs/specs/06-guardian-world-id.md` | ticket 10 |
| WS-APP | `app/` | `docs/specs/07-app.md` | ticket 07 |
| WS-SHIP | repo root, `docs/sponsors/` | `docs/specs/08-ship.md` | ticket 13 |
| Personas and voice (part of WS-AGENT) | `agent/src/personas.ts`, `agent/src/voice/`, `agent/scenarios/` | `docs/specs/09-personas-and-voice.md` | tickets 05, 09, 11 |

The approved design behind all of it is `docs/superpowers/specs/2026-11-06-plant-forest-design.md`. The day's gates are in `docs/RUN_SHEET.md`.

## Rules

- **Tests first.** Write the failing test, watch it fail, then write the code.
- **Real 0G, always.** Every decision comes from a real 0G Compute call and is stored on 0G Storage before any onchain action. Simulated plants and replay are labelled everywhere they appear.
- **Addresses come from ENS** or from `contracts/deployments/16602.json`, never from source code.
- **Secrets live in `.env` files.** They are gitignored and never printed.
- **Comments are single-line,** and only where the code cannot say it.
- **Humans commit,** one feature or fix per commit, under their own git identity. Commit messages, PRs and files carry no AI attribution lines.
- **Disclose AI work.** Record what was generated, hand-written and reviewed in `AI_USAGE.md` as you go.
- **Stay in your lane.** Edit files in your workstream's folder. A change another workstream needs goes into its ticket under `## Comments`.

## Done means

- The ticket's acceptance boxes are all ticked, its tests pass, and its live check (if it has one) ran.
- The result is appended under `## Comments` in the ticket and `Status: resolved` is set.

## Agent skills

### Issue tracker

Local markdown tickets under `.scratch/plant-forest/issues/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.
