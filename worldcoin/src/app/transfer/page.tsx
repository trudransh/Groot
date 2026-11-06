import { publicTransfer, type TransferError } from '@/lib/transfer'
import { getTransfer, nowS } from '@/lib/server'

const REASONS: Record<TransferError | 'unknown_attempt' | 'login_failed' | 'invalid_token', string> = {
  bad_request: 'This transfer link is not valid. Ask the plant for a new one.',
  expired: 'This transfer request expired. Ask the plant to send again.',
  already_claimed: 'This transfer was already verified.',
  wrong_credential: 'The plant only pays verified unique humans (World ID orb).',
  not_fresh: 'The verification was not fresh. Every transfer needs a new World ID check.',
  unknown_attempt: 'This verification expired or was started in another browser. Start again on this device.',
  login_failed: 'World ID verification was cancelled or denied.',
  invalid_token: 'World ID could not confirm the verification.',
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  const id = one(raw.id) ?? ''
  const stored = getTransfer(id)
  if (!stored) return <p>This transfer link is not valid. Ask the plant for a new one.</p>
  const r = publicTransfer(stored, nowS())
  const error = one(raw.error)
  const reason = error && error in REASONS ? REASONS[error as keyof typeof REASONS] : null

  if (r.status === 'approved') {
    return (
      <main>
        <h1>Verified</h1>
        <p style={{ color: '#0a7a2f', fontWeight: 'bold' }}>
          You are verified as a unique human. The plant can now send {r.amount} {r.token} to <code>{r.name}</code>.
        </p>
      </main>
    )
  }

  return (
    <main>
      <h1>Receive from a plant</h1>
      <p>
        A plant wants to send <b>{r.amount} {r.token}</b> on Sepolia to <code>{r.name}</code> (<code>{r.address}</code>). It pays names outside its
        forest only after a fresh World ID check.
      </p>
      {reason && <p style={{ color: '#b00020' }}>Refused: {reason}</p>}
      {r.status === 'pending' ? (
        <form action="/api/transfer/start" method="get">
          <input type="hidden" name="id" value={r.id} />
          <button type="submit" style={{ font: 'inherit', padding: '12px 16px' }}>
            Verify with World ID
          </button>
        </form>
      ) : (
        <p>This request expired. Ask the plant to send again.</p>
      )}
    </main>
  )
}
