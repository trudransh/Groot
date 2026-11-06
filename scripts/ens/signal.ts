export const SIGNAL = { ok: '0', thirsty: '1' } as const
export type SignalCode = (typeof SIGNAL)[keyof typeof SIGNAL]

export const PLANTS_KEY = 'forest.plants'
export const signalKey = (plantLabel: string) => `signal.${plantLabel}`

export function parseSignal(value: string | null | undefined): SignalCode | null {
  return value === SIGNAL.ok || value === SIGNAL.thirsty ? value : null
}

export const RESERVOIR_MAX_ML = 1000
export const reservoirKey = (plantLabel: string) => `reservoir.${plantLabel}`

export function parseReservoir(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const ml = typeof value === 'number' ? value : /^\d+$/.test(String(value).trim()) ? Number(String(value).trim()) : NaN
  return Number.isInteger(ml) && ml >= 0 && ml <= RESERVOIR_MAX_ML ? ml : null
}
