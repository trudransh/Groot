# station (WS-STATION)

Raspberry Pi plant station. Spec: `docs/specs/01-station.md`. Ticket: `.scratch/plant-forest/issues/08-plant-station.md`. Config shape: `docs/specs/00-interfaces.md` section 10.

## esp32-pump

ESP32 relay pump controller over WiFi and an MCP server wrapping it.

- `esp32-pump/pump_wifi/`: Arduino sketch, HTTP API (`/pump`, `/kill`, `/status`), token auth, 60 s hard cap. Setup in its README.
- `esp32-pump/pump_mcp/`: stdio MCP server with `pump_status`, `pump_run`, `pump_stop` tools. Env: `PUMP_URL`, `PUMP_TOKEN`.
