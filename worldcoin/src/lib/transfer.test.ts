import { describe, expect, it } from 'vitest'
import { ACR, ISSUER, newAttempt, type IdClaims } from './claim'
import { approveTransfer, newTransferRequest, publicTransfer, TRANSFER_TTL_S } from './transfer'

const ADDR = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'
const NOW = 1_800_000_000
const input = { name: 'alice.eth', address: ADDR, amount: '1.5', token: 'USDC' }

const req = () => newTransferRequest(input, NOW, 'tx-1')!
const attempt = () => ({ ...newAttempt('tx-1', ADDR, NOW)!, kind: 'transfer' as const })
const claims = (a: { nonce: string }, over: Partial<IdClaims> = {}): IdClaims => ({
  iss: ISSUER, aud: 'c', sub: 'human-1', nonce: a.nonce, iat: NOW + 5, exp: NOW + 300, auth_time: NOW + 5, acr: ACR.orb, ...over,
})
const deps = { acr: [ACR.orb], now: NOW + 10 }

describe('newTransferRequest', () => {
  it('accepts an ENS name with its resolved address', () => {
    expect(req()).toMatchObject({ id: 'tx-1', name: 'alice.eth', address: ADDR, amount: '1.5', token: 'USDC', status: 'pending', createdAt: NOW })
  })

  it.each([
    { name: ADDR },
    { name: 'alice' },
    { address: 'nope' },
    { amount: '-1' },
    { amount: '0' },
    { token: 'DOGE' },
  ])('rejects %o', (over) => {
    expect(newTransferRequest({ ...input, ...over }, NOW, 'tx-1')).toBeNull()
  })
})

describe('approveTransfer', () => {
  it('approves a pending request after a fresh orb verification', () => {
    const a = attempt()
    const r = approveTransfer(req(), a, claims(a), deps)
    expect(r).toEqual({ ok: true, request: expect.objectContaining({ status: 'approved', approvedAt: NOW + 10 }) })
  })

  it('refuses a plain sign-in without the orb credential', () => {
    const a = attempt()
    expect(approveTransfer(req(), a, claims(a, { acr: undefined }), deps)).toEqual({ ok: false, error: 'wrong_credential' })
  })

  it('refuses a stale verification', () => {
    const a = attempt()
    expect(approveTransfer(req(), a, claims(a, { auth_time: NOW - 3600 }), deps)).toEqual({ ok: false, error: 'not_fresh' })
  })

  it('refuses an attempt bound to another address', () => {
    const a = { ...attempt(), address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as const }
    expect(approveTransfer(req(), a, claims(a), deps)).toEqual({ ok: false, error: 'bad_request' })
  })

  it('approves only once', () => {
    const a = attempt()
    const done = approveTransfer(req(), a, claims(a), deps)
    expect(done.ok && approveTransfer(done.request, a, claims(a), deps)).toEqual({ ok: false, error: 'already_claimed' })
  })

  it('refuses an expired request', () => {
    const a = attempt()
    expect(approveTransfer(req(), a, claims(a), { ...deps, now: NOW + TRANSFER_TTL_S + 1 })).toEqual({ ok: false, error: 'expired' })
  })
})

describe('publicTransfer', () => {
  it('reports expiry and hides the verifier', () => {
    const a = attempt()
    const done = approveTransfer(req(), a, claims(a), deps)
    expect(done.ok && publicTransfer(done.request, NOW)).not.toHaveProperty('subject')
    expect(publicTransfer(req(), NOW + TRANSFER_TTL_S + 1).status).toBe('expired')
  })
})
