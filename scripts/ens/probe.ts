import { SEPOLIA_COIN_TYPE, ZERO_G_COIN_TYPE } from './roles.js'
import { signalKey } from './signal.js'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { ENS_V2_SEPOLIA } from './addresses.js'

const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com') })
let failed = 0

for (const [name, address] of Object.entries(ENS_V2_SEPOLIA)) {
  const code = await client.getCode({ address })
  const ok = !!code && code !== '0x'
  if (!ok) failed++
  console.log(ok ? 'OK  ' : 'FAIL', name, address)
}

const rawForest = process.env.FOREST_ENS_NAME?.trim().toLowerCase()
const forest = rawForest && !rawForest.endsWith('.eth') ? `${rawForest}.eth` : rawForest
if (forest) {
  const plants = await client.getEnsText({ name: forest, key: 'forest.plants' }).catch((e) => `ERROR ${e.shortMessage ?? e.message}`)
  console.log(`forest.plants on ${forest}:`, plants)
  for (const label of (plants ?? '').split(',').filter((l) => l && !l.startsWith('ERROR'))) {
    const name = `${label}.${forest}`
    const fail = (e: { shortMessage?: string; message: string }) => `ERROR ${e.shortMessage ?? e.message}`
    const signal = await client.getEnsText({ name: forest, key: signalKey(label) }).catch(fail)
    const wallet = await client.getEnsAddress({ name, coinType: ZERO_G_COIN_TYPE }).catch(fail)
    const agent = await client.getEnsAddress({ name, coinType: SEPOLIA_COIN_TYPE }).catch(fail)
    console.log(name, 'signal', signal, 'PlantWallet(0G)', wallet, 'agent(Sepolia)', agent)
  }
}
process.exit(failed ? 1 : 0)
