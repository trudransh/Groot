import { readForest } from './forest.js'
import { forestName, pub } from './env.js'

const name = forestName()
for (const { label, signal } of await readForest(pub as never, name)) {
  console.log(`${label}.${name}`, signal === '1' ? 'THIRSTY' : signal === '0' ? 'ok' : 'invalid')
}
