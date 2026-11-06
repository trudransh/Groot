import { readFileSync } from 'node:fs'
import { sendSignal, type Forest } from './forest.js'
import { clientsFor } from './env.js'
import { parseSignal } from './signal.js'

const [plant, code] = process.argv.slice(2)
const signal = parseSignal(code)
if (!plant || !signal) throw new Error('usage: pnpm signal <plant-label> <0|1>   (AGENT_KEY in .env)')
const forest: Forest = JSON.parse(readFileSync('deployments/sepolia.json', 'utf8'))
const tx = await sendSignal(clientsFor('AGENT_KEY'), forest, plant, signal)
console.log(`signal.${plant} = ${signal} on ${forest.name}`, `https://sepolia.etherscan.io/tx/${tx}`)
