import type { Decision, PlantStatus } from './types.js'

export function statusFor(finalDecision: Decision, rulesApplied: string[]): PlantStatus {
  if (rulesApplied.includes('zero_g_timeout')) return 'safe_stop'
  if (finalDecision.action === 'water' || finalDecision.action === 'ask_help') return 'thirsty'
  if (finalDecision.action === 'give') return 'giving'
  return 'ok'
}
