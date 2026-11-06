import { createPublicClient, createWalletClient, defineChain, http, parseAbi, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { PlantWalletPort } from '../checkpoint.js'

export const zeroGMainnet = defineChain({
  id: 16661,
  name: '0G Mainnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc.0g.ai'] } },
  blockExplorers: { default: { name: 'chainscan', url: 'https://chainscan.0g.ai' } },
})

export const plantWalletAbi = parseAbi([
  'function orderWater(uint32 ml, string requestId, bytes32 root) returns (uint256)',
  'function logDecision(uint8 action, string requestId, bytes32 root)',
  'function reserveWei() view returns (uint256)',
  'function forest() view returns (address)',
  'event WaterOrdered(uint256 indexed orderId, uint32 ml, uint256 costWei, string requestId, bytes32 root)',
])

export const forestAbi = parseAbi([
  'function waterPriceWeiPerMl() view returns (uint256)',
  'function maxWaterMlPerOrder() view returns (uint32)',
  'function maxWaterMlPerDay() view returns (uint32)',
])

export function zeroGClients(agentKey: Hex, rpcUrl: string) {
  const transport = http(rpcUrl)
  const account = privateKeyToAccount(agentKey)
  return {
    account,
    pub: createPublicClient({ chain: zeroGMainnet, transport }),
    wallet: createWalletClient({ chain: zeroGMainnet, transport, account }),
  }
}

export function plantWallet(c: ReturnType<typeof zeroGClients>, address: Hex): PlantWalletPort {
  const confirm = async (hash: Hex) => {
    const r = await c.pub.waitForTransactionReceipt({ hash })
    if (r.status !== 'success') throw new Error(`tx reverted ${hash}`)
    return hash
  }
  return {
    async orderWater(ml, requestId, root) {
      const { result, request } = await c.pub.simulateContract({
        address,
        abi: plantWalletAbi,
        functionName: 'orderWater',
        args: [ml, requestId, root],
        account: c.account,
      })
      return { txHash: await confirm(await c.wallet.writeContract(request)), orderId: result }
    },
    async logDecision(action, requestId, root) {
      const { request } = await c.pub.simulateContract({
        address,
        abi: plantWalletAbi,
        functionName: 'logDecision',
        args: [action, requestId, root],
        account: c.account,
      })
      return confirm(await c.wallet.writeContract(request))
    },
  }
}
