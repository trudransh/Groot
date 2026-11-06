# pump_mcp

MCP server (stdio) that wraps the `pump_wifi` ESP32 HTTP API so an agent can control the pump.

## Tools

| Tool | Args | Device route |
|---|---|---|
| `pump_status` | none | `GET /status` |
| `pump_run` | `seconds` integer 1-60 | `POST /pump?seconds=N` |
| `pump_stop` | none | `POST /kill` |

Errors (unreachable device, 400, 401) come back as tool errors with the message.

## Config

| Env var | Default | Notes |
|---|---|---|
| `PUMP_URL` | `http://172.20.10.2` | ESP32 IP, or a Cloudflare Tunnel URL |
| `PUMP_TOKEN` | none | Same value as `API_TOKEN` in the sketch. Required for `pump_run` / `pump_stop` |
| `PUMP_TIMEOUT_MS` | `5000` | HTTP timeout |

The machine running the server must reach `PUMP_URL`: either on the same network as the ESP32, or via a tunnel URL.

## Install

```sh
cd pump_mcp
npm install
```

## Claude Code

```sh
claude mcp add plant-pump \
  -e PUMP_URL=http://172.20.10.2 \
  -e PUMP_TOKEN=<token> \
  -- node /absolute/path/to/pump_mcp/server.js
```

## Claude Desktop / other MCP clients

```json
{
  "mcpServers": {
    "plant-pump": {
      "command": "node",
      "args": ["/absolute/path/to/pump_mcp/server.js"],
      "env": {
        "PUMP_URL": "http://172.20.10.2",
        "PUMP_TOKEN": "<token>"
      }
    }
  }
}
```

## Manual test

```sh
npx @modelcontextprotocol/inspector node server.js
```
