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
| Fri 06 Nov | groot/ | Groot LiveKit voice agent + Next.js client, ported and trimmed from our solenegpt repo by Claude Code (one persona, no auth/payments) | | |
| Fri 06 Nov | agent/src/decider, agent/src/pump | 0G `ZeroGDecider` and broker adapter, pump delivery rules and MCP client, with tests, drafted with Claude Code | | |
| Sat 07 Nov | groot/agent, scripts/ens | Removed mainnet ENS fallback from Groot wallet resolution (with test); `register-name.ts` + `createPersonName` to register a personal .eth name on Sepolia ENS v2, drafted with Claude Code | | |
| Sat 07 Nov | groot/agent | `!Nml` chat command that changes the reservoir level directly, skipping the LLM (`water.level_command`, `water.change_level`, `Assistant.on_user_turn_completed`), with tests, drafted with Claude Code | | |
| Sat 07 Nov | groot/agent, groot/client, scripts/ens | Distress calls: watcher, answer_distress decision with water/money/reward rules, objective switch, `!distress on/off` command, reservoir server signal route, client display, with tests, drafted with Claude Code | | |
| Sat 07 Nov | groot/agent | Own distress signal for pump-less plants (`signal_distress`, setText on the forest resolver found via ENS), with tests, drafted with Claude Code | | |
| Sat 07 Nov | groot/client | Mobile fixes: diary and plant sidebar as slide-over panels under md, lookbehind-free bare-URL regex for older iOS Safari, clear message when mic/camera are hidden on a plain-http page, drafted with Claude Code | | Checked in Playwright at iPhone 13 and 1280px viewports |
| Sat 07 Nov | groot/client | Push-to-talk on phones: aligned call controls, filled pressed state, no iOS long-press callout or sticky hover, 'Keep holding to talk' hint after a quick tap, drafted with Claude Code | | Checked with emulated touch events at iPhone 13 viewport |
| Sat 07 Nov | groot/agent | Switched 0G model to deepseek-v4-flash (text, tools) with deepseek-v4-flash-vision-exp for selfie looks, thinking disabled on every 0G call for speed, with tests, drafted with Claude Code | | Live 0G latency and tool-call checks |
