import { resolveWallet, validClaimId, type ClaimError, type ResolvedWallet } from '@/lib/claim'
import { ensLookup, payoutChainId } from '@/lib/server'

type Search = { claim?: string; status?: string; address?: string; tx?: string; error?: string; name?: string }

const REASONS: Record<ClaimError, string> = {
  bad_request: 'That is not a valid wallet address or ENS name. Enter a 0x address or a name like alice.eth.',
  ens_not_found: 'No wallet address is set for that ENS name. Enter a 0x address instead.',
  unknown_attempt: 'This verification expired or was started in another browser. Start again on this device.',
  login_failed: 'World ID verification was cancelled or denied.',
  invalid_token: 'World ID could not confirm the verification.',
  wrong_credential: 'This forest needs a verified unique human World ID.',
  not_fresh: 'The verification was not fresh. Every payout needs a new World ID check.',
  already_claimed: 'You have already claimed this reward.',
  register_failed: 'Your verification passed, but registering your wallet failed. Try again.',
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

const button = { font: 'inherit', padding: '12px 16px' }

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  const s: Search = { claim: one(raw.claim), status: one(raw.status), address: one(raw.address), tx: one(raw.tx), error: one(raw.error), name: one(raw.name) }

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

  let resolved: ResolvedWallet | null = null
  let error = s.error
  if (s.name) {
    resolved = await resolveWallet(s.name, ensLookup, payoutChainId()).catch(() => null)
    if (!resolved) error = 'ens_not_found'
  }

  if (s.name && resolved) {
    return (
      <main>
        <h1>Confirm your wallet</h1>
        <p>
          <code>{s.name}</code> points to <code>{resolved.address}</code>
          {resolved.via === 'ens-chain' ? ', its address for this chain.' : ', its Ethereum address.'}
        </p>
        {resolved.via === 'ens-eth' && (
          <p>Make sure you control this address on the 0G chain. A normal wallet such as MetaMask does; some smart-contract wallets do not.</p>
        )}
        <form action="/api/claim/start" method="get">
          <input type="hidden" name="claim" value={s.claim} />
          <input type="hidden" name="address" value={resolved.address} />
          <p>
            <button type="submit" style={button}>
              Yes, verify with World ID
            </button>
          </p>
        </form>
        <p>
          <a href={`/claim?claim=${encodeURIComponent(s.claim)}`}>Use a different wallet</a>
        </p>
      </main>
    )
  }

  const reason = error && error in REASONS ? REASONS[error as ClaimError] : null

  return (
    <main>
      <h1>Claim your reward</h1>
      <p>Claim <code>{s.claim}</code>. The plant pays only verified humans, so it asks for a fresh World ID check right now.</p>
      {reason && <p style={{ color: '#b00020' }}>Refused: {reason} Nothing was registered.</p>}
      <form action="/api/claim/start" method="get">
        <input type="hidden" name="claim" value={s.claim} />
        <label>
          Wallet address or ENS name to be paid on (any wallet you own, on the 0G chain)
          <br />
          <input
            name="address"
            required
            defaultValue={s.name}
            placeholder="0x... or alice.eth"
            autoComplete="off"
            autoCapitalize="none"
            style={{ width: '100%', font: 'inherit', padding: 8, marginTop: 4 }}
          />
        </label>
        <p>
          <button type="submit" style={button}>
            Verify with World ID
          </button>
        </p>
      </form>
    </main>
  )
}
