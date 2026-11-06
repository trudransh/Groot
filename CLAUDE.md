# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Only `agent/` is scaffolded so far (pnpm, TypeScript, vitest). `contracts/`, `app/`, `station/` hold READMEs only.

```bash
cd agent
pnpm install
pnpm test                          # vitest run, picks up test/**/*.test.ts
pnpm vitest run test/rules.test.ts # single file
pnpm vitest run -t "min_water_gap" # single test by name
pnpm typecheck                     # tsc --noEmit
```

Current pass/fail state per gate is in `docs/STATUS.md`. Env vars: copy each folder's `.env.example` to `.env`.

## Architecture

Decision pipeline (one plant checkpoint): `PlantReading` (station or simulator) -> agent service asks 0G Compute for a `Decision` JSON -> `agent/src/rules.ts` applies hard rules (can only make a decision safer, e.g. `low_confidence`, `invalid_decision`, `zero_g_timeout` -> `SAFE_STOP`, `min_water_gap`) -> record stored on 0G Storage -> only then onchain action via the plant's PlantWallet contract (0G mainnet, chain 16661). Pump runs only after a confirmed paid order (ADR 0004).

- Money, decisions, contracts live on 0G mainnet; names (ENS v2) live on Sepolia (ADR 0003). Addresses come from ENS or `contracts/deployments/16661.json`, never source.
- `agent/src/`: `types.ts` mirrors `docs/specs/00-interfaces.md`; `decider/` (0G call + parse), `voice/` (plant talk, falls back to templates), `personas.ts`, `sim/` (simulated plants + replay), `guardian/` (World ID).
- `agent/scenarios/demo.json` drives the scripted demo beats; `episodes/` holds replayable run logs.
- `docs/specs/00-interfaces.md` is the cross-workstream contract: change it first, then code. Specs `01`-`09` per workstream, decisions in `docs/adr/`, tickets in `.scratch/plant-forest/issues/`, gates in `docs/RUN_SHEET.md`.

## Gotchas

- `*:Zone.Identifier` files are Windows download artifacts (WSL); ignore them, don't edit or commit.
- `../../plant-forest-specs/` is an older spec-only copy of this repo; work in `plant-forest-v2/`.
- `docs/ORCHESTRATION.md` defines the tester -> builder -> verifier -> reviewer loop per ticket.

## Claude Code skills for this repo

- Execute a plan in `docs/superpowers/plans/` with `superpowers:subagent-driven-development`.
- Build every feature and fix with `superpowers:test-driven-development`.
- Hit a failing test or bug: `superpowers:systematic-debugging`.
- Before saying anything is done: `superpowers:verification-before-completion`. Run the command, read the output.
- Before a teammate merges: `mattpocock-skills:code-review` against the ticket.
- New work that is not in a ticket yet: `/to-tickets`.
- A term or decision gets settled: `mattpocock-skills:domain-modeling`, to update `GLOSSARY.md` or add an ADR.
