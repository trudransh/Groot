import type { CheckpointContext, Decision, ZeroGMeta } from '../types.js'

export type DeciderResult = { decision: Decision | null; zeroG: ZeroGMeta | null }

export interface Decider {
  decide(ctx: CheckpointContext): Promise<DeciderResult>
}

export type ZeroGPort = {
  provider: `0x${string}`
  model: string
  endpoint: string
  headers(): Promise<Record<string, string>>
  verify(chatId: string | undefined, content: string): Promise<boolean | null>
}
