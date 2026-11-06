import { ethers, FetchRequest } from 'ethers'
import { Indexer, MemData } from '@0gfoundation/0g-storage-ts-sdk'
import type { RecordStore } from '../checkpoint.js'

FetchRequest.registerGetUrl(async (req) => {
  const r = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body ? Buffer.from(req.body) : undefined, signal: AbortSignal.timeout(req.timeout) })
  return { statusCode: r.status, statusMessage: r.statusText, headers: Object.fromEntries(r.headers), body: new Uint8Array(await r.arrayBuffer()) }
})

export function zeroGRecordStore(privateKey: string, rpcUrl: string, indexerUrl: string): RecordStore {
  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true })
  const signer = new ethers.Wallet(privateKey, provider)
  const indexer = new Indexer(indexerUrl)
  return {
    async put(record) {
      const bytes = new TextEncoder().encode(JSON.stringify(record))
      const [res, err] = await indexer.upload(new MemData(bytes), rpcUrl, signer as never)
      if (err) throw err
      const root = 'rootHash' in res ? res.rootHash : res.rootHashes[0]
      return { root: root as `0x${string}` }
    },
  }
}
