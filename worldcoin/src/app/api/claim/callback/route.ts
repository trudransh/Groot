import { NextResponse, type NextRequest } from 'next/server'
import { ISSUER, completeClaim, verifyIdToken, type ClaimResult } from '@/lib/claim'
import { authConfig, claimDeps, discovery, exchangeCode, jwks, nowS, takeAttempt } from '@/lib/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const state = q.get('state') ?? ''
  const a = takeAttempt(state)
  const cfg = authConfig()

  const back = (claimId: string | null, r: ClaimResult) => {
    const u = new URL('/claim', cfg.redirectUri)
    if (claimId) u.searchParams.set('claim', claimId)
    if (r.ok) {
      u.searchParams.set('status', 'ok')
      u.searchParams.set('address', r.address)
      u.searchParams.set('tx', r.txHash)
    } else u.searchParams.set('error', r.error)
    const res = NextResponse.redirect(u, 303)
    res.cookies.delete({ name: 'claim_state', path: '/api/claim' })
    return res
  }

  if (!a || req.cookies.get('claim_state')?.value !== state) return back(a?.claimId ?? null, { ok: false, error: 'unknown_attempt' })
  if (q.get('error')) return back(a.claimId, { ok: false, error: 'login_failed' })
  const code = q.get('code')
  if (q.get('iss') !== ISSUER || !code) return back(a.claimId, { ok: false, error: 'invalid_token' })

  const d = await discovery()
  const idToken = await exchangeCode(d, code, a.verifier)
  const claims = idToken ? verifyIdToken(idToken, await jwks(d), { clientId: cfg.clientId, nonce: a.nonce, now: nowS() }) : null
  if (!claims) return back(a.claimId, { ok: false, error: 'invalid_token' })

  const result = await completeClaim(a, claims, claimDeps())
  console.info(`claim ${a.claimId}: acr=${claims.acr} amr=${JSON.stringify((claims as { amr?: unknown }).amr)} -> ${result.ok ? 'ok' : result.error}`)
  if (!result.ok && result.error === 'wrong_credential') console.warn(`World returned acr ${claims.acr}; accepted: ${cfg.acr.join(', ')}`)
  return back(a.claimId, result)
}
