import { describe, expect, it } from 'vitest'
import { deliverWater, type Pump } from '../src/pump/deliver.js'

const cfg = { mlPerSecond: 10, maxPumpSeconds: 20, wetThreshold: 0.7 }
const order = { wallet: '0xabc' as const, orderId: 1n, ml: 100 }

function fakePump() {
  const calls: number[] = []
  const pump: Pump = { run: async (s) => void calls.push(s), stop: async () => {} }
  return { pump, calls }
}

describe('deliverWater', () => {
  it('runs for ml / mlPerSecond seconds and reports what it delivered', async () => {
    const { pump, calls } = fakePump()
    const r = await deliverWater({ pump, handled: new Set(), ...cfg }, order, 0.2)
    expect(calls).toEqual([10])
    expect(r).toEqual({ status: 'delivered', ml: 100, pumpMs: 10000 })
  })

  it('rounds up to a whole second (device takes integer seconds)', async () => {
    const { pump, calls } = fakePump()
    await deliverWater({ pump, handled: new Set(), ...cfg }, { ...order, ml: 55 }, 0.2)
    expect(calls).toEqual([6])
  })

  it('caps the run at maxPumpSeconds', async () => {
    const { pump, calls } = fakePump()
    const r = await deliverWater({ pump, handled: new Set(), ...cfg }, { ...order, ml: 1000 }, 0.2)
    expect(calls).toEqual([20])
    expect(r).toMatchObject({ status: 'delivered', ml: 200 })
  })

  it('fires once per order even if the event is seen twice', async () => {
    const { pump, calls } = fakePump()
    const deps = { pump, handled: new Set<string>(), ...cfg }
    await deliverWater(deps, order, 0.2)
    const r = await deliverWater(deps, order, 0.2)
    expect(calls).toHaveLength(1)
    expect(r).toEqual({ status: 'skipped', reason: 'already_handled' })
  })

  it('skips wet soil', async () => {
    const { pump, calls } = fakePump()
    const r = await deliverWater({ pump, handled: new Set(), ...cfg }, order, 0.8)
    expect(calls).toHaveLength(0)
    expect(r).toEqual({ status: 'skipped', reason: 'soil_wet' })
  })

  it('does not retry a failed pump run (at most once)', async () => {
    const pump: Pump = { run: async () => { throw new Error('unreachable') }, stop: async () => {} }
    const deps = { pump, handled: new Set<string>(), ...cfg }
    expect(await deliverWater(deps, order, 0.2)).toMatchObject({ status: 'failed', error: 'unreachable' })
    expect(await deliverWater(deps, order, 0.2)).toEqual({ status: 'skipped', reason: 'already_handled' })
  })
})
