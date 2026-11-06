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

const forest = process.env.FOREST_ENS_NAME
if (forest) {
  const plants = await client.getEnsText({ name: forest, key: 'forest.plants' }).catch((e) => `ERROR ${e.shortMessage ?? e.message}`)
  console.log(`forest.plants on ${forest}:`, plants)
  for (const label of (plants ?? '').split(',').filter((l) => l && !l.startsWith('ERROR'))) {
    const name = `${label}.${forest}`
    const status = await client.getEnsText({ name, key: 'forest.status' }).catch((e) => `ERROR ${e.shortMessage ?? e.message}`)
    const wallet = await client.getEnsAddress({ name, coinType: 2147500309n }).catch((e) => `ERROR ${e.shortMessage ?? e.message}`)
    console.log(name, 'status', status, 'wallet', wallet)
  }
}
process.exit(failed ? 1 : 0)
