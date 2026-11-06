# worldcoin: paying a human after World ID Agent Pass

A plant pays a human who refilled its bottle or watered a thirsty plant, and only after a fresh World ID Agent Pass verification at that moment. The human chooses any wallet they own on the 0G chain.

Track: World ID Agent Pass. Contract side: `Forest.registerHuman` and `PlantWallet.payHuman` in `contracts/`. Spec: `docs/specs/00-interfaces.md` section 9.

## Flow

1. The plant shows a QR code for `/claim?claim=<id>`. The person enters a wallet address and taps **Verify with World ID**.
2. `GET /api/claim/start` stores an attempt `{ state, nonce, PKCE verifier, claimId, address, startedAt }` for 10 minutes, sets a `claim_state` cookie, and redirects to World's authorize endpoint with `max_age=0`, `prompt=login` and `acr_values` from `WORLD_AUTH_ACR`.
3. World returns to `GET /api/claim/callback`. The backend checks:
   - the attempt exists, is unexpired, is used once, and matches the cookie (same browser);
   - the callback's `iss` equals the issuer (RFC 9207);
   - the code exchange (`client_secret_basic`, PKCE) returns an ID token signed RS256 by a key in World's JWKS, with the right `iss`, `aud`, `exp`, `iat` and `nonce`;
   - `acr` is one of `WORLD_AUTH_ACR`, so a plain key sign-in without a World ID proof is refused;
   - `auth_time` falls inside this attempt, so an earlier session does not count;
   - the pair (claim ID, `sub`) is unused, so one person is paid once per claim whatever wallet they enter.
4. Only then the guardian executor calls `Forest.registerHuman(address)`, after which a plant's `payHuman` can pay that address. Any failure registers nothing and the page says why.

## Run

```bash
cd worldcoin
pnpm install
cp .env.example .env    # fill in the client ID, secret, callback and chain
pnpm test               # claim checks, no network
pnpm dev                # http://localhost:3000/claim?claim=test-1
```

World only accepts HTTPS callback URLs, so run a tunnel to port 3000 and register `https://<host>/api/claim/callback` in the portal. With cloudflared on networks that block QUIC: `cloudflared tunnel --protocol http2 --url http://localhost:3000 run --token-file <file>`.

The forest address is read from `contracts/deployments/<CHAIN_ID>.json`. For a local test, run `anvil`, deploy with `contracts/script/Deploy.s.sol`, and set `CHAIN_ID=31337`, `CHAIN_RPC_URL=http://127.0.0.1:8545`.

## Environment

| Variable | Value |
|---|---|
| `WORLD_AUTH_ISSUER` | `https://sandbox.auth.world.org` for testing, `https://auth.world.org` in production. Clients are registered separately in each issuer's portal |
| `WORLD_AUTH_CLIENT_ID`, `WORLD_AUTH_CLIENT_SECRET` | From the portal, auth method `client_secret_basic`. Leave the secret empty for a public client |
| `WORLD_AUTH_REDIRECT_URI` | The exact HTTPS callback registered in the portal |
| `WORLD_AUTH_ACR` | Accepted classes, comma separated. Sandbox: `https://world.org/oidc/acr/orb` |
| `CHAIN_ID`, `CHAIN_RPC_URL`, `GUARDIAN_EXECUTOR_KEY` | The chain where `Forest` is deployed and the guardian executor key that calls `registerHuman` |

## Testing in the sandbox

- Install the sandbox World App (iOS TestFlight or Android Firebase links on the ETHGlobal World prize page; iOS needs an invite from World).
- In the app: World ID tab, **Add proof of human**, **Manual verify**, selfie. Issuance takes about an hour; the app then shows "verified unique human".
- On World's sign-in page choose **World App**, not passkey.

## Findings

- Asking for the class strictly (an essential `acr` claim) made the sandbox World App refuse with "Verification was not approved". The soft `acr_values` request works and the backend enforces the class itself. Verified end to end: `acr` orb, `amr` `["pop"]`.
- Without any class request, World accepts a plain key sign-in (`amr` `["pop","user","mfa"]`, no `acr`). It is refused as `wrong_credential`.
- Production refused Selfie Check (`https://world.org/oidc/acr/selfie`) with `unmet_authentication_requirements`; discovery lists only `orb` and `orb-face`.
- The sandbox account first failed with "V4 protocol and credential issuance must both be enabled for this account" until World enabled it.

## Limits

- Attempts are kept in memory, so a restart drops attempts in flight and the person starts again.
- Used (claim ID, `sub`) pairs are kept in `.data/claims.json`, which fits one server process. Several processes need a database with a unique key on the pair.
- The guardian executor key is trusted to call `registerHuman` only after these checks; the contract cannot verify World ID itself.
