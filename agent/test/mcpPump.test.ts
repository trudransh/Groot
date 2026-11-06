import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { McpPump } from '../src/pump/mcp.js'

const SERVER = new URL('../../station/esp32-pump/pump_mcp/server.js', import.meta.url).pathname
let esp: Server
let url: string
const hits: string[] = []

beforeAll(async () => {
  esp = createServer((req, res) => {
    hits.push(`${req.method} ${req.url} ${req.headers['x-token'] ?? ''}`)
    res.setHeader('content-type', 'application/json')
    if (req.url?.startsWith('/pump?seconds=0')) {
      res.statusCode = 400
      return void res.end('{"error":"bad seconds"}')
    }
    res.end('{"pump":"on","remaining_ms":5000}')
  })
  await new Promise<void>((r) => esp.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(esp.address() as { port: number }).port}`
})
afterAll(() => esp.close())

describe('McpPump (real pump_mcp server, stub ESP32)', () => {
  it('run sends an authenticated POST /pump', async () => {
    const pump = await McpPump.connect({ serverPath: SERVER, pumpUrl: url, token: 'tok' })
    await pump.run(5)
    await pump.stop()
    await pump.close()
    expect(hits).toContain('POST /pump?seconds=5 tok')
    expect(hits).toContain('POST /kill tok')
  })

  it('turns a device error into a thrown error', async () => {
    const pump = await McpPump.connect({ serverPath: SERVER, pumpUrl: url, token: 'tok' })
    await expect(pump.run(0)).rejects.toThrow()
    await pump.close()
  })
})
