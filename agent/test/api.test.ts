import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApi, type PlantRuntime } from '../src/api/handlers.js'
import { startServer } from '../src/api/server.js'
import type { CheckpointContext, PlantStatus } from '../src/types.js'

const ROOT = `0x${'ab'.repeat(32)}` as const
const TX = `0x${'cd'.repeat(32)}` as const

function runtime(over: Partial<PlantRuntime['checkpoint']> = {}, ctxOver: Partial<CheckpointContext> = {}) {
  const calls: string[] = []
  const rt: PlantRuntime = {
    lastStatus: undefined as PlantStatus | undefined,
    context: (moisture, now) =>
      ({
        plantName: 'groot.vantaraa.eth',
        plantWallet: '0x0000000000000000000000000000000000000001',
        reading: { plantName: 'groot.vantaraa.eth', mode: 'real', ts: now, moisture },
        stage: 'growing',
        persona: 'comic',
        balanceWei: 0n,
        reserveWei: 0n,
        giftedInWindowWei: 0n,
        shareLimitBps: 0,
        waterPriceWeiPerMl: 0n,
        maxWaterMlPerOrder: 150,
        waterMlToday: 0,
        maxWaterMlPerDay: 500,
        openHelpRequests: [],
        ownOpenRequestId: 0,
        ...ctxOver,
      }) as CheckpointContext,
    checkpoint: {
      store: { put: vi.fn(async () => (calls.push('put'), { root: ROOT })) },
      wallet: {
        orderWater: vi.fn(async () => (calls.push('orderWater'), { txHash: TX, orderId: 3n })),
        logDecision: vi.fn(async () => (calls.push('logDecision'), TX)),
      },
      water: vi.fn(async () => (calls.push('pump'), { status: 'delivered', ml: 100, pumpMs: 5000 })),
      minConfidence: 0.6,
      minWaterGapS: 600,
      ...over,
    },
    signal: vi.fn(async () => (calls.push('signal'), TX)),
    delivered: vi.fn(),
  }
  return { rt, calls }
}

const body = { plant: 'groot', ml: 100, requestId: 'zg-req-1', reason: 'leaves drooping in the selfie' }

describe('POST /water', () => {
  it('stores, orders, pumps and signals thirsty, keeping the 0G request id from the caller', async () => {
    const { rt, calls } = runtime()
    const api = createApi({ plants: new Map([['groot', rt]]), now: () => 1000 })
    const r = await api.water(body)
    expect(r.code).toBe(200)
    expect(r.body).toMatchObject({ status: 'delivered', ml: 100, requestId: 'zg-req-1', root: ROOT, txHash: TX })
    expect(calls).toEqual(['put', 'orderWater', 'pump', 'signal'])
    expect(rt.checkpoint.wallet.orderWater).toHaveBeenCalledWith(100, 'zg-req-1', ROOT)
    expect(rt.signal).toHaveBeenCalledWith('thirsty')
    expect(rt.delivered).toHaveBeenCalledWith(100, 1000)
  })

  it('refuses without touching storage or chain when a rule blocks the water', async () => {
    const { rt } = runtime({}, { reading: { plantName: 'groot.vantaraa.eth', mode: 'real', ts: 1000, moisture: 0.9 } })
    rt.context = (_m, now) => ({ ...runtime({}, {}).rt.context(0.9, now), reading: { plantName: 'groot.vantaraa.eth', mode: 'real', ts: now, moisture: 0.9 } })
    const api = createApi({ plants: new Map([['groot', rt]]), now: () => 1000 })
    const r = await api.water({ ...body, moisture: 0.9 })
    expect(r.body).toMatchObject({ status: 'refused', rulesApplied: ['soil_wet'] })
    expect(rt.checkpoint.wallet.orderWater).not.toHaveBeenCalled()
    expect(rt.checkpoint.water).not.toHaveBeenCalled()
  })

  it('reports safe_stop, runs no pump and keeps the plant signalled thirsty when storage fails', async () => {
    const { rt } = runtime({ store: { put: vi.fn(async () => Promise.reject(new Error('no funds'))) } })
    const api = createApi({ plants: new Map([['groot', rt]]), now: () => 1000 })
    const r = await api.water(body)
    expect(r.body).toMatchObject({ status: 'safe_stop', root: null, txHash: null })
    expect(rt.checkpoint.water).not.toHaveBeenCalled()
    expect(rt.signal).toHaveBeenCalledWith('thirsty')
  })

  it('does not write the same signal twice in a row', async () => {
    const { rt } = runtime()
    const api = createApi({ plants: new Map([['groot', rt]]), now: () => 1000 })
    await api.water(body)
    await api.water({ ...body, requestId: 'zg-req-2' })
    expect(rt.signal).toHaveBeenCalledTimes(1)
  })

  it('reports ordered_not_delivered when the pump fails after a confirmed order', async () => {
    const { rt } = runtime({ water: vi.fn(async () => ({ status: 'failed', error: 'esp32 offline' })) })
    const api = createApi({ plants: new Map([['groot', rt]]), now: () => 1000 })
    const r = await api.water(body)
    expect(r.body).toMatchObject({ status: 'ordered_not_delivered', txHash: TX, pump: { status: 'failed' } })
  })

  it('rejects bad input and unknown plants', async () => {
    const { rt } = runtime()
    const api = createApi({ plants: new Map([['groot', rt]]), now: () => 1000 })
    expect((await api.water({ ...body, ml: 0 })).code).toBe(400)
    expect((await api.water({ ...body, requestId: '' })).code).toBe(400)
    expect((await api.water({ ...body, ml: 1.5 })).code).toBe(400)
    expect((await api.water(null)).code).toBe(400)
    expect((await api.water({ ...body, plant: 'oak' })).code).toBe(404)
  })

  it('runs two requests for the same plant one after the other', async () => {
    const order: string[] = []
    const { rt } = runtime({
      store: { put: vi.fn(async () => (order.push('start'), await new Promise((r) => setTimeout(r, 20)), order.push('end'), { root: ROOT })) },
    })
    const api = createApi({ plants: new Map([['groot', rt]]), now: () => 1000 })
    await Promise.all([api.water(body), api.water({ ...body, requestId: 'zg-req-2' })])
    expect(order).toEqual(['start', 'end', 'start', 'end'])
  })
})

describe('signal state after a restart', () => {
  it('reads the live signal before the first write and skips it when unchanged', async () => {
    const { rt } = runtime()
    rt.currentSignal = vi.fn(async () => 'ok' as const)
    const api = createApi({ plants: new Map([['groot', rt]]), now: () => 1000 })
    const r = await api.signal({ plant: 'groot', status: 'ok' })
    expect(r.body).toMatchObject({ status: 'ok', txHash: null, unchanged: true })
    expect(rt.signal).not.toHaveBeenCalled()
    await api.signal({ plant: 'groot', status: 'thirsty' })
    expect(rt.signal).toHaveBeenCalledWith('thirsty')
    expect(rt.currentSignal).toHaveBeenCalledTimes(1)
  })

  it('still writes when the live signal cannot be read', async () => {
    const { rt } = runtime()
    rt.currentSignal = vi.fn(async () => Promise.reject(new Error('rpc down')))
    const api = createApi({ plants: new Map([['groot', rt]]), now: () => 1000 })
    await api.signal({ plant: 'groot', status: 'ok' })
    expect(rt.signal).toHaveBeenCalledWith('ok')
  })
})

describe('POST /signal', () => {
  it('writes the status and returns the tx hash', async () => {
    const { rt } = runtime()
    const api = createApi({ plants: new Map([['groot', rt]]), now: () => 1000 })
    const r = await api.signal({ plant: 'groot', status: 'ok' })
    expect(r).toEqual({ code: 200, body: { status: 'ok', txHash: TX, unchanged: false } })
    expect(rt.signal).toHaveBeenCalledWith('ok')
  })

  it('rejects other statuses and unknown plants', async () => {
    const { rt } = runtime()
    const api = createApi({ plants: new Map([['groot', rt]]), now: () => 1000 })
    expect((await api.signal({ plant: 'groot', status: 'giving' })).code).toBe(400)
    expect((await api.signal({ plant: 'oak', status: 'ok' })).code).toBe(404)
  })

  it('answers 502 when the write fails', async () => {
    const { rt } = runtime()
    rt.signal = vi.fn(async () => Promise.reject(new Error('reverted')))
    const api = createApi({ plants: new Map([['groot', rt]]), now: () => 1000 })
    expect((await api.signal({ plant: 'groot', status: 'thirsty' })).code).toBe(502)
  })
})

describe('http server', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function boot(token?: string) {
    const { rt } = runtime()
    const s = await startServer({ api: createApi({ plants: new Map([['groot', rt]]), now: () => 1000 }), port: 0, host: '127.0.0.1', token })
    close = s.close
    return { base: `http://127.0.0.1:${s.port}`, rt }
  }

  it('serves /water and /health', async () => {
    const { base } = await boot()
    const res = await fetch(`${base}/water`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'delivered' })
    expect((await fetch(`${base}/health`)).status).toBe(200)
    expect((await fetch(`${base}/nope`)).status).toBe(404)
  })

  it('refuses requests without the shared token when one is set', async () => {
    const { base, rt } = await boot('s3cret')
    const bad = await fetch(`${base}/water`, { method: 'POST', body: JSON.stringify(body) })
    expect(bad.status).toBe(401)
    expect(rt.checkpoint.wallet.orderWater).not.toHaveBeenCalled()
    const ok = await fetch(`${base}/water`, { method: 'POST', headers: { 'x-token': 's3cret' }, body: JSON.stringify(body) })
    expect(ok.status).toBe(200)
  })

  it('answers 400 for malformed JSON and 413 for oversized bodies', async () => {
    const { base } = await boot()
    expect((await fetch(`${base}/water`, { method: 'POST', body: '{nope' })).status).toBe(400)
    expect((await fetch(`${base}/water`, { method: 'POST', body: 'x'.repeat(100_000) })).status).toBe(413)
  })
})
