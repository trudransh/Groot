import type { Hex } from 'viem'
import type { PlantRuntime } from '../api/handlers.js'
import type { PlantWalletPort } from '../checkpoint.js'
import { deliverWater } from '../pump/deliver.js'
import { McpPump } from '../pump/mcp.js'
import type { CheckpointContext } from '../types.js'
import { ensSignal } from './ensSignal.js'
import { zeroGRecordStore } from './storage.js'
import { plantWallet, zeroGClients } from './wallet.js'

type Env = Record<string, string | undefined>

const DAY_S = 86_400

function need(env: Env, name: string): string {
  const v = env[name]
  if (!v) throw new Error(`set ${name} in agent/.env`)
  return v
}

const hexKey = (k: string) => (k.startsWith('0x') ? k : `0x${k}`) as Hex

function noContract(label: string): PlantWalletPort {
  const fail = async (): Promise<never> => {
    throw new Error(`no PlantWallet on 0G for ${label}: set ${label.toUpperCase()}_PLANT_WALLET`)
  }
  return { orderWater: fail, logDecision: fail }
}

function pumpConnector(env: Env) {
  let pump: Promise<McpPump> | null = null
  return () => {
    pump ??= McpPump.connect({ serverPath: need(env, 'PUMP_MCP_PATH'), pumpUrl: need(env, 'PUMP_URL'), token: need(env, 'PUMP_TOKEN') }).catch((e) => {
      pump = null
      throw e
    })
    return pump
  }
}

export function buildRuntimes(env: Env): Map<string, PlantRuntime> {
  const forestName = need(env, 'FOREST_ENS_NAME')
  const zeroGRpc = need(env, 'ZERO_G_RPC_URL')
  const zeroGChainId = Number(env.ZERO_G_CHAIN_ID || 16661)
  const sepoliaRpc = need(env, 'SEPOLIA_RPC_URL')
  const indexer = need(env, 'ZERO_G_STORAGE_INDEXER')
  const labels = (env.PLANT_LABELS || 'groot,sapling').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const pumpPlants = new Set((env.PUMP_PLANTS || 'groot').split(',').map((s) => s.trim().toLowerCase()))
  const perOrder = Number(env.MAX_WATER_ML_PER_ORDER || 150)
  const perDay = Number(env.MAX_WATER_ML_PER_DAY || 500)
  const connectPump = env.PUMP_URL ? pumpConnector(env) : null
  const handled = new Set<string>()
  const plants = new Map<string, PlantRuntime>()

  for (const label of labels) {
    const rawKey = env[`${label.toUpperCase()}_PRIVATE_KEY`]
    if (!rawKey) continue
    const key = hexKey(rawKey)
    const zg = zeroGClients(key, zeroGRpc, zeroGChainId)
    const walletAddress = env[`${label.toUpperCase()}_PLANT_WALLET`] as Hex | undefined
    const plantName = `${label}.${forestName}`
    const hasPump = connectPump !== null && pumpPlants.has(label)
    let windowStart = 0
    let mlInWindow = 0
    let lastWateredTs: number | undefined

    const signal = ensSignal(key, sepoliaRpc, forestName, label)
    plants.set(label, {
      lastStatus: undefined,
      context(moisture, now): CheckpointContext {
        if (now - windowStart >= DAY_S) {
          windowStart = now
          mlInWindow = 0
        }
        return {
          plantName,
          plantWallet: walletAddress ?? zg.account.address,
          reading: { plantName, mode: hasPump ? 'real' : 'simulated', ts: now, moisture, ...(lastWateredTs === undefined ? {} : { lastWateredTs }) },
          stage: 'growing',
          persona: label,
          balanceWei: 0n,
          reserveWei: 0n,
          giftedInWindowWei: 0n,
          shareLimitBps: 0,
          waterPriceWeiPerMl: 0n,
          maxWaterMlPerOrder: perOrder,
          waterMlToday: mlInWindow,
          maxWaterMlPerDay: perDay,
          openHelpRequests: [],
          ownOpenRequestId: 0,
        }
      },
      checkpoint: {
        store: zeroGRecordStore(key, zeroGRpc, indexer),
        wallet: walletAddress ? plantWallet(zg, walletAddress) : noContract(label),
        water: hasPump
          ? async (orderId, ml) =>
              deliverWater(
                {
                  pump: await connectPump!(),
                  handled,
                  mlPerSecond: Number(need(env, 'PUMP_ML_PER_SECOND')),
                  maxPumpSeconds: Number(env.PUMP_MAX_SECONDS || 20),
                  wetThreshold: Number(env.WET_THRESHOLD || 0.7),
                },
                { wallet: walletAddress ?? zg.account.address, orderId, ml },
                0,
              )
          : undefined,
        onError: (stage, e) => console.error(`[${label}:${stage}]`, e instanceof Error ? e.message : e),
        minConfidence: Number(env.MIN_CONFIDENCE || 0.6),
        minWaterGapS: Number(env.MIN_WATER_GAP_S || 600),
      },
      signal,
      currentSignal: signal.read,
      delivered(ml, now) {
        mlInWindow += ml
        lastWateredTs = now
      },
    })
  }
  return plants
}
