import { runCheckpoint, type CheckpointDeps } from '../checkpoint.js'
import type { Decider } from '../decider/types.js'
import type { CheckpointContext, PlantStatus } from '../types.js'

type Hex = `0x${string}`
type Signal = 'thirsty' | 'ok'

export type PlantRuntime = {
  lastStatus: PlantStatus | undefined
  context(moisture: number, now: number): CheckpointContext
  checkpoint: Omit<CheckpointDeps, 'decider' | 'now' | 'signal'>
  signal(status: Signal): Promise<string>
  currentSignal?(): Promise<Signal | undefined>
  delivered(ml: number, now: number): void
}

export type ApiDeps = { plants: Map<string, PlantRuntime>; now: () => number }
export type HttpResult = { code: number; body: unknown }

export const UNMEASURED_MOISTURE = 0.35
const ZERO_ADDRESS: Hex = '0x0000000000000000000000000000000000000000'
const DEFAULT_MODEL = 'glm-5.3-flash'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null)

type WaterRequest = {
  plant: string
  ml: number
  requestId: string
  reason: string
  confidence: number
  moisture: number
  provider: Hex
  model: string
}

function parseWater(body: unknown): WaterRequest | string {
  if (!isObject(body)) return 'body must be a JSON object'
  const plant = text(body.plant, 64)
  const requestId = text(body.requestId, 128)
  const reason = text(body.reason)
  if (!plant) return 'plant is required'
  if (!requestId) return 'requestId is required'
  if (!reason) return 'reason is required'
  if (typeof body.ml !== 'number' || !Number.isInteger(body.ml) || body.ml < 1 || body.ml > 10_000) return 'ml must be an integer from 1 to 10000'
  const confidence = body.confidence === undefined ? 1 : body.confidence
  if (typeof confidence !== 'number' || !(confidence >= 0 && confidence <= 1)) return 'confidence must be between 0 and 1'
  const moisture = body.moisture === undefined ? UNMEASURED_MOISTURE : body.moisture
  if (typeof moisture !== 'number' || !(moisture >= 0 && moisture <= 1)) return 'moisture must be between 0 and 1'
  const provider = typeof body.provider === 'string' && /^0x[0-9a-fA-F]{40}$/.test(body.provider) ? (body.provider as Hex) : ZERO_ADDRESS
  return { plant, ml: body.ml, requestId, reason, confidence, moisture, provider, model: text(body.model, 64) ?? DEFAULT_MODEL }
}

function passThrough(r: WaterRequest): Decider {
  return {
    decide: async () => ({
      decision: { action: 'water', waterMl: r.ml, reason: r.reason, confidence: r.confidence },
      zeroG: {
        provider: r.provider,
        model: r.model,
        requestId: r.requestId,
        verified: null,
        raw: JSON.stringify({ action: 'water', waterMl: r.ml, reason: r.reason, confidence: r.confidence }),
      },
    }),
  }
}

const asSignal = (s: PlantStatus): Signal => (s === 'ok' ? 'ok' : 'thirsty')

export function createApi(deps: ApiDeps) {
  const queues = new Map<string, Promise<unknown>>()

  function serial<T>(plant: string, job: () => Promise<T>): Promise<T> {
    const run = (queues.get(plant) ?? Promise.resolve()).then(job, job)
    queues.set(plant, run.catch(() => undefined))
    return run
  }

  async function writeSignal(rt: PlantRuntime, status: Signal): Promise<string | null> {
    if (rt.lastStatus === undefined && rt.currentSignal) {
      rt.lastStatus = await rt.currentSignal().catch(() => undefined)
      if (rt.lastStatus === undefined) rt.currentSignal = undefined
    }
    if (status === rt.lastStatus) return null
    const hash = await rt.signal(status)
    rt.lastStatus = status
    return hash
  }

  async function water(input: unknown): Promise<HttpResult> {
    const req = parseWater(input)
    if (typeof req === 'string') return { code: 400, body: { error: req } }
    const rt = deps.plants.get(req.plant)
    if (!rt) return { code: 404, body: { error: 'unknown_plant' } }

    return serial(req.plant, async () => {
      const now = deps.now()
      const ctx = rt.context(req.moisture, now)
      let pump: unknown = null
      const inner = rt.checkpoint
      const r = await runCheckpoint(
        {
          ...inner,
          decider: passThrough(req),
          now: () => now,
          water: inner.water
            ? async (orderId, ml) => {
                pump = await inner.water!(orderId, ml)
              }
            : undefined,
          signal: async (status) => void (await writeSignal(rt, asSignal(status))),
        },
        ctx,
      )

      const base = { requestId: r.summary.requestId, root: r.summary.root, txHash: r.summary.txHash, rulesApplied: r.summary.rulesApplied }
      if (r.status === 'safe_stop') return { code: 200, body: { status: 'safe_stop', ...base } }
      if (r.summary.action !== 'water') return { code: 200, body: { status: 'refused', reason: r.summary.reason, ...base } }

      rt.delivered(req.ml, now)
      const delivered = isObject(pump) && pump.status === 'delivered'
      return {
        code: 200,
        body: { status: delivered ? 'delivered' : 'ordered_not_delivered', ml: req.ml, pump, ...base },
      }
    })
  }

  async function signal(input: unknown): Promise<HttpResult> {
    if (!isObject(input)) return { code: 400, body: { error: 'body must be a JSON object' } }
    const plant = text(input.plant, 64)
    if (!plant) return { code: 400, body: { error: 'plant is required' } }
    if (input.status !== 'thirsty' && input.status !== 'ok') return { code: 400, body: { error: 'status must be thirsty or ok' } }
    const rt = deps.plants.get(plant)
    if (!rt) return { code: 404, body: { error: 'unknown_plant' } }
    const status: Signal = input.status
    return serial(plant, async () => {
      try {
        const txHash = await writeSignal(rt, status)
        return { code: 200, body: { status, txHash, unchanged: txHash === null } }
      } catch (e) {
        return { code: 502, body: { error: 'signal_failed', detail: e instanceof Error ? e.message : String(e) } }
      }
    })
  }

  return { water, signal }
}
