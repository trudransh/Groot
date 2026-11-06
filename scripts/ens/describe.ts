import { readFileSync } from 'node:fs'
import { encodeFunctionData, type Address } from 'viem'
import { clientsFor, forestName, pub } from './env.js'
import { dnsName, resolverAbi, setTextCall } from './forest.js'
import { SEPOLIA_COIN_TYPE, zeroGCoinType } from './roles.js'

type Profile = { description: string; persona: string; species: string; stage: string; mode: string }
type Profiles = { forest: { description: string; url: string; zeroGChainId: number }; plants: Record<string, Profile> }
type Deployment = { forest: Address; plants: { agent: Address; wallet: Address }[] }


const profiles = JSON.parse(readFileSync('plants.json', 'utf8')) as Profiles
const deployment = JSON.parse(readFileSync(`../../contracts/deployments/${profiles.forest.zeroGChainId}.json`, 'utf8')) as Deployment
const guardian = clientsFor('GUARDIAN_KEY')
const supplier = guardian.wallet.account!.address
const name = forestName()
const resolver = await pub.getEnsResolver({ name })
const ZERO_G_COIN_TYPE = zeroGCoinType(profiles.forest.zeroGChainId)
const STALE_COIN_TYPES = [16661, 16602].filter((id) => id !== profiles.forest.zeroGChainId).map(zeroGCoinType)
const setAddr = (n: string, coin: bigint, value: `0x${string}`) => encodeFunctionData({ abi: resolverAbi, functionName: 'setAddress', args: [dnsName(n), coin, value] })

const calls = [
  setTextCall(name, 'description', profiles.forest.description),
  setTextCall(name, 'url', profiles.forest.url),
  setTextCall(name, 'forest.contract', deployment.forest),
  setTextCall(name, 'forest.chain', String(profiles.forest.zeroGChainId)),
  setTextCall(name, 'forest.supplier', supplier),
]

for (const [label, p] of Object.entries(profiles.plants)) {
  const plantName = `${label}.${name}`
  const agent = await pub.getEnsAddress({ name: plantName, coinType: SEPOLIA_COIN_TYPE })
  const onZeroG = deployment.plants.find((d) => d.agent.toLowerCase() === agent?.toLowerCase())
  if (!agent || !onZeroG) throw new Error(`${plantName}: no Sepolia agent address, or no PlantWallet for it in the deployment`)
  calls.push(
    setAddr(plantName, ZERO_G_COIN_TYPE, onZeroG.wallet),
    ...STALE_COIN_TYPES.map((coin) => setAddr(plantName, coin, '0x')),
    setAddr(plantName, SEPOLIA_COIN_TYPE, agent),
    setTextCall(plantName, 'description', p.description),
    setTextCall(plantName, 'url', profiles.forest.url),
    setTextCall(plantName, 'forest.persona', p.persona),
    setTextCall(plantName, 'forest.species', p.species),
    setTextCall(plantName, 'forest.stage', p.stage),
    setTextCall(plantName, 'forest.mode', p.mode),
  )
}

const { request } = await pub.simulateContract({ address: resolver, abi: resolverAbi, functionName: 'multicall', args: [calls], account: guardian.wallet.account! } as never)
const hash = await guardian.wallet.writeContract(request as never)
const receipt = await pub.waitForTransactionReceipt({ hash })
if (receipt.status !== 'success') throw new Error(`multicall reverted in ${hash}`)
console.log(`${calls.length} records set on ${name}: https://sepolia.etherscan.io/tx/${hash}`)

for (const key of ['description', 'forest.contract', 'forest.chain', 'forest.supplier']) console.log(`${name} ${key} = ${await pub.getEnsText({ name, key })}`)
for (const label of Object.keys(profiles.plants)) {
  const n = `${label}.${name}`
  console.log(`${n} 0G(${profiles.forest.zeroGChainId}) ${await pub.getEnsAddress({ name: n, coinType: ZERO_G_COIN_TYPE })} sepolia ${await pub.getEnsAddress({ name: n, coinType: SEPOLIA_COIN_TYPE })} stage ${await pub.getEnsText({ name: n, key: 'forest.stage' })} mode ${await pub.getEnsText({ name: n, key: 'forest.mode' })}`)
}
