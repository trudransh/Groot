import { isAddress } from 'viem'
import { credentialError, validClaimId, type Attempt, type IdClaims } from './claim'

export const TRANSFER_TTL_S = 1800
export const TOKENS = ['ETH', 'USDC'] as const

export type TransferStatus = 'pending' | 'approved' | 'expired'

export type TransferRequest = {
  id: string
  name: string
  address: `0x${string}`
  amount: string
  token: (typeof TOKENS)[number]
  createdAt: number
  status: TransferStatus
  approvedAt?: number
  subject?: string
}

export type TransferError = 'bad_request' | 'wrong_credential' | 'not_fresh' | 'already_claimed' | 'expired'

export type ApproveResult = { ok: true; request: TransferRequest } | { ok: false; error: TransferError }

const ENS_NAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/
const AMOUNT = /^(\d+(\.\d*)?|\.\d+)$/

export function newTransferRequest(input: unknown, now: number, id: string): TransferRequest | null {
  const i = (input ?? {}) as Record<string, unknown>
  const { name, address, amount, token } = i
  if (!validClaimId(id)) return null
  if (typeof name !== 'string' || name.startsWith('0x') || !ENS_NAME.test(name)) return null
  if (typeof address !== 'string' || !isAddress(address)) return null
  if (typeof amount !== 'string' || !AMOUNT.test(amount) || Number(amount) <= 0) return null
  if (typeof token !== 'string' || !(TOKENS as readonly string[]).includes(token)) return null
  return { id, name, address, amount, token: token as TransferRequest['token'], createdAt: now, status: 'pending' }
}

const expired = (r: TransferRequest, now: number) => r.status === 'pending' && r.createdAt + TRANSFER_TTL_S < now

export function approveTransfer(r: TransferRequest, a: Attempt, c: IdClaims, deps: { acr: string[]; now: number }): ApproveResult {
  if (a.kind !== 'transfer' || a.claimId !== r.id || a.address.toLowerCase() !== r.address.toLowerCase()) return { ok: false, error: 'bad_request' }
  if (r.status === 'approved') return { ok: false, error: 'already_claimed' }
  if (expired(r, deps.now)) return { ok: false, error: 'expired' }
  const bad = credentialError(a, c, deps)
  if (bad) return { ok: false, error: bad }
  return { ok: true, request: { ...r, status: 'approved', approvedAt: deps.now, subject: c.sub } }
}

export function publicTransfer(r: TransferRequest, now: number) {
  const { subject: _subject, ...rest } = r
  return { ...rest, status: expired(r, now) ? ('expired' as const) : r.status }
}
