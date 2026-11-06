import { formatEther, getAddress } from 'viem'
import { normalize } from 'viem/ens'
import { createPersonName } from './forest.js'
import { clientsFor, pub, required } from './env.js'

const keyVar = process.env.NAME_KEY_VAR?.trim() || 'TUMBUH_KEY'
const label = required('NAME_LABEL').toLowerCase().replace(/\.eth$/, '')
if (!/^[a-z0-9-]+$/.test(label)) throw new Error(`NAME_LABEL must be a label like tumbuh, got ${label}`)
const c = clientsFor(keyVar)
const owner = c.wallet.account!.address
const target = getAddress(process.env.NAME_ADDRESS?.trim() || owner)
const name = `${label}.eth`

const existing = await pub.getEnsAddress({ name: normalize(name) }).catch(() => null)
if (existing) throw new Error(`${name} already resolves on Sepolia to ${existing}`)
const balance = await pub.getBalance({ address: owner })
console.log('owner', owner, formatEther(balance), 'Sepolia ETH')
if (balance === 0n) throw new Error(`${owner} has no Sepolia ETH`)

console.log(`registering ${name} -> ${target} (commit, wait 65 s, register)`)
const created = await createPersonName(c, label, target, 2_419_200n, () => new Promise((r) => setTimeout(r, 65_000)))
console.log('created', created)
console.log('resolves to', await pub.getEnsAddress({ name: normalize(name) }))
