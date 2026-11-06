import fs from 'node:fs'
import path from 'node:path'
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ACR, ATTEMPT_TTL_S, ISSUER, type Attempt, type ClaimDeps } from './claim'

export const env = (name: string) => {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set in app/.env`)
  return v
}

export const nowS = () => Math.floor(Date.now() / 1000)

export const authConfig = () => ({
  clientId: env('WORLD_AUTH_CLIENT_ID'),
  redirectUri: env('WORLD_AUTH_REDIRECT_URI'),
  acr: (process.env.WORLD_AUTH_ACR ?? ACR.selfie).split(',').map((s) => s.trim()),
})

type Discovery = { authorization_endpoint: string; token_endpoint: string; jwks_uri: string }

export async function discovery(): Promise<Discovery> {
  const res = await fetch(`${ISSUER}/.well-known/openid-configuration`)
  if (!res.ok) throw new Error(`World discovery failed: ${res.status}`)
  return res.json()
}

export async function jwks(d: Discovery) {
  const res = await fetch(d.jwks_uri)
  if (!res.ok) throw new Error(`World JWKS failed: ${res.status}`)
  return res.json()
}

export async function exchangeCode(d: Discovery, code: string, verifier: string): Promise<string | null> {
  const { clientId, redirectUri } = authConfig()
  const secret = process.env.WORLD_AUTH_CLIENT_SECRET
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier })
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
  if (secret) headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`).toString('base64')}`
  else body.set('client_id', clientId)
  const res = await fetch(d.token_endpoint, { method: 'POST', headers, body })
  const j = await res.json().catch(() => null)
  return res.ok && typeof j?.id_token === 'string' ? j.id_token : null
}

const g = globalThis as unknown as { claimAttempts?: Map<string, Attempt> }
const attempts = (g.claimAttempts ??= new Map())

export const saveAttempt = (a: Attempt) => void attempts.set(a.state, a)

export function takeAttempt(state: string): Attempt | undefined {
  const a = attempts.get(state)
  attempts.delete(state)
  return a && a.startedAt + ATTEMPT_TTL_S >= nowS() ? a : undefined
}

const STORE = path.join(process.cwd(), '.data', 'claims.json')
let used: Set<string> | undefined

function store() {
  if (!used) {
    try {
      used = new Set(JSON.parse(fs.readFileSync(STORE, 'utf8')))
    } catch {
      used = new Set()
    }
  }
  return used
}

function save() {
  fs.mkdirSync(path.dirname(STORE), { recursive: true })
  fs.writeFileSync(STORE, JSON.stringify([...store()]))
}

function forestAddress(chainId: number): `0x${string}` {
  const file = path.join(process.cwd(), '..', 'contracts', 'deployments', `${chainId}.json`)
  return JSON.parse(fs.readFileSync(file, 'utf8')).forest
}

async function registerHuman(address: `0x${string}`) {
  const id = Number(env('CHAIN_ID'))
  const rpc = env('CHAIN_RPC_URL')
  const chain = defineChain({ id, name: `chain-${id}`, nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } })
  const account = privateKeyToAccount(env('GUARDIAN_EXECUTOR_KEY') as `0x${string}`)
  const wallet = createWalletClient({ account, chain, transport: http(rpc) })
  const hash = await wallet.writeContract({
    address: forestAddress(id),
    abi: parseAbi(['function registerHuman(address human)']),
    functionName: 'registerHuman',
    args: [address],
  })
  const receipt = await createPublicClient({ chain, transport: http(rpc) }).waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`registerHuman reverted: ${hash}`)
  return hash
}

export const claimDeps = (): ClaimDeps => ({
  acr: authConfig().acr,
  now: nowS(),
  claimSubject: (key) => {
    if (store().has(key)) return false
    store().add(key)
    save()
    return true
  },
  releaseSubject: (key) => {
    store().delete(key)
    save()
  },
  registerHuman,
})
