import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { ethers } from 'ethers'
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk'

const RPC = process.env.RPC_URL || 'https://evmrpc.0g.ai'

let key = process.env.PRIVATE_KEY
if (!key) {
  key = ethers.Wallet.createRandom().privateKey
  appendFileSync('.env', `${existsSync('.env') && !readFileSync('.env', 'utf8').endsWith('\n') ? '\n' : ''}PRIVATE_KEY=${key}\n`)
  console.log('new wallet saved to .env')
}
const wallet = new ethers.Wallet(key, new ethers.JsonRpcProvider(RPC, 16661, { staticNetwork: true }))
const bal = await wallet.provider!.getBalance(wallet.address)
console.log('address', wallet.address, 'balance', ethers.formatEther(bal), '0G')
if (bal === 0n) {
  console.log('send mainnet 0G to this address, then run again')
  process.exit(1)
}

const broker = await createZGComputeNetworkBroker(wallet as never)

try {
  await broker.ledger.getLedger()
} catch {
  console.log('creating compute ledger (3 0G)')
  await broker.ledger.addLedger(3)
}

const provider =
  process.env.ZG_PROVIDER || (await broker.inference.listService()).find((s) => s.serviceType === 'chatbot')?.provider
if (!provider) throw new Error('no chatbot provider found')
console.log('provider', provider)

await broker.inference.acknowledgeProviderSigner(provider).catch(() => undefined)
await broker.ledger.transferFund(provider, 'inference', ethers.parseEther('1')).catch((e) => console.log('transferFund skipped:', e.message))

const { endpoint, model } = await broker.inference.getServiceMetadata(provider)
const headers = await broker.inference.getRequestHeaders(provider)
const res = await fetch(`${endpoint}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(headers as Record<string, string>) },
  body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hii' }] }),
})
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
const data = (await res.json()) as { id?: string; choices: { message: { content: string } }[] }
const reply = data.choices[0]!.message.content
const requestId = res.headers.get('ZG-Res-Key') ?? data.id
console.log('model', model, '\nrequestId', requestId, '\nreply:', reply)
console.log('verified', await broker.inference.processResponse(provider, requestId ?? undefined, reply).catch(() => null))
