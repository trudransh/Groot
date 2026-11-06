# AI usage

ETHGlobal requires this disclosure. We fill it in as we build, not at the end.

## Planning (before the build)

- The design doc, workstream specs, interfaces, ADRs, glossary, plans, tickets, run sheet and mentor loop in `docs/` and `.scratch/` were drafted with Claude (Claude Code with the superpowers and mattpocock-skills plugins), from our own idea and decisions, and reviewed by the team.
- The product idea, the sponsor choices and every decision marked "team choice" in the design doc are ours.

## Build log

| Time | Area | What AI generated | What we wrote by hand | Who reviewed |
|---|---|---|---|---|
| Fri 06 Nov 10:30 | agent/ | `types.ts`, `rules.ts`, `decider/parse.ts`, `voice/templates.ts`, `personas.ts` and their tests, drafted with Claude Code | | |
| Fri 06 Nov 10:30 | .claude/agents, docs/ORCHESTRATION.md | Coding-agent roles and loop, drafted with Claude Code | | |
| Fri 06 Nov | station/esp32-pump/ | ESP32 pump firmware (`pump_wifi`), its README, and the MCP server (`pump_mcp`), generated with Claude Code from our spec | Hardware wiring, WiFi config | Tested on device (all HTTP routes, pump run under water) |
| Fri 06 Nov | agent/src/decider, agent/src/pump | 0G `ZeroGDecider` and broker adapter, pump delivery rules and MCP client, with tests, drafted with Claude Code | | |
