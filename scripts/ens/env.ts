import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import type { Clients, Plant } from './forest.js'

export const transport = http(process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com', { timeout: 120_000 })
export const pub = createPublicClient({ chain: sepolia, transport })

export function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is missing in scripts/ens/.env`)
  return value
}

export function clientsFor(keyVar: string): Clients {
  const raw = required(keyVar)
  const key = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex
  return { pub: pub as never, wallet: createWalletClient({ chain: sepolia, transport, account: privateKeyToAccount(key) }) }
}

export function forestLabel(): string {
  const label = required('FOREST_ENS_NAME').toLowerCase().replace(/\.eth$/, '')
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error(`FOREST_ENS_NAME must be a label like vantaraa or vantaraa.eth, got ${label}`)
  return label
}

export const forestName = () => `${forestLabel()}.eth`

export function plantsFromEnv(): Plant[] {
  const raw = process.env.PLANTS?.trim()
  if (!raw) return []
  return raw.split(',').map((entry) => {
    const [label, agent, wallet] = entry.split(':').map((s) => s.trim())
    if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error(`bad plant label in PLANTS: ${entry}`)
    if (!agent?.match(/^0x[0-9a-fA-F]{40}$/) || !wallet?.match(/^0x[0-9a-fA-F]{40}$/)) throw new Error(`PLANTS entry needs label:agentAddress:walletAddress, got ${entry}`)
    return { label, agent: agent as Address, wallet: wallet as Address, persona: '', species: label.replace(/-\d+$/, '') }
  })
}
