import { describe, expect, it, vi } from 'vitest'
import { runCheckpoint } from '../src/checkpoint.js'
import type { DeciderResult } from '../src/decider/types.js'
import { replayRecord } from '../src/replay.js'
import type { CheckpointContext, DecisionRecord } from '../src/types.js'

const ROOT = `0x${'ab'.repeat(32)}` as const

const ctx = {
  plantName: 'groot.vantaraa.eth',
  plantWallet: '0x0000000000000000000000000000000000000001',
  reading: { plantName: 'groot.vantaraa.eth', mode: 'real', ts: 5000, moisture: 0.2, lastWateredTs: 4800 },
  stage: 'growing',
  persona: 'comic',
  balanceWei: 10n ** 18n,
  reserveWei: 0n,
  giftedInWindowWei: 0n,
  shareLimitBps: 0,
  waterPriceWeiPerMl: 10n ** 12n,
  maxWaterMlPerOrder: 150,
  waterMlToday: 100,
  maxWaterMlPerDay: 500,
  openHelpRequests: [],
  ownOpenRequestId: 0,
} as CheckpointContext

async function stored(decision: DeciderResult) {
  let record: DecisionRecord | undefined
  await runCheckpoint(
    {
      decider: { decide: async () => decision },
      store: { put: vi.fn(async (r: DecisionRecord) => ((record = JSON.parse(JSON.stringify(r))), { root: ROOT })) },
      wallet: { orderWater: vi.fn(async () => ({ txHash: ROOT, orderId: 1n })), logDecision: vi.fn(async () => ROOT) },
      now: () => 5000,
      minConfidence: 0.6,
      minWaterGapS: 600,
    },
    ctx,
  )
  return record!
}

const zeroG = { provider: '0x00000000000000000000000000000000000000aa' as const, model: 'm', requestId: 'r', verified: null, raw: '{}' }

describe('replayRecord', () => {
  it('stores the limits the rules ran with', async () => {
    const record = await stored({ decision: { action: 'wait', reason: 'ok', confidence: 0.9 }, zeroG })
    expect(record.inputs.limits).toEqual({
      waterPriceWeiPerMl: '1000000000000',
      maxWaterMlPerOrder: 150,
      waterMlToday: 100,
      maxWaterMlPerDay: 500,
      shareLimitBps: 0,
      minConfidence: 0.6,
      minWaterGapS: 600,
    })
  })

  it('reaches the same final decision and rules as the stored record', async () => {
    const record = await stored({ decision: { action: 'water', waterMl: 120, reason: 'dry', confidence: 0.9 }, zeroG })
    expect(record.rulesApplied).toEqual(['min_water_gap'])
    const r = replayRecord(record)
    expect(r.matches).toBe(true)
    expect(r.replayed).toEqual({ finalDecision: record.finalDecision, rulesApplied: record.rulesApplied })
  })

  it('flags a record whose final decision does not follow from its inputs', async () => {
    const record = await stored({ decision: { action: 'water', waterMl: 120, reason: 'dry', confidence: 0.9 }, zeroG })
    const tampered = { ...record, finalDecision: { action: 'water' as const, waterMl: 120, reason: 'dry', confidence: 0.9 }, rulesApplied: [] }
    const r = replayRecord(tampered)
    expect(r.matches).toBe(false)
  })

  it('replays a 0G timeout as a wait with zero_g_timeout', async () => {
    const record = await stored({ decision: null, zeroG: null })
    expect(replayRecord(record).matches).toBe(true)
  })

  it('cannot replay a record without limits', async () => {
    const record = await stored({ decision: { action: 'wait', reason: 'ok', confidence: 0.9 }, zeroG })
    delete record.inputs.limits
    expect(() => replayRecord(record)).toThrow(/limits/)
  })
})
