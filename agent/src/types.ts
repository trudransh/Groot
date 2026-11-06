export type PlantMode = 'real' | 'simulated' | 'replay'

export type Stage = 'sapling' | 'growing' | 'mature'

export type PlantReading = {
  plantName: string
  mode: PlantMode
  ts: number
  moisture: number
  frameJpegB64?: string
  lastWateredTs?: number
}

export type Action = 'water' | 'wait' | 'ask_help' | 'give'

export const ACTIONS: readonly Action[] = ['water', 'wait', 'ask_help', 'give']

export const ACTION_CODE: Record<Action, number> = { water: 0, wait: 1, ask_help: 2, give: 3 }

export type Decision = {
  action: Action
  waterMl?: number
  amountWei?: string
  toPlant?: string
  helpRequestId?: number
  reason: string
  confidence: number
}

export type OpenHelpRequest = { id: number; plantName: string; amountWei: bigint; filledWei: bigint }

export type CheckpointContext = {
  plantName: string
  plantWallet: `0x${string}`
  reading: PlantReading
  stage: Stage
  persona: string
  balanceWei: bigint
  reserveWei: bigint
  giftedInWindowWei: bigint
  shareLimitBps: number
  waterPriceWeiPerMl: bigint
  maxWaterMlPerOrder: number
  waterMlToday: number
  maxWaterMlPerDay: number
  openHelpRequests: OpenHelpRequest[]
  ownOpenRequestId: number
}

export type ZeroGMeta = {
  provider: `0x${string}`
  model: string
  requestId: string
  verified: boolean | null
  raw: string
}

export type RecordLimits = {
  waterPriceWeiPerMl: string
  maxWaterMlPerOrder: number
  waterMlToday: number
  maxWaterMlPerDay: number
  shareLimitBps: number
  minConfidence: number
  minWaterGapS: number
}

export type DecisionRecord = {
  version: 1
  checkpointId: string
  plantName: string
  plantWallet: `0x${string}`
  mode: PlantMode
  ts: number
  inputs: {
    reading: Omit<PlantReading, 'frameJpegB64'> & { frameRoot?: string }
    stage: Stage
    balanceWei: string
    reserveWei: string
    giftedInWindowWei: string
    openHelpRequests: { id: number; plantName: string; amountWei: string; filledWei: string }[]
    ownOpenRequestId: number
    limits?: RecordLimits
  }
  zeroG: ZeroGMeta
  decision: Decision | null
  rulesApplied: string[]
  finalDecision: Decision
}

export type PlantStatus = 'ok' | 'thirsty' | 'giving' | 'safe_stop'

export type DecisionSummary = {
  checkpointId: string
  ts: number
  action: Action
  reason: string
  requestId: string | null
  root: string | null
  txHash: string | null
  rulesApplied: string[]
}

export type PlantView = {
  name: string
  wallet: `0x${string}`
  mode: PlantMode
  stage: string
  persona: string
  balanceWei: string
  reserveWei: string
  moisture: number | null
  status: PlantStatus
  lastDecision: DecisionSummary | null
}

export type TalkLine = {
  ts: number
  plantName: string
  kind: 'ask' | 'give' | 'thanks' | 'water' | 'refuse'
  text: string
  txHash?: string
}

export type GuardianAction =
  | { kind: 'setRules'; waterPriceWeiPerMl: string; shareLimitBps: number; maxWaterMlPerOrder: number; maxWaterMlPerDay: number; nonce: number }
  | { kind: 'setReserve'; plantName: string; reserveWei: string; nonce: number }
  | { kind: 'withdraw'; plantName: string; to: `0x${string}`; amountWei: string; nonce: number }
  | { kind: 'setPersona'; plantName: string; persona: string; nonce: number }
  | { kind: 'setStage'; plantName: string; stage: Stage; nonce: number }
  | { kind: 'resetSafeStop'; plantName: string; nonce: number }
