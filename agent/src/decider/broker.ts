import { ethers } from 'ethers'
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk'
import type { ZeroGPort } from './types.js'

export async function createZeroGPort(privateKey: string, rpcUrl: string, providerOverride?: string): Promise<ZeroGPort> {
  const wallet = new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(rpcUrl))
  const broker = await createZGComputeNetworkBroker(wallet as never)
  let provider = providerOverride
  if (!provider) {
    const services = await broker.inference.listService()
    const chat = services.find((s) => s.serviceType === 'chatbot')
    if (!chat) throw new Error('no chatbot provider on 0G')
    provider = chat.provider
  }
  await broker.inference.acknowledgeProviderSigner(provider).catch(() => undefined)
  const { endpoint, model } = await broker.inference.getServiceMetadata(provider)
  return {
    provider: provider as `0x${string}`,
    model,
    endpoint,
    headers: async () => ({ ...(await broker.inference.getRequestHeaders(provider)) }) as Record<string, string>,
    verify: (chatId, content) => broker.inference.processResponse(provider, chatId, content),
  }
}
