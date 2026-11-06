export interface Pump {
  run(seconds: number): Promise<void>
  stop(): Promise<void>
}

export type DeliverDeps = { pump: Pump; handled: Set<string>; mlPerSecond: number; maxPumpSeconds: number; wetThreshold: number }
export type WaterOrder = { wallet: string; orderId: bigint; ml: number }
export type DeliverResult =
  | { status: 'delivered'; ml: number; pumpMs: number }
  | { status: 'skipped'; reason: 'already_handled' | 'soil_wet' }
  | { status: 'failed'; error: string }

export async function deliverWater(deps: DeliverDeps, order: WaterOrder, moisture: number): Promise<DeliverResult> {
  const key = `${order.wallet.toLowerCase()}:${order.orderId}`
  if (deps.handled.has(key)) return { status: 'skipped', reason: 'already_handled' }
  deps.handled.add(key)
  if (moisture >= deps.wetThreshold) return { status: 'skipped', reason: 'soil_wet' }

  const seconds = Math.min(Math.max(1, Math.ceil(order.ml / deps.mlPerSecond)), deps.maxPumpSeconds)
  try {
    await deps.pump.run(seconds)
  } catch (e) {
    return { status: 'failed', error: e instanceof Error ? e.message : String(e) }
  }
  return { status: 'delivered', ml: Math.round(seconds * deps.mlPerSecond), pumpMs: seconds * 1000 }
}
