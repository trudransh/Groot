const KEY = process.env['0g_api_key']
if (!KEY) throw new Error('0g_api_key missing in ../.env')
const BASE = process.env.ZG_BASE_URL || 'https://router-api.0g.ai/v1'
const auth = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const models = (await (await fetch(`${BASE}/models`, { headers: auth })).json()) as { data?: { id: string }[] }
console.log('models', models.data?.map((m) => m.id) ?? models)
const model = process.env.ROUTER_MODEL || models.data?.[0]?.id
if (!model) throw new Error('no model available')

const res = await fetch(`${BASE}/chat/completions`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hii' }] }),
})
console.log(res.status, [...res.headers].filter(([k]) => /zg|request|id/i.test(k)))
console.log(await res.text())
