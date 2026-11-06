import { createZeroGPort } from '../src/decider/broker.js'
import { ZeroGDecider } from '../src/decider/zeroG.js'
import type { CheckpointContext } from '../src/types.js'

const key = process.env.SMOKE_PRIVATE_KEY
if (!key) throw new Error('set SMOKE_PRIVATE_KEY in agent/.env')

const port = await createZeroGPort(key, process.env.ZERO_G_RPC_URL!, process.env.ZG_PROVIDER || undefined)
console.log('provider', port.provider, 'model', port.model)

const name = 'banyan-01.ourforest.eth'
const ctx: CheckpointContext = {
  plantName: name,
  plantWallet: '0x0000000000000000000000000000000000000001',
  reading: { plantName: name, mode: 'simulated', ts: Math.floor(Date.now() / 1000), moisture: 0.12 },
  stage: 'mature',
  persona: 'calm elder who looks after the saplings',
  balanceWei: 10n ** 18n,
  reserveWei: 10n ** 17n,
  giftedInWindowWei: 0n,
  shareLimitBps: 2500,
  waterPriceWeiPerMl: 10n ** 12n,
  maxWaterMlPerOrder: 150,
  waterMlToday: 0,
  maxWaterMlPerDay: 500,
  openHelpRequests: [],
  ownOpenRequestId: 0,
}

const r = await new ZeroGDecider(port, { timeoutMs: 30000 }).decide(ctx)
console.log(JSON.stringify(r, null, 2))
if (!r.zeroG?.requestId) process.exit(1)
