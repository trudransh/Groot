import { createApi } from '../src/api/handlers.js'
import { startServer } from '../src/api/server.js'
import { buildRuntimes } from '../src/live/runtime.js'

const plants = buildRuntimes(process.env)
if (plants.size === 0) throw new Error('no plant keys found: set GROOT_PRIVATE_KEY and/or SAPLING_PRIVATE_KEY in agent/.env')

const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 8787)
const token = process.env.AGENT_API_TOKEN || undefined
const api = createApi({ plants, now: () => Math.floor(Date.now() / 1000) })
const s = await startServer({ api, port, host, token })
console.log(`forest agent on http://${host}:${s.port} for ${[...plants.keys()].join(', ')}${token ? ' (token required)' : ''}`)
