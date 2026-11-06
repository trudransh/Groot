export const SIGNAL = { ok: '0', thirsty: '1' } as const
export type SignalCode = (typeof SIGNAL)[keyof typeof SIGNAL]

export const PLANTS_KEY = 'forest.plants'
export const signalKey = (plantLabel: string) => `signal.${plantLabel}`

export function parseSignal(value: string | null | undefined): SignalCode | null {
  return value === SIGNAL.ok || value === SIGNAL.thirsty ? value : null
}
