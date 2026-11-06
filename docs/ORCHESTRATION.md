# Orchestration: how coding agents build and check this repo

One person runs the loop per workstream. Each ticket goes through the same five steps, and nothing reaches a commit without passing all of them.

## The loop for one ticket

1. **Claim.** Pick a frontier ticket in `.scratch/plant-forest/issues/` (all blockers `resolved`). Put your name on `Owner:` and set `Status: claimed`.
2. **Tester** writes the failing tests from the spec. Read its report: every test must fail for the right reason.
3. **Builder** implements until the tests pass. Read its deviations list.
4. **Verifier** runs every check and writes `docs/STATUS.md`. Anything red goes back to the Builder with the exact error.
5. **Reviewer** reviews against spec, interfaces and safety rules. Any Blocker goes back to the Builder. Repeat steps 3 to 5 until the review passes.
6. **Human:** read the diff, run the ticket's live check yourself, commit under your own name with one feature per commit, log the AI part in `AI_USAGE.md`, set `Status: resolved`.

## Prompts to paste in Claude Code

Start a ticket:

```
Use the tester agent on .scratch/plant-forest/issues/03-tracer-one-simulated-plant-decides.md. Then use the builder agent until those tests pass. Then the verifier agent. Then the reviewer agent. Loop builder, verifier and reviewer until the reviewer says PASS. Stop before committing and show me the diff summary.
```

Before a gate:

```
Use the verifier agent for gate G1 in docs/RUN_SHEET.md, then the demo-checker agent. Summarise what is red.
```

## Running lanes in parallel

- Lanes that never touch the same folder can run at once: contracts, agent, station, app, ENS scripts.
- `docs/specs/00-interfaces.md` is shared. A change to it is announced to the whole team before anyone builds against it.
- Two agents never work in the same folder at the same time. Use `superpowers:using-git-worktrees` if one person runs two lanes.

## Checks that never get skipped

- Every 0G decision is real and stored before any onchain action.
- No address in source code. No key printed.
- Simulated and replay are labelled.
- The pump runs only after a confirmed paid order.
