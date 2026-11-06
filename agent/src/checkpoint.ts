import { applyRules } from './rules.js'
import { statusFor } from './status.js'
import { ACTION_CODE, type CheckpointContext, type DecisionRecord, type DecisionSummary, type PlantStatus } from './types.js'
import type { Decider } from './decider/types.js'

type Hex = `0x${string}`

export type RecordStore = { put(record: DecisionRecord): Promise<{ root: Hex }> }

export type PlantWalletPort = {
  orderWater(ml: number, requestId: string, root: Hex): Promise<{ txHash: Hex; orderId: bigint }>
  logDecision(action: number, requestId: string, root: Hex): Promise<Hex>
}

export type CheckpointDeps = {
  decider: Decider
  store: RecordStore
  wallet: PlantWalletPort
  water?: (orderId: bigint, ml: number) => Promise<unknown>
  signal?: (status: PlantStatus) => Promise<unknown>
  onError?: (stage: string, e: unknown) => void
  now: () => number
  minConfidence: number
  minWaterGapS: number
}

export type CheckpointResult = { summary: DecisionSummary; status: PlantStatus; record: DecisionRecord }

const isRoot = (r: unknown): r is Hex => typeof r === 'string' && /^0x[0-9a-fA-F]{64}$/.test(r)

export async function runCheckpoint(deps: CheckpointDeps, ctx: CheckpointContext, lastStatus?: PlantStatus): Promise<CheckpointResult> {
  const fail = (stage: string, e: unknown) => deps.onError?.(stage, e)
  const ts = deps.now()
  const { decision, zeroG } = await deps.decider.decide(ctx)
  const { finalDecision, rulesApplied } = applyRules(ctx, decision, {
    minConfidence: deps.minConfidence,
    minWaterGapS: deps.minWaterGapS,
    now: ts,
  })

  const { frameJpegB64: _frame, ...reading } = ctx.reading
  const record: DecisionRecord = {
    version: 1,
    checkpointId: `${ctx.plantName}:${ts}`,
    plantName: ctx.plantName,
    plantWallet: ctx.plantWallet,
    mode: ctx.reading.mode,
    ts,
    inputs: {
      reading,
      stage: ctx.stage,
      balanceWei: ctx.balanceWei.toString(),
      reserveWei: ctx.reserveWei.toString(),
      giftedInWindowWei: ctx.giftedInWindowWei.toString(),
      openHelpRequests: [],
      ownOpenRequestId: ctx.ownOpenRequestId,
      limits: {
        waterPriceWeiPerMl: ctx.waterPriceWeiPerMl.toString(),
        maxWaterMlPerOrder: ctx.maxWaterMlPerOrder,
        waterMlToday: ctx.waterMlToday,
        maxWaterMlPerDay: ctx.maxWaterMlPerDay,
        shareLimitBps: ctx.shareLimitBps,
        minConfidence: deps.minConfidence,
        minWaterGapS: deps.minWaterGapS,
      },
    },
    zeroG: zeroG ?? { provider: '0x', model: '', requestId: '', verified: null, raw: '' },
    decision,
    rulesApplied,
    finalDecision,
  }

  let root: Hex | null = null
  try {
    const put = await deps.store.put(record)
    if (isRoot(put.root)) root = put.root
    else fail('store', new Error(`bad root ${String(put.root)}`))
  } catch (e) {
    fail('store', e)
  }

  let txHash: Hex | null = null
  let chainFailed = false
  if (root && zeroG) {
    try {
      if (finalDecision.action === 'water') {
        const ml = finalDecision.waterMl as number
        const order = await deps.wallet.orderWater(ml, zeroG.requestId, root)
        txHash = order.txHash
        await deps.water?.(order.orderId, ml).catch((e) => fail('pump', e))
      } else {
        txHash = await deps.wallet.logDecision(ACTION_CODE[finalDecision.action], zeroG.requestId, root)
      }
    } catch (e) {
      chainFailed = true
      fail('chain', e)
    }
  }

  const status: PlantStatus = root === null || chainFailed ? 'safe_stop' : statusFor(finalDecision, rulesApplied)
  if (status !== lastStatus) await deps.signal?.(status).catch((e) => fail('signal', e))

  return {
    record,
    status,
    summary: {
      checkpointId: record.checkpointId,
      ts,
      action: finalDecision.action,
      reason: finalDecision.reason,
      requestId: zeroG?.requestId ?? null,
      root,
      txHash,
      rulesApplied,
    },
  }
}
