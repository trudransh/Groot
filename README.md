# Plant forest (working name)

In nature, big trees take water and nutrients from the small plants around them. Our plants do the opposite.

Each plant is an autonomous agent with its own wallet, name and personality:
- It decides on 0G what it needs.
- It pays for its own water, and a real pump runs only after the payment lands.
- When it is strong, it sends money to the saplings that ask for help.
- Anyone can talk to a plant. Only the forest's World ID-verified guardian can change its rules.

Built at ETHGlobal Mumbai, 6 to 7 Nov 2026. Partners: 0G (Physical AI, Wildcard), ENS v2, World ID.

## Status

Planning done, build starts Friday 6 Nov. Everything below the line is filled in as it lands.

## Start here

| You want to | Read |
|---|---|
| Understand the product and the decisions | `docs/superpowers/specs/2026-11-06-plant-forest-design.md` |
| Know the words we use | `GLOSSARY.md` |
| Build against another workstream | `docs/specs/00-interfaces.md` |
| Build your part | `docs/specs/01-station.md` to `docs/specs/08-ship.md` |
| Pick a task | `.scratch/plant-forest/issues/` |
| Follow the day | `docs/RUN_SHEET.md` |
| Talk to mentors and sponsors | `docs/MENTOR_LOOP.md` |
| Work with an AI agent in this repo | `AGENTS.md` (Claude Code reads `CLAUDE.md`) |

## Set up the same skills on your machine

The plans and tickets are written for two Claude Code plugins. Install them once:

```bash
claude plugin install superpowers@claude-plugins-official
claude plugin install mattpocock-skills@claude-plugins-official
```

If the official marketplace is not available in your Claude Code:

```bash
claude plugin marketplace add obra/superpowers-marketplace
claude plugin install superpowers@superpowers-marketplace
claude plugin marketplace add mattpocock/skills
claude plugin install mattpocock-skills@mattpocock
```

The repo is already configured for mattpocock-skills (`docs/agents/`), so `/setup-matt-pocock-skills` is only needed to switch the tickets to GitHub Issues.

---

## Deployed

| What | Network | Address or name |
|---|---|---|
| Forest | 0G Galileo (16602) | |
| Plant wallets | 0G Galileo (16602) | |
| Forest name | Sepolia ENS v2 | `ourforest.eth` (placeholder) |

## Proof

| What | Value |
|---|---|
| Example 0G compute request ID | |
| Example decision record root on 0G Storage | |
| Reference episode log root (replay this) | |

## What is real and what is simulated

## Run it

## Replay a run

## Limitations
