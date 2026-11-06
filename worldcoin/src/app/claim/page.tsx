import { validClaimId, type ClaimError } from '@/lib/claim'

type Search = { claim?: string; status?: string; address?: string; tx?: string; error?: string }

const REASONS: Record<ClaimError, string> = {
  bad_request: 'That wallet address is not valid. Enter a 0x address you control.',
  unknown_attempt: 'This verification expired or was started in another browser. Start again on this device.',
  login_failed: 'World ID verification was cancelled or denied.',
  invalid_token: 'World ID could not confirm the verification.',
  wrong_credential: 'This forest needs a World ID verified with Selfie Check.',
  not_fresh: 'The verification was not fresh. Every payout needs a new World ID check.',
  already_claimed: 'You have already claimed this reward.',
  register_failed: 'Your verification passed, but registering your wallet failed. Try again.',
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  const s: Search = { claim: one(raw.claim), status: one(raw.status), address: one(raw.address), tx: one(raw.tx), error: one(raw.error) }

  if (!validClaimId(s.claim)) return <p>This claim link is missing its claim ID. Scan the plant&apos;s QR code again.</p>

  if (s.status === 'ok') {
    return (
      <main>
        <h1>Verified</h1>
        <p style={{ color: '#0a7a2f', fontWeight: 'bold' }}>
          You are verified as a unique human. <code>{s.address}</code> can now be paid by the plant.
        </p>
        <p>Registration transaction: <code>{s.tx}</code></p>
      </main>
    )
  }

  const reason = s.error && s.error in REASONS ? REASONS[s.error as ClaimError] : null

  return (
    <main>
      <h1>Claim your reward</h1>
      <p>
        Claim <code>{s.claim}</code>. The plant pays only verified humans, so it asks for a fresh World ID check right now.
      </p>
      {reason && <p style={{ color: '#b00020' }}>Refused: {reason} Nothing was registered.</p>}
      <form action="/api/claim/start" method="get">
        <input type="hidden" name="claim" value={s.claim} />
        <label>
          Wallet address to be paid on (any wallet you own, on the 0G chain)
          <br />
          <input
            name="address"
            required
            pattern="0x[0-9a-fA-F]{40}"
            placeholder="0x..."
            autoComplete="off"
            style={{ width: '100%', font: 'inherit', padding: 8, marginTop: 4 }}
          />
        </label>
        <p>
          <button type="submit" style={{ font: 'inherit', padding: '12px 16px' }}>
            Verify with World ID
          </button>
        </p>
      </form>
    </main>
  )
}
