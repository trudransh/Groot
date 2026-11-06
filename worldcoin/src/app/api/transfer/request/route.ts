import crypto from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { newTransferRequest } from '@/lib/transfer'
import { nowS, publicOrigin, putTransfer } from '@/lib/server'

export async function POST(req: NextRequest) {
  const r = newTransferRequest(await req.json().catch(() => null), nowS(), `tx-${crypto.randomUUID()}`)
  if (!r) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  putTransfer(r)
  return NextResponse.json({ id: r.id, url: `${publicOrigin()}/transfer?id=${r.id}` })
}
