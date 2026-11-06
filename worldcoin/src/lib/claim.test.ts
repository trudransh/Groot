import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { ACR, ISSUER, authorizeUrl, completeClaim, newAttempt, verifyIdToken, type Attempt, type ClaimDeps } from './claim'

const ADDR = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'
const OTHER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'
const CLIENT = 'app_client_1'
const NOW = 1_800_000_000

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const JWKS = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1' }] }

function token(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'k1' }, key = privateKey) {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const body = `${enc(header)}.${enc(claims)}`
  return `${body}.${crypto.sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`
}

const attempt = (over: Partial<Attempt> = {}): Attempt => ({ ...newAttempt('banyan-01-refill-1', ADDR, NOW)!, ...over })

const claims = (a: Attempt, over: Record<string, unknown> = {}) => ({
  iss: ISSUER, aud: CLIENT, sub: 'human-1', nonce: a.nonce, iat: NOW + 5, exp: NOW + 300, auth_time: NOW + 5, acr: ACR.orb, ...over,
})

function deps(over: Partial<ClaimDeps> = {}) {
  const used = new Set<string>()
  return {
    acr: [ACR.orb, ACR.selfie],
    now: NOW + 10,
    claimSubject: vi.fn((k: string) => (used.has(k) ? false : (used.add(k), true))),
    releaseSubject: vi.fn((k: string) => void used.delete(k)),
    registerHuman: vi.fn(async () => '0xtx'),
    ...over,
  }
}

describe('newAttempt and authorizeUrl', () => {
  it('rejects a bad claim id or wallet', () => {
    expect(newAttempt('a b', ADDR, NOW)).toBeNull()
    expect(newAttempt('ok', '0x123', NOW)).toBeNull()
  })

  it('asks World for a fresh World ID proof of the accepted class, with PKCE', () => {
    const a = attempt()
    const u = new URL(authorizeUrl('https://auth.world.org/api/v1/authorize', a, { clientId: CLIENT, redirectUri: 'http://localhost:3000/api/claim/callback', acr: [ACR.orb] }))
    const q = Object.fromEntries(u.searchParams)
    expect(q).toMatchObject({ client_id: CLIENT, response_type: 'code', scope: 'openid', state: a.state, nonce: a.nonce, code_challenge_method: 'S256', max_age: '0', prompt: 'login' })
    expect(q.code_challenge).toBe(crypto.createHash('sha256').update(a.verifier).digest('base64url'))
    expect(q.acr_values).toBe(ACR.orb)
    expect(q.claims).toBeUndefined()
  })
})

describe('verifyIdToken', () => {
  const a = attempt()
  const expectOk = { clientId: CLIENT, nonce: a.nonce, now: NOW + 10 }

  it('accepts a token World signed for this attempt', () => {
    expect(verifyIdToken(token(claims(a)), JWKS, expectOk)?.sub).toBe('human-1')
  })

  it.each([
    ['another key', token(claims(a), undefined, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey)],
    ['alg none', token(claims(a), { alg: 'none', kid: 'k1' })],
    ['unknown kid', token(claims(a), { alg: 'RS256', kid: 'other' })],
    ['another issuer', token(claims(a, { iss: 'https://evil.example' }))],
    ['another audience', token(claims(a, { aud: 'someone-else' }))],
    ['expired', token(claims(a, { exp: NOW - 3600 }))],
    ['another nonce', token(claims(a, { nonce: 'replayed' }))],
    ['no subject', token(claims(a, { sub: '' }))],
    ['garbage', 'not.a.token'],
  ])('rejects a token with %s', (_, t) => {
    expect(verifyIdToken(t, JWKS, expectOk)).toBeNull()
  })
})

describe('completeClaim', () => {
  it('registers the wallet after a fresh, accepted World ID authentication', async () => {
    const a = attempt()
    const d = deps()
    expect(await completeClaim(a, claims(a), d)).toEqual({ ok: true, address: ADDR, txHash: '0xtx' })
    expect(d.registerHuman).toHaveBeenCalledWith(ADDR)
  })

  it('refuses a sign-in that carries no World ID class, like a plain key sign-in', async () => {
    const a = attempt()
    const d = deps()
    expect(await completeClaim(a, claims(a, { acr: undefined, amr: ['pop', 'user', 'mfa'] }), d)).toEqual({ ok: false, error: 'wrong_credential' })
    expect(d.registerHuman).not.toHaveBeenCalled()
  })

  it('refuses a credential the forest does not accept', async () => {
    const a = attempt()
    const d = deps({ acr: [ACR.orb] })
    expect(await completeClaim(a, claims(a, { acr: ACR.selfie }), d)).toEqual({ ok: false, error: 'wrong_credential' })
    expect(d.registerHuman).not.toHaveBeenCalled()
  })

  it('refuses an old session instead of a fresh verification', async () => {
    const a = attempt()
    const d = deps()
    expect(await completeClaim(a, claims(a, { auth_time: NOW - 3600 }), d)).toEqual({ ok: false, error: 'not_fresh' })
    expect(d.registerHuman).not.toHaveBeenCalled()
  })

  it('pays one person once per claim, whatever wallet they enter', async () => {
    const d = deps()
    const first = attempt()
    await completeClaim(first, claims(first), d)
    const second = attempt({ address: OTHER })
    expect(await completeClaim(second, claims(second), d)).toEqual({ ok: false, error: 'already_claimed' })
    expect(d.registerHuman).toHaveBeenCalledTimes(1)
  })

  it('lets a different person claim the same claim', async () => {
    const d = deps()
    const first = attempt()
    await completeClaim(first, claims(first), d)
    const second = attempt({ address: OTHER })
    expect((await completeClaim(second, claims(second, { sub: 'human-2' }), d)).ok).toBe(true)
  })

  it('frees the claim when the chain call fails, so the person can retry', async () => {
    const a = attempt()
    const d = deps({ registerHuman: vi.fn(async () => { throw new Error('rpc down') }) })
    expect(await completeClaim(a, claims(a), d)).toEqual({ ok: false, error: 'register_failed' })
    d.registerHuman = vi.fn(async () => '0xtx2')
    expect(await completeClaim(a, claims(a), d)).toEqual({ ok: true, address: ADDR, txHash: '0xtx2' })
  })
})
