import { describe, expect, it, vi } from 'vitest'
import { runCheckpoint, type CheckpointDeps } from '../src/checkpoint.js'
import type { DeciderResult } from '../src/decider/types.js'
import type { CheckpointContext, Decision } from '../src/types.js'

const ROOT = `0x${'ab'.repeat(32)}` as const
const TX = `0x${'cd'.repeat(32)}` as const

const ctx = {
  plantName: 'banyan-01.vantaraa.eth',
  plantWallet: '0x0000000000000000000000000000000000000001',
  reading: { plantName: 'banyan-01.vantaraa.eth', mode: 'real', ts: 5000, moisture: 0.1 },
  stage: 'mature',
  persona: 'calm elder',
  balanceWei: 10n ** 18n,
  reserveWei: 0n,
  giftedInWindowWei: 0n,
  shareLimitBps: 0,
  waterPriceWeiPerMl: 10n ** 12n,
  maxWaterMlPerOrder: 150,
  waterMlToday: 0,
  maxWaterMlPerDay: 500,
  openHelpRequests: [],
  ownOpenRequestId: 0,
} as CheckpointContext

const zeroG = { provider: '0x00000000000000000000000000000000000000aa' as const, model: 'm', requestId: 'req-1', verified: null, raw: '{}' }

function deps(decision: Decision | null, over: Partial<CheckpointDeps> = {}) {
  const calls: string[] = []
  const result: DeciderResult = { decision, zeroG: decision ? zeroG : null }
  const d: CheckpointDeps = {
    decider: { decide: vi.fn(async () => (calls.push('decide'), result)) },
    store: { put: vi.fn(async () => (calls.push('put'), { root: ROOT })) },
    wallet: {
      orderWater: vi.fn(async () => (calls.push('orderWater'), { txHash: TX, orderId: 7n })),
      logDecision: vi.fn(async () => (calls.push('logDecision'), TX)),
    },
    water: vi.fn(async () => void calls.push('water')),
    signal: vi.fn(async () => void calls.push('signal')),
    now: () => 5000,
    minConfidence: 0.6,
    minWaterGapS: 600,
    ...over,
  }
  return { d, calls }
}

const water: Decision = { action: 'water', waterMl: 100, reason: 'dry', confidence: 0.9 }
const wait: Decision = { action: 'wait', reason: 'fine', confidence: 0.9 }

describe('runCheckpoint', () => {
  it('decides, stores, orders water, runs the pump and signals thirsty, in that order', async () => {
    const { d, calls } = deps(water)
    const r = await runCheckpoint(d, ctx)
    expect(calls).toEqual(['decide', 'put', 'orderWater', 'water', 'signal'])
    expect(d.wallet.orderWater).toHaveBeenCalledWith(100, 'req-1', ROOT)
    expect(d.water).toHaveBeenCalledWith(7n, 100)
    expect(d.signal).toHaveBeenCalledWith('thirsty')
    expect(r.status).toBe('thirsty')
    expect(r.summary).toMatchObject({ action: 'water', requestId: 'req-1', root: ROOT, txHash: TX })
  })

  it('logs a wait onchain with action code 1 and signals ok', async () => {
    const { d, calls } = deps(wait)
    const r = await runCheckpoint(d, ctx)
    expect(calls).toEqual(['decide', 'put', 'logDecision', 'signal'])
    expect(d.wallet.logDecision).toHaveBeenCalledWith(1, 'req-1', ROOT)
    expect(d.signal).toHaveBeenCalledWith('ok')
    expect(r.status).toBe('ok')
  })

  it('does not signal when the status is unchanged', async () => {
    const { d } = deps(wait)
    await runCheckpoint(d, ctx, 'ok')
    expect(d.signal).not.toHaveBeenCalled()
  })

  it('stores the record but makes no onchain call when 0G does not answer', async () => {
    const { d, calls } = deps(null)
    const r = await runCheckpoint(d, ctx)
    expect(calls).toEqual(['decide', 'put', 'signal'])
    expect(r.status).toBe('safe_stop')
    expect(r.summary).toMatchObject({ action: 'wait', requestId: null, txHash: null, rulesApplied: ['zero_g_timeout'] })
  })

  it('makes no onchain call when the store fails', async () => {
    const { d, calls } = deps(water, { store: { put: vi.fn(async () => Promise.reject(new Error('down'))) } })
    const r = await runCheckpoint(d, ctx)
    expect(calls).toEqual(['decide', 'signal'])
    expect(r.status).toBe('safe_stop')
    expect(r.summary.root).toBeNull()
  })

  it('treats an empty root as a failed store', async () => {
    const { d, calls } = deps(water, { store: { put: vi.fn(async () => ({ root: '' as `0x${string}` })) } })
    const r = await runCheckpoint(d, ctx)
    expect(calls).toEqual(['decide', 'signal'])
    expect(r.status).toBe('safe_stop')
  })

  it('does not run the pump when the water order reverts', async () => {
    const { d, calls } = deps(water, {
      wallet: { orderWater: vi.fn(async () => Promise.reject(new Error('WaterCapExceeded'))), logDecision: vi.fn() },
    })
    const r = await runCheckpoint(d, ctx)
    expect(calls).toEqual(['decide', 'put', 'signal'])
    expect(r.status).toBe('safe_stop')
    expect(r.summary.txHash).toBeNull()
  })

  it('records the 0G request id and the rules in the stored record', async () => {
    const { d } = deps({ ...water, confidence: 0.2 })
    await runCheckpoint(d, ctx)
    const record = (d.store.put as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(record).toMatchObject({ version: 1, plantName: ctx.plantName, zeroG: { requestId: 'req-1' }, rulesApplied: ['low_confidence'], finalDecision: { action: 'wait' } })
  })
})
