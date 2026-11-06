import { NextResponse, type NextRequest } from 'next/server'
import { ATTEMPT_TTL_S, authorizeUrl, newAttempt } from '@/lib/claim'
import { publicTransfer } from '@/lib/transfer'
import { authConfig, discovery, getTransfer, nowS, saveAttempt } from '@/lib/server'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const cfg = authConfig()
  const r = getTransfer(id)
  const back = new URL('/transfer', cfg.redirectUri)
  back.searchParams.set('id', id)
  if (!r || publicTransfer(r, nowS()).status !== 'pending') {
    back.searchParams.set('error', r ? 'expired' : 'bad_request')
    return NextResponse.redirect(back, 303)
  }
  const base = newAttempt(r.id, r.address, nowS())
  if (!base) {
    back.searchParams.set('error', 'bad_request')
    return NextResponse.redirect(back, 303)
  }
  const a = { ...base, kind: 'transfer' as const }
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
