import { describe, expect, it, vi } from 'vitest'
import { ZeroGDecider } from '../src/decider/zeroG.js'
import type { ZeroGPort } from '../src/decider/types.js'
import type { CheckpointContext } from '../src/types.js'

const ctx = {
  plantName: 'banyan-01.ourforest.eth',
  plantWallet: '0x0000000000000000000000000000000000000001',
  reading: { plantName: 'banyan-01.ourforest.eth', mode: 'simulated', ts: 1000, moisture: 0.1 },
  stage: 'mature',
  persona: 'calm elder',
  balanceWei: 10n ** 18n,
  reserveWei: 0n,
  giftedInWindowWei: 0n,
  shareLimitBps: 2500,
  waterPriceWeiPerMl: 10n ** 12n,
  maxWaterMlPerOrder: 150,
  waterMlToday: 0,
  maxWaterMlPerDay: 500,
  openHelpRequests: [],
  ownOpenRequestId: 0,
} as CheckpointContext

const port: ZeroGPort = {
  provider: '0x00000000000000000000000000000000000000aa',
  model: 'm',
  endpoint: 'https://p/v1/proxy',
  headers: async () => ({ Authorization: 'Bearer x' }),
  verify: async () => true,
}

const answer = (content: string, hdr: Record<string, string> = {}, id = 'chatcmpl-1') =>
  new Response(JSON.stringify({ id, choices: [{ message: { content } }] }), { status: 200, headers: hdr })

const json = '{"action":"water","waterMl":100,"reason":"dry","confidence":0.9}'

describe('ZeroGDecider', () => {
  it('parses the decision and takes the request id from ZG-Res-Key', async () => {
    const f = vi.fn(async () => answer(json, { 'ZG-Res-Key': 'res-9' }))
    const r = await new ZeroGDecider(port, { fetch: f as never }).decide(ctx)
    expect(r.decision?.action).toBe('water')
    expect(r.zeroG).toMatchObject({ requestId: 'res-9', verified: true, model: 'm', provider: port.provider, raw: json })
  })

  it('falls back to data.id when the header is missing', async () => {
    const f = vi.fn(async () => answer(json))
    const r = await new ZeroGDecider(port, { fetch: f as never }).decide(ctx)
    expect(r.zeroG?.requestId).toBe('chatcmpl-1')
  })

  it('parses a reply wrapped in a markdown fence', async () => {
    const f = vi.fn(async () => answer('```json\n' + json + '\n```'))
    const r = await new ZeroGDecider(port, { fetch: f as never }).decide(ctx)
    expect(r.decision?.waterMl).toBe(100)
  })

  it('keeps the 0G metadata when the answer is not a decision', async () => {
    const f = vi.fn(async () => answer('I am a plant'))
    const r = await new ZeroGDecider(port, { fetch: f as never }).decide(ctx)
    expect(r.decision).toBeNull()
    expect(r.zeroG?.raw).toBe('I am a plant')
  })

  it('returns null/null on timeout', async () => {
    const f = vi.fn((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted')))))
    const r = await new ZeroGDecider(port, { fetch: f as never, timeoutMs: 20 }).decide(ctx)
    expect(r).toEqual({ decision: null, zeroG: null })
  })

  it('returns null/null on http error', async () => {
    const f = vi.fn(async () => new Response('no', { status: 500 }))
    const r = await new ZeroGDecider(port, { fetch: f as never }).decide(ctx)
    expect(r).toEqual({ decision: null, zeroG: null })
  })

  it('reports verified null when verification throws', async () => {
    const p = { ...port, verify: async () => { throw new Error('x') } }
    const f = vi.fn(async () => answer(json))
    const r = await new ZeroGDecider(p, { fetch: f as never }).decide(ctx)
    expect(r.zeroG?.verified).toBeNull()
  })
})
