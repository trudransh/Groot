import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { formatEther, parseEther } from 'viem'
import { addPlant, createForest, readForest, type Forest } from './forest.js'
import { clientsFor, forestLabel, plantsFromEnv, pub } from './env.js'

const STATE = 'deployments/sepolia.json'
const guardian = clientsFor('GUARDIAN_KEY')
const address = guardian.wallet.account!.address
const label = forestLabel()
const plants = plantsFromEnv()

const balance = await pub.getBalance({ address })
console.log('guardian', address, formatEther(balance), 'Sepolia ETH')
if (balance === 0n) throw new Error('guardian has no Sepolia ETH')
if (((await pub.getCode({ address })) ?? '0x') !== '0x') throw new Error('guardian has code attached (EIP-7702); it cannot receive the name token, use a fresh key')

let forest: Forest
if (existsSync(STATE)) {
  forest = JSON.parse(readFileSync(STATE, 'utf8'))
  if (forest.label !== label) throw new Error(`${STATE} is for ${forest.name}, not ${label}.eth`)
  console.log('reusing', forest)
} else {
  console.log(`registering ${label}.eth (commit, wait 65 s, register)`)
  forest = await createForest(guardian, label, 2_419_200n, () => new Promise((r) => setTimeout(r, 65_000)))
  mkdirSync('deployments', { recursive: true })
  writeFileSync(STATE, JSON.stringify(forest, null, 2) + '\n')
  console.log('created', forest)
}

const existing = new Set((await readForest(pub as never, forest.name)).map((p) => p.label))
for (let i = 0; i < plants.length; i++) {
  const plant = plants[i]!
  if (existing.has(plant.label)) {
    console.log('skip', plant.label, '(already in forest)')
    continue
  }
  const labels = [...new Set([...existing, ...plants.slice(0, i + 1).map((p) => p.label)])]
  await addPlant(guardian, forest, plant, labels)
  console.log('added', `${plant.label}.${forest.name}`, 'agent', plant.agent)
}

const GAS_FLOOR = parseEther('0.005')
const GAS_TOPUP = parseEther('0.01')
for (const plant of plants) {
  const have = await pub.getBalance({ address: plant.agent })
  if (have >= GAS_FLOOR) continue
  const hash = await guardian.wallet.sendTransaction({ to: plant.agent, value: GAS_TOPUP, chain: guardian.wallet.chain, account: guardian.wallet.account! })
  await pub.waitForTransactionReceipt({ hash })
  console.log('funded', plant.label, 'agent with', formatEther(GAS_TOPUP), 'Sepolia ETH', hash)
}

console.log(await readForest(pub as never, forest.name))
