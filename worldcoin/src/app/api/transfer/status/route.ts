import { NextResponse, type NextRequest } from 'next/server'
import { publicTransfer } from '@/lib/transfer'
import { getTransfer, nowS } from '@/lib/server'

export async function GET(req: NextRequest) {
  const r = getTransfer(req.nextUrl.searchParams.get('id') ?? '')
  if (!r) return NextResponse.json({ status: 'unknown' }, { status: 404 })
  return NextResponse.json(publicTransfer(r, nowS()))
}
