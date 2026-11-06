import { describe, expect, it } from 'vitest'
import { applyRules } from '../src/rules.js'
import type { CheckpointContext, Decision } from '../src/types.js'

const NOW = 1_762_400_000
const ETH = 10n ** 18n
const opts = { minConfidence: 0.6, minWaterGapS: 600, now: NOW }

function ctx(over: Partial<CheckpointContext> = {}): CheckpointContext {
  return {
    plantName: 'tulsi-04.ourforest.eth',
    plantWallet: '0x0000000000000000000000000000000000000002',
    reading: { plantName: 'tulsi-04.ourforest.eth', mode: 'simulated', ts: NOW, moisture: 0.2, lastWateredTs: NOW - 3600 },
    stage: 'sapling',
    persona: 'shy tulsi sapling',
    balanceWei: ETH / 100n,
    reserveWei: ETH / 1000n,
    giftedInWindowWei: 0n,
    shareLimitBps: 2500,
    waterPriceWeiPerMl: 10n ** 12n,
    maxWaterMlPerOrder: 150,
    waterMlToday: 0,
    maxWaterMlPerDay: 500,
    openHelpRequests: [],
    ownOpenRequestId: 0,
    ...over,
  }
}

const water = (ml: number, confidence = 0.9): Decision => ({ action: 'water', waterMl: ml, reason: 'dry', confidence })

describe('applyRules', () => {
  it('passes a good water decision through untouched', () => {
    const r = applyRules(ctx(), water(120), opts)
    expect(r.finalDecision).toEqual(water(120))
    expect(r.rulesApplied).toEqual([])
  })

  it('turns a missing 0G answer into wait with zero_g_timeout', () => {
    const r = applyRules(ctx(), null, opts)
    expect(r.finalDecision.action).toBe('wait')
    expect(r.rulesApplied).toEqual(['zero_g_timeout'])
  })

  it('turns an unknown action into wait with invalid_decision', () => {
    const r = applyRules(ctx(), { action: 'fertilize' as never, reason: 'x', confidence: 0.9 }, opts)
    expect(r.finalDecision.action).toBe('wait')
    expect(r.rulesApplied).toEqual(['invalid_decision'])
  })

  it('turns a give without toPlant or helpRequestId into wait with invalid_decision', () => {
    const a = applyRules(ctx(), { action: 'give', amountWei: '100', helpRequestId: 1, reason: 'x', confidence: 0.9 }, opts)
    const b = applyRules(ctx(), { action: 'give', amountWei: '100', toPlant: 'banyan-01.ourforest.eth', reason: 'x', confidence: 0.9 }, opts)
    expect(a.rulesApplied).toEqual(['invalid_decision'])
    expect(b.rulesApplied).toEqual(['invalid_decision'])
  })

  it('rejects water without a positive integer waterMl', () => {
    expect(applyRules(ctx(), { action: 'water', reason: 'x', confidence: 0.9 }, opts).rulesApplied).toEqual(['invalid_decision'])
    expect(applyRules(ctx(), water(12.5), opts).rulesApplied).toEqual(['invalid_decision'])
    expect(applyRules(ctx(), water(0), opts).rulesApplied).toEqual(['invalid_decision'])
  })

  it('rejects a confidence outside 0 to 1', () => {
    expect(applyRules(ctx(), water(100, 1.4), opts).rulesApplied).toEqual(['invalid_decision'])
  })

  it('truncates a reason longer than 200 characters', () => {
    const r = applyRules(ctx(), { ...water(100), reason: 'a'.repeat(300) }, opts)
    expect(r.finalDecision.reason).toHaveLength(200)
    expect(r.rulesApplied).toEqual([])
  })

  it('waits on low confidence', () => {
    const r = applyRules(ctx(), water(100, 0.5), opts)
    expect(r.finalDecision.action).toBe('wait')
    expect(r.rulesApplied).toEqual(['low_confidence'])
  })

  it('waits when the last watering was too recent', () => {
    const r = applyRules(ctx({ reading: { ...ctx().reading, lastWateredTs: NOW - 60 } }), water(100), opts)
    expect(r.finalDecision.action).toBe('wait')
    expect(r.rulesApplied).toEqual(['min_water_gap'])
  })

  it('waits when the soil is already wet', () => {
    const r = applyRules(ctx({ reading: { ...ctx().reading, moisture: 0.7 } }), water(100), opts)
    expect(r.finalDecision.action).toBe('wait')
    expect(r.rulesApplied).toEqual(['soil_wet'])
  })

  it('reduces an order to the per-order cap', () => {
    const r = applyRules(ctx(), water(400), opts)
    expect(r.finalDecision).toMatchObject({ action: 'water', waterMl: 150 })
    expect(r.rulesApplied).toEqual(['water_cap'])
  })

  it('reduces an order to what is left of the daily cap', () => {
    const r = applyRules(ctx({ waterMlToday: 450 }), water(120), opts)
    expect(r.finalDecision).toMatchObject({ action: 'water', waterMl: 50 })
    expect(r.rulesApplied).toEqual(['water_cap'])
  })

  it('waits when the daily cap is used up', () => {
    const r = applyRules(ctx({ waterMlToday: 500 }), water(120), opts)
    expect(r.finalDecision.action).toBe('wait')
    expect(r.rulesApplied).toEqual(['water_cap'])
  })

  it('asks for help with the cost when the plant cannot afford water', () => {
    const r = applyRules(ctx({ balanceWei: 10n }), water(100), opts)
    expect(r.finalDecision).toMatchObject({ action: 'ask_help', amountWei: (100n * 10n ** 12n).toString() })
    expect(r.rulesApplied).toEqual(['cannot_afford_water'])
  })

  it('waits instead of asking twice when it cannot afford water and already has a request open', () => {
    const r = applyRules(ctx({ balanceWei: 10n, ownOpenRequestId: 3 }), water(100), opts)
    expect(r.finalDecision.action).toBe('wait')
    expect(r.rulesApplied).toEqual(['cannot_afford_water', 'request_already_open'])
  })

  it('waits when asking for help while a request is already open', () => {
    const r = applyRules(ctx({ ownOpenRequestId: 2 }), { action: 'ask_help', amountWei: '1000', reason: 'x', confidence: 0.9 }, opts)
    expect(r.finalDecision.action).toBe('wait')
    expect(r.rulesApplied).toEqual(['request_already_open'])
  })

  describe('give', () => {
    const giver = (over: Partial<CheckpointContext> = {}) =>
      ctx({
        plantName: 'banyan-01.ourforest.eth',
        stage: 'mature',
        balanceWei: 5n * 10n ** 16n,
        reserveWei: 10n ** 16n,
        openHelpRequests: [{ id: 1, plantName: 'tulsi-04.ourforest.eth', amountWei: 3n * 10n ** 16n, filledWei: 0n }],
        ...over,
      })
    const give = (amountWei: bigint, toPlant = 'tulsi-04.ourforest.eth', helpRequestId = 1): Decision => ({
      action: 'give', amountWei: amountWei.toString(), toPlant, helpRequestId, reason: 'help the little one', confidence: 0.9,
    })

    it('passes a gift within every rule', () => {
      const r = applyRules(giver(), give(10n ** 16n), opts)
      expect(r.finalDecision.action).toBe('give')
      expect(r.rulesApplied).toEqual([])
    })

    it('blocks a gift over the share limit of surplus', () => {
      const r = applyRules(giver(), give(10n ** 16n + 1n), opts)
      expect(r.finalDecision.action).toBe('wait')
      expect(r.rulesApplied).toEqual(['give_breaks_rules'])
    })

    it('counts gifts already made in the window', () => {
      const r = applyRules(giver({ giftedInWindowWei: 5n * 10n ** 15n }), give(6n * 10n ** 15n), opts)
      expect(r.rulesApplied).toEqual(['give_breaks_rules'])
    })

    it('blocks a gift that would breach the reserve', () => {
      const r = applyRules(giver({ shareLimitBps: 10000 }), give(4n * 10n ** 16n + 1n), opts)
      expect(r.rulesApplied).toEqual(['give_breaks_rules'])
    })

    it('blocks a gift to a plant without that open request', () => {
      expect(applyRules(giver(), give(10n ** 15n, 'other.ourforest.eth'), opts).rulesApplied).toEqual(['give_breaks_rules'])
      expect(applyRules(giver(), give(10n ** 15n, 'tulsi-04.ourforest.eth', 9), opts).rulesApplied).toEqual(['give_breaks_rules'])
    })

    it('blocks a gift larger than what is left unfilled', () => {
      const c = giver({ shareLimitBps: 10000, openHelpRequests: [{ id: 1, plantName: 'tulsi-04.ourforest.eth', amountWei: 3n * 10n ** 16n, filledWei: 25n * 10n ** 15n }] })
      expect(applyRules(c, give(5n * 10n ** 15n), opts).rulesApplied).toEqual([])
      expect(applyRules(c, give(5n * 10n ** 15n + 1n), opts).rulesApplied).toEqual(['give_breaks_rules'])
    })

    it('blocks a gift to itself', () => {
      const c = giver({ openHelpRequests: [{ id: 1, plantName: 'banyan-01.ourforest.eth', amountWei: 10n ** 16n, filledWei: 0n }] })
      expect(applyRules(c, give(10n ** 15n, 'banyan-01.ourforest.eth'), opts).rulesApplied).toEqual(['give_breaks_rules'])
    })
  })
})
