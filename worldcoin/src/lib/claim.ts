import crypto from 'node:crypto'
import { isAddress } from 'viem'

export const ISSUER = process.env.WORLD_AUTH_ISSUER ?? 'https://auth.world.org'
export const ACR = { orb: 'https://world.org/oidc/acr/orb', selfie: 'https://world.org/oidc/acr/selfie' }
export const ATTEMPT_TTL_S = 600
const SKEW_S = 60
const CLAIM_ID = /^[\w-]{1,64}$/

export type Attempt = { state: string; nonce: string; verifier: string; claimId: string; address: `0x${string}`; startedAt: number }

export type IdClaims = { iss: string; sub: string; aud: string | string[]; nonce: string; exp: number; iat: number; auth_time?: number; acr?: string }

export type ClaimError = 'bad_request' | 'unknown_attempt' | 'login_failed' | 'invalid_token' | 'wrong_credential' | 'not_fresh' | 'already_claimed' | 'register_failed'

export type ClaimResult = { ok: true; address: `0x${string}`; txHash: string } | { ok: false; error: ClaimError }

export type ClaimDeps = {
  acr: string[]
  now: number
  claimSubject: (key: string) => boolean
  releaseSubject: (key: string) => void
  registerHuman: (address: `0x${string}`) => Promise<string>
}

type Jwk = JsonWebKey & { kid?: string }

const rand = (n: number) => crypto.randomBytes(n).toString('base64url')
const fail = (error: ClaimError): ClaimResult => ({ ok: false, error })

export const validClaimId = (v: unknown): v is string => typeof v === 'string' && CLAIM_ID.test(v)

export function newAttempt(claimId: unknown, address: unknown, now: number): Attempt | null {
  if (!validClaimId(claimId) || typeof address !== 'string' || !isAddress(address)) return null
  return { state: rand(32), nonce: rand(32), verifier: rand(48), claimId, address, startedAt: now }
}

export function authorizeUrl(endpoint: string, a: Attempt, cfg: { clientId: string; redirectUri: string; acr: string[] }) {
  const u = new URL(endpoint)
  u.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid',
    state: a.state,
    nonce: a.nonce,
    code_challenge: crypto.createHash('sha256').update(a.verifier).digest('base64url'),
    code_challenge_method: 'S256',
    max_age: '0',
    prompt: 'login',
    acr_values: cfg.acr.join(' '),
  }).toString()
  return u.toString()
}

export function verifyIdToken(token: string, jwks: { keys: Jwk[] }, expect: { clientId: string; nonce: string; now: number }): IdClaims | null {
  try {
    const [h, p, s] = token.split('.')
    if (!h || !p || !s) return null
    const header = JSON.parse(Buffer.from(h, 'base64url').toString())
    if (header.alg !== 'RS256') return null
    const jwk = jwks.keys.find((k) => k.kid === header.kid)
    if (!jwk) return null
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' })
    if (!crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) return null

    const c = JSON.parse(Buffer.from(p, 'base64url').toString()) as IdClaims & { azp?: string }
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud]
    if (c.iss !== ISSUER || !aud.includes(expect.clientId) || (aud.length > 1 && c.azp !== expect.clientId)) return null
    if (typeof c.exp !== 'number' || c.exp + SKEW_S < expect.now) return null
    if (typeof c.iat !== 'number' || c.iat - SKEW_S > expect.now) return null
    if (c.nonce !== expect.nonce || typeof c.sub !== 'string' || c.sub === '') return null
    return c
  } catch {
    return null
  }
}

export async function completeClaim(a: Attempt, c: IdClaims, deps: ClaimDeps): Promise<ClaimResult> {
  if (typeof c.acr !== 'string' || !deps.acr.includes(c.acr)) return fail('wrong_credential')
  if (typeof c.auth_time !== 'number' || c.auth_time < a.startedAt - SKEW_S || c.auth_time > deps.now + SKEW_S) return fail('not_fresh')

  const key = `${a.claimId}:${c.sub}`
  if (!deps.claimSubject(key)) return fail('already_claimed')
  try {
    return { ok: true, address: a.address, txHash: await deps.registerHuman(a.address) }
  } catch {
    deps.releaseSubject(key)
    return fail('register_failed')
  }
}
