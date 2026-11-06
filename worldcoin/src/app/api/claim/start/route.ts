import { NextResponse, type NextRequest } from 'next/server'
import { isAddress } from 'viem'
import { ATTEMPT_TTL_S, authorizeUrl, newAttempt, validClaimId } from '@/lib/claim'
import { authConfig, discovery, nowS, saveAttempt } from '@/lib/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const claim = q.get('claim')
  const wallet = (q.get('address') ?? '').trim()
  const cfg = authConfig()
  if (validClaimId(claim) && !isAddress(wallet) && wallet.includes('.')) {
    const confirm = new URL('/claim', cfg.redirectUri)
    confirm.searchParams.set('claim', claim)
    confirm.searchParams.set('name', wallet)
    return NextResponse.redirect(confirm, 303)
  }
  const a = newAttempt(claim, wallet, nowS())
  if (!a) {
    const back = new URL('/claim', cfg.redirectUri)
    if (validClaimId(claim)) back.searchParams.set('claim', claim)
    back.searchParams.set('error', 'bad_request')
    return NextResponse.redirect(back, 303)
  }
  saveAttempt(a)
  const res = NextResponse.redirect(authorizeUrl((await discovery()).authorization_endpoint, a, cfg), 303)
  res.cookies.set('claim_state', a.state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.redirectUri.startsWith('https:'),
    path: '/api/claim',
    maxAge: ATTEMPT_TTL_S,
  })
  return res
}
