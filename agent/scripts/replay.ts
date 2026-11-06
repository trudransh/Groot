import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Indexer } from '@0gfoundation/0g-storage-ts-sdk'
import { replayRecord } from '../src/replay.js'
import type { DecisionRecord } from '../src/types.js'

const root = process.argv[2]
if (!root || !/^0x[0-9a-fA-F]{64}$/.test(root)) throw new Error('usage: pnpm replay <0G storage root>')
const indexerUrl = process.env.ZERO_G_STORAGE_INDEXER
if (!indexerUrl) throw new Error('set ZERO_G_STORAGE_INDEXER in agent/.env')

const dir = mkdtempSync(join(tmpdir(), 'replay-'))
const file = join(dir, 'record.json')
try {
  const err = await new Indexer(indexerUrl).download(root, file, true)
  if (err) throw err
  const record = JSON.parse(readFileSync(file, 'utf8')) as DecisionRecord
  console.log(`record ${root} (downloaded with proof)`)
  console.log(`  plant      ${record.plantName} (${record.mode}) at ${new Date(record.ts * 1000).toISOString()}`)
  console.log(`  0G         ${record.zeroG.model} request ${record.zeroG.requestId || '(none: 0G did not answer)'}`)
  console.log(`  decision   ${JSON.stringify(record.decision)}`)
  console.log(`  stored     ${JSON.stringify({ finalDecision: record.finalDecision, rulesApplied: record.rulesApplied })}`)
  const r = replayRecord(record)
  console.log(`  replayed   ${JSON.stringify(r.replayed)}`)
  console.log(r.matches ? 'MATCH: the stored decision follows from its inputs and the rules' : 'MISMATCH: the stored decision does not follow from its inputs')
  if (!r.matches) process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
