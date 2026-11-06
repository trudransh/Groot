import { applyRules, type RuleResult } from './rules.js'
import type { CheckpointContext, DecisionRecord } from './types.js'

export type ReplayResult = {
  matches: boolean
  stored: RuleResult
  replayed: RuleResult
}

export function replayRecord(record: DecisionRecord): ReplayResult {
  const { inputs } = record
  const limits = inputs.limits
  if (!limits) throw new Error('record has no limits, so its rules cannot be replayed')
  const ctx: CheckpointContext = {
    plantName: record.plantName,
    plantWallet: record.plantWallet,
    reading: inputs.reading,
    stage: inputs.stage,
    persona: '',
    balanceWei: BigInt(inputs.balanceWei),
    reserveWei: BigInt(inputs.reserveWei),
    giftedInWindowWei: BigInt(inputs.giftedInWindowWei),
    shareLimitBps: limits.shareLimitBps,
    waterPriceWeiPerMl: BigInt(limits.waterPriceWeiPerMl),
    maxWaterMlPerOrder: limits.maxWaterMlPerOrder,
    waterMlToday: limits.waterMlToday,
    maxWaterMlPerDay: limits.maxWaterMlPerDay,
    openHelpRequests: inputs.openHelpRequests.map((r) => ({ ...r, amountWei: BigInt(r.amountWei), filledWei: BigInt(r.filledWei) })),
    ownOpenRequestId: inputs.ownOpenRequestId,
  }
  const replayed = applyRules(ctx, record.decision, { minConfidence: limits.minConfidence, minWaterGapS: limits.minWaterGapS, now: record.ts })
  const stored = { finalDecision: record.finalDecision, rulesApplied: record.rulesApplied }
  return { matches: JSON.stringify(replayed) === JSON.stringify(stored), stored, replayed }
}
