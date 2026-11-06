import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { readReservoirs, setReservoir, type Forest } from './forest.js'
import { clientsFor, pub } from './env.js'
import { RESERVOIR_MAX_ML, parseReservoir } from './signal.js'

const PORT = Number(process.env.ADMIN_PORT ?? 8790)
const forest: Forest = JSON.parse(readFileSync('deployments/sepolia.json', 'utf8'))
const guardian = clientsFor('GUARDIAN_KEY')

const reply = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const body = async (req: IncomingMessage) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return null
  }
}

const tx = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`

async function change(res: ServerResponse, label: string, delta: number) {
  const levels = await readReservoirs(pub as never, forest.name)
  const tree = levels.find((l) => l.label === label)
  if (!tree) return reply(res, 404, { error: `${label} is not a tree in ${forest.name}` })
  if (tree.ml === null && delta < 0) return reply(res, 409, { error: `${label} has no reservoir` })
  const ml = Math.min(RESERVOIR_MAX_ML, Math.max(0, (tree.ml ?? 0) + delta))
  const hash = await setReservoir(guardian, forest, label, ml)
  return reply(res, 200, { plant: `${label}.${forest.name}`, before: tree.ml, ml, tx: tx(hash) })
}

const USAGE = 'GET /reservoir | POST /refill/<plant> {"ml":n} | POST /use/<plant> {"ml":n} | PUT /reservoir/<plant> {"ml":n|null}'

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const [, route, label] = url.pathname.split('/')
    if (req.method === 'GET' && route === 'reservoir' && !label) {
      return reply(res, 200, { forest: forest.name, maxMl: RESERVOIR_MAX_ML, reservoirs: await readReservoirs(pub as never, forest.name) })
    }
    if (!label || !/^[a-z0-9-]+$/.test(label)) return reply(res, 404, { error: USAGE })
    const input = await body(req)
    if (input === null) return reply(res, 400, { error: 'body must be JSON' })
    if (req.method === 'POST' && (route === 'refill' || route === 'use')) {
      const ml = parseReservoir(input.ml)
      if (!ml) return reply(res, 400, { error: `ml must be a whole number from 1 to ${RESERVOIR_MAX_ML}` })
      return change(res, label, route === 'refill' ? ml : -ml)
    }
    if (req.method === 'PUT' && route === 'reservoir') {
      const ml = input.ml === null ? null : parseReservoir(input.ml)
      if (input.ml !== null && ml === null) return reply(res, 400, { error: `ml must be a whole number from 0 to ${RESERVOIR_MAX_ML}, or null for no reservoir` })
      const levels = await readReservoirs(pub as never, forest.name)
      if (!levels.some((l) => l.label === label)) return reply(res, 404, { error: `${label} is not a tree in ${forest.name}` })
      return reply(res, 200, { plant: `${label}.${forest.name}`, ml, tx: tx(await setReservoir(guardian, forest, label, ml)) })
    }
    return reply(res, 404, { error: USAGE })
  } catch (e) {
    return reply(res, 500, { error: e instanceof Error ? e.message : String(e) })
  }
}).listen(PORT, '127.0.0.1', () => console.log(`reservoir server on http://127.0.0.1:${PORT} (${forest.name}): ${USAGE}`))
