import { createServer, type IncomingMessage } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { createApi } from './handlers.js'

const MAX_BODY = 64 * 1024

type Opts = { api: ReturnType<typeof createApi>; port: number; host: string; token?: string }

class TooLarge extends Error {}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new TooLarge()
    chunks.push(chunk as Buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function tokenOk(expected: string | undefined, given: string | string[] | undefined): boolean {
  if (!expected) return true
  if (typeof given !== 'string') return false
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function startServer(opts: Opts): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    try {
      if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true })
      if (req.method !== 'POST' || (req.url !== '/water' && req.url !== '/signal')) return send(404, { error: 'not_found' })
      if (!tokenOk(opts.token, req.headers['x-token'])) return send(401, { error: 'unauthorized' })
      const input = await readBody(req)
      const out = req.url === '/water' ? await opts.api.water(input) : await opts.api.signal(input)
      send(out.code, out.body)
    } catch (e) {
      if (e instanceof TooLarge) return send(413, { error: 'body_too_large' })
      if (e instanceof SyntaxError) return send(400, { error: 'invalid_json' })
      console.error('[api]', e instanceof Error ? e.message : e)
      send(500, { error: 'internal' })
    }
  })
  return new Promise((resolve) => {
    server.listen(opts.port, opts.host, () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}
