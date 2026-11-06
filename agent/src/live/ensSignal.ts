import { createPublicClient, createWalletClient, http, parseAbi, toHex, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { packetToBytes } from 'viem/ens'
import { sepolia } from 'viem/chains'
import type { PlantStatus } from '../types.js'

const resolverAbi = parseAbi(['function setText(bytes name, string key, string value)'])

export const signalCode = (status: PlantStatus) => (status === 'thirsty' ? '1' : '0')

export function ensSignal(agentKey: Hex, rpcUrl: string, forestName: string, plantLabel: string) {
  const transport = http(rpcUrl)
  const account = privateKeyToAccount(agentKey)
  const pub = createPublicClient({ chain: sepolia, transport })
  const wallet = createWalletClient({ chain: sepolia, transport, account })
  return async (status: PlantStatus) => {
    const resolver = await pub.getEnsResolver({ name: forestName })
    const hash = await wallet.writeContract({
      address: resolver,
      abi: resolverAbi,
      functionName: 'setText',
      args: [toHex(packetToBytes(forestName)), `signal.${plantLabel}`, signalCode(status)],
    })
    const r = await pub.waitForTransactionReceipt({ hash })
    if (r.status !== 'success') throw new Error(`ENS signal reverted ${hash}`)
  }
}
