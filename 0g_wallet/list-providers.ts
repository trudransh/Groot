import { ethers } from 'ethers'
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk'

const w = new ethers.Wallet(process.env.PRIVATE_KEY!, new ethers.JsonRpcProvider('https://evmrpc.0g.ai', 16661, { staticNetwork: true }))
const broker = await createZGComputeNetworkBroker(w as never)
for (const s of await broker.inference.listServiceWithDetail()) {
  console.log(JSON.stringify(s, (_k, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 700)); console.log(s.provider, '|', s.serviceType, '|', s.model, '|', s.url, '|', s.verifiability)
}
