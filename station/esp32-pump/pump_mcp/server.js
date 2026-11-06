#!/usr/bin/env node
// MCP server for the ESP32 plant pump (pump_wifi firmware).
// Env: PUMP_URL (default http://172.20.10.2), PUMP_TOKEN (required for run/stop).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.PUMP_URL || "http://172.20.10.2").replace(/\/+$/, "");
const TOKEN = process.env.PUMP_TOKEN || "";
const TIMEOUT_MS = Number(process.env.PUMP_TIMEOUT_MS || 5000);
const RESERVOIR_URL = (process.env.RESERVOIR_URL || "").replace(/\/+$/, "");
const PLANT_LABEL = (process.env.PLANT_LABEL || "").trim().toLowerCase();
const ML_PER_SECOND = Number(process.env.PUMP_ML_PER_SECOND || 20);

async function drainReservoir(seconds) {
  if (!RESERVOIR_URL || !PLANT_LABEL) return { skipped: "RESERVOIR_URL or PLANT_LABEL not set" };
  const ml = Math.round(seconds * ML_PER_SECOND);
  try {
    const res = await fetch(`${RESERVOIR_URL}/use/${PLANT_LABEL}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ml }),
      signal: AbortSignal.timeout(120000),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok ? { usedMl: ml, ...body } : { usedMl: ml, error: body.error || `HTTP ${res.status}` };
  } catch (e) {
    return { usedMl: ml, error: `reservoir unreachable (${e.message})` };
  }
}

async function call(path, { auth = false, method = "GET" } = {}) {
  const headers = {};
  if (auth) {
    if (!TOKEN) throw new Error("PUMP_TOKEN env var is not set");
    headers["X-Token"] = TOKEN;
  }
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`Pump unreachable at ${BASE} (${e.name === "TimeoutError" ? "timeout" : e.message}). Is this machine on the same network as the ESP32?`);
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error || text}`);
  return body;
}

const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: String(e.message || e) }] });

const server = new McpServer({ name: "plant-pump", version: "1.0.0" });

server.registerTool(
  "pump_status",
  {
    title: "Pump status",
    description: "Get pump state: on/off, milliseconds remaining in the current run, device IP and uptime. Read-only.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => { try { return ok(await call("/status")); } catch (e) { return fail(e); } }
);

server.registerTool(
  "pump_run",
  {
    title: "Run pump",
    description:
      "Turn the water pump on for N seconds (1-60), then it turns off automatically. " +
      "Calling again while running resets the timer, but the device hard-caps any continuous run at 60s. " +
      "Each run draws seconds x PUMP_ML_PER_SECOND ml from the plant's reservoir and lowers its level.",
    inputSchema: { seconds: z.number().int().min(1).max(60).describe("Run time in seconds, 1-60") },
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  async ({ seconds }) => {
    let pump;
    try { pump = await call(`/pump?seconds=${seconds}`, { auth: true, method: "POST" }); }
    catch (e) { return fail(e); }
    return ok({ ...pump, reservoir: await drainReservoir(seconds) });
  }
);

server.registerTool(
  "pump_stop",
  {
    title: "Stop pump",
    description: "Turn the pump off immediately.",
    inputSchema: {},
    annotations: { idempotentHint: true },
  },
  async () => { try { return ok(await call("/kill", { auth: true, method: "POST" })); } catch (e) { return fail(e); } }
);

await server.connect(new StdioServerTransport());
console.error(`[plant-pump] MCP ready, target ${BASE}`);
