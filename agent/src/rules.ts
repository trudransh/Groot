import { ACTIONS, type CheckpointContext, type Decision } from './types.js'

export type RuleOptions = { minConfidence: number; minWaterGapS: number; now: number }

export type RuleResult = { finalDecision: Decision; rulesApplied: string[] }

const WET_THRESHOLD = 0.7
const MAX_REASON = 200

const isPositiveWei = (v: unknown): v is string => typeof v === 'string' && /^[0-9]+$/.test(v) && BigInt(v) > 0n

function wait(reason: string, confidence: number, rulesApplied: string[]): RuleResult {
  return { finalDecision: { action: 'wait', reason: reason.slice(0, MAX_REASON), confidence }, rulesApplied }
}

function isValid(d: Decision): boolean {
  if (!ACTIONS.includes(d.action)) return false
  if (typeof d.reason !== 'string') return false
  if (typeof d.confidence !== 'number' || !(d.confidence >= 0 && d.confidence <= 1)) return false
  if (d.action === 'water') return Number.isInteger(d.waterMl) && (d.waterMl as number) >= 1
  if (d.action === 'ask_help') return isPositiveWei(d.amountWei)
  if (d.action === 'give') {
    return isPositiveWei(d.amountWei) && typeof d.toPlant === 'string' && d.toPlant.length > 0 && Number.isInteger(d.helpRequestId)
  }
  return true
}

function giveAllowed(ctx: CheckpointContext, d: Decision): boolean {
  const amount = BigInt(d.amountWei as string)
  if (d.toPlant === ctx.plantName) return false
  const req = ctx.openHelpRequests.find((r) => r.id === d.helpRequestId && r.plantName === d.toPlant)
  if (!req) return false
  if (amount > req.amountWei - req.filledWei) return false
  if (ctx.balanceWei - amount < ctx.reserveWei) return false
  const surplus = ctx.balanceWei > ctx.reserveWei ? ctx.balanceWei - ctx.reserveWei : 0n
  const limit = (surplus * BigInt(ctx.shareLimitBps)) / 10000n
  return ctx.giftedInWindowWei + amount <= limit
}

export function applyRules(ctx: CheckpointContext, decision: Decision | null, opts: RuleOptions): RuleResult {
  if (decision === null) return wait('0G did not answer in time', 0, ['zero_g_timeout'])
  if (!isValid(decision)) return wait('0G answer did not match the decision shape', 0, ['invalid_decision'])

  const d: Decision = { ...decision, reason: decision.reason.slice(0, MAX_REASON) }
  if (d.confidence < opts.minConfidence) return wait(d.reason, d.confidence, ['low_confidence'])

  if (d.action === 'ask_help' && ctx.ownOpenRequestId !== 0) return wait(d.reason, d.confidence, ['request_already_open'])

  if (d.action === 'give') {
    return giveAllowed(ctx, d) ? { finalDecision: d, rulesApplied: [] } : wait(d.reason, d.confidence, ['give_breaks_rules'])
  }

  if (d.action !== 'water') return { finalDecision: d, rulesApplied: [] }

  const last = ctx.reading.lastWateredTs
  if (last !== undefined && opts.now - last < opts.minWaterGapS) return wait(d.reason, d.confidence, ['min_water_gap'])
  if (ctx.reading.moisture >= WET_THRESHOLD) return wait(d.reason, d.confidence, ['soil_wet'])

  const rules: string[] = []
  const allowed = Math.min(ctx.maxWaterMlPerOrder, ctx.maxWaterMlPerDay - ctx.waterMlToday)
  if (allowed <= 0) return wait(d.reason, d.confidence, ['water_cap'])
  let ml = d.waterMl as number
  if (ml > allowed) {
    ml = allowed
    rules.push('water_cap')
  }

  const cost = BigInt(ml) * ctx.waterPriceWeiPerMl
  if (ctx.balanceWei < cost) {
    rules.push('cannot_afford_water')
    if (ctx.ownOpenRequestId !== 0) return wait(d.reason, d.confidence, [...rules, 'request_already_open'])
    return { finalDecision: { action: 'ask_help', amountWei: cost.toString(), reason: d.reason, confidence: d.confidence }, rulesApplied: rules }
  }

  return { finalDecision: { ...d, waterMl: ml }, rulesApplied: rules }
}
