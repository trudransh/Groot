import { createPublicClient, http, type Hex } from 'viem'
import { sepolia } from 'viem/chains'
import { runCheckpoint } from '../src/checkpoint.js'
import { routerPort } from '../src/decider/router.js'
import { ZeroGDecider } from '../src/decider/zeroG.js'
import { ensSignal } from '../src/live/ensSignal.js'
import { zeroGRecordStore } from '../src/live/storage.js'
import { forestAbi, plantWallet, plantWalletAbi, zeroGClients } from '../src/live/wallet.js'
import { deliverWater } from '../src/pump/deliver.js'
import { McpPump } from '../src/pump/mcp.js'
import type { CheckpointContext } from '../src/types.js'

const ZERO_G_COIN_TYPE = 2147500309n

function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`set ${name} in agent/.env`)
  return v
}

const [label, moistureArg] = process.argv.slice(2)
if (!label || moistureArg === undefined) throw new Error('usage: pnpm checkpoint <plant-label> <moisture 0..1>')
const moisture = Number(moistureArg)
if (!(moisture >= 0 && moisture <= 1)) throw new Error('moisture must be between 0 and 1')

const forestName = need('FOREST_ENS_NAME')
const plantName = `${label}.${forestName}`
const agentKey = need('AGENT_KEY') as Hex
const zeroGRpc = need('ZERO_G_RPC_URL')
const sepoliaRpc = need('SEPOLIA_RPC_URL')

const ens = createPublicClient({ chain: sepolia, transport: http(sepoliaRpc) })
const walletAddress = await ens.getEnsAddress({ name: plantName, coinType: ZERO_G_COIN_TYPE })
if (!walletAddress) throw new Error(`${plantName} has no 0G address record`)
const persona = (await ens.getEnsText({ name: plantName, key: 'forest.persona' })) ?? 'a quiet plant'

const zg = zeroGClients(agentKey, zeroGRpc)
const forest = await zg.pub.readContract({ address: walletAddress, abi: plantWalletAbi, functionName: 'forest' })
const [balanceWei, reserveWei, price, perOrder, perDay] = await Promise.all([
  zg.pub.getBalance({ address: walletAddress }),
  zg.pub.readContract({ address: walletAddress, abi: plantWalletAbi, functionName: 'reserveWei' }),
  zg.pub.readContract({ address: forest, abi: forestAbi, functionName: 'waterPriceWeiPerMl' }),
  zg.pub.readContract({ address: forest, abi: forestAbi, functionName: 'maxWaterMlPerOrder' }),
  zg.pub.readContract({ address: forest, abi: forestAbi, functionName: 'maxWaterMlPerDay' }),
])

const now = Math.floor(Date.now() / 1000)
const ctx: CheckpointContext = {
  plantName,
  plantWallet: walletAddress,
  reading: { plantName, mode: process.env.PUMP_URL ? 'real' : 'simulated', ts: now, moisture },
  stage: 'growing',
  persona,
  balanceWei,
  reserveWei,
  giftedInWindowWei: 0n,
  shareLimitBps: 0,
  waterPriceWeiPerMl: price,
  maxWaterMlPerOrder: perOrder,
  waterMlToday: 0,
  maxWaterMlPerDay: perDay,
  openHelpRequests: [],
  ownOpenRequestId: 0,
}

const pump = process.env.PUMP_URL
  ? await McpPump.connect({ serverPath: need('PUMP_MCP_PATH'), pumpUrl: need('PUMP_URL'), token: need('PUMP_TOKEN') })
  : null
const handled = new Set<string>()

const writeSignal = ensSignal(agentKey, sepoliaRpc, forestName, label)

const r = await runCheckpoint(
  {
    decider: new ZeroGDecider(routerPort(need('ZG_API_KEY'), process.env.ZG_BASE_URL || undefined, process.env.ZG_MODEL || undefined), { timeoutMs: 30000 }),
    store: zeroGRecordStore(agentKey, zeroGRpc, need('ZERO_G_STORAGE_INDEXER')),
    wallet: plantWallet(zg, walletAddress),
    water: pump
      ? async (orderId, ml) => {
          const d = await deliverWater(
            { pump, handled, mlPerSecond: Number(need('PUMP_ML_PER_SECOND')), maxPumpSeconds: Number(process.env.PUMP_MAX_SECONDS || 20), wetThreshold: Number(process.env.WET_THRESHOLD || 0.7) },
            { wallet: walletAddress, orderId, ml },
            moisture,
          )
          console.log('pump', d)
        }
      : undefined,
    signal: (status) => writeSignal(status === 'ok' ? 'ok' : 'thirsty'),
    onError: (stage, e) => console.error(`[${stage}]`, e instanceof Error ? e.message : e),
    now: () => now,
    minConfidence: Number(process.env.MIN_CONFIDENCE || 0.6),
    minWaterGapS: Number(process.env.MIN_WATER_GAP_S || 600),
  },
  ctx,
  process.env.LAST_STATUS as never,
)

console.log(JSON.stringify({ status: r.status, ...r.summary, reading: r.record.inputs.reading, zeroG: r.record.zeroG }, null, 2))
if (r.summary.txHash) console.log(`tx    https://chainscan.0g.ai/tx/${r.summary.txHash}`)
if (r.summary.root) console.log(`root  ${r.summary.root}`)
await pump?.close()
