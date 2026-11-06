# 00. Interfaces: the seams every workstream builds against

This is the single source of truth for names, shapes and events that cross a workstream boundary. If two workstreams disagree, this file wins; change it here first and tell the others.

Vocabulary follows `GLOSSARY.md`. Decisions behind these shapes are in `docs/adr/`.

## 1. Networks

| Thing | Value |
|---|---|
| Money, decisions, contracts | 0G mainnet, chain ID `16661`, RPC `https://evmrpc.0g.ai`, explorer `https://chainscan.0g.ai` |
| 0G Storage indexer | `https://indexer-storage-turbo.0g.ai` |
| Names | Ethereum Sepolia, ENS v2 (2026-09-15 redeploy) |
| ENS address record for a plant wallet | ENSIP-11 coin type `2147500309` (`0x80000000 | 16661`) |

Every value above lives in `.env` files, never in code. The app takes only the forest's ENS name and the RPC URLs.

## 2. Plant state (station or simulator to agent service)

```ts
type PlantMode = 'real' | 'simulated' | 'replay'

type PlantReading = {
  plantName: string        // full ENS name, e.g. "banyan-01.ourforest.eth"
  mode: PlantMode
  ts: number               // unix seconds
  moisture: number         // 0 (bone dry) to 1 (saturated), calibrated on the station
  frameJpegB64?: string    // real plants only, one frame, at most 300 KB
  lastWateredTs?: number
}
```

## 3. Decision (0G Compute output, validated by the agent service)

```ts
type Action = 'water' | 'wait' | 'ask_help' | 'give'

type Decision = {
  action: Action
  waterMl?: number         // water only; integer, 1 to forest maxWaterMlPerOrder
  amountWei?: string       // ask_help and give; decimal string
  toPlant?: string         // give only; full ENS name of the receiver
  helpRequestId?: number   // give only
  reason: string           // at most 200 characters
  confidence: number       // 0 to 1
}
```

The model is asked for exactly this JSON. Anything that does not parse into it becomes `wait` with the rule `invalid_decision`.

## 4. Hard rules (applied by the agent service after 0G answers)

Rules can only make a decision safer. Each one that fires is named in `rulesApplied`. A `reason` longer than 200 characters is cut to 200, not rejected. The `give_breaks_rules` share check uses the current surplus, which is never larger than the contract's window snapshot, so the agent is at least as strict as the contract.

| Rule name | When it fires | Result |
|---|---|---|
| `low_confidence` | `confidence < 0.6` | `wait` |
| `invalid_decision` | output does not match the Decision shape | `wait` |
| `zero_g_timeout` | no answer within 8 s | `wait`, plant status `SAFE_STOP` |
| `min_water_gap` | last watering less than `MIN_WATER_GAP_S` ago (default 600, demo 60) | `wait` |
| `soil_wet` | `moisture >= 0.7` and action is `water` | `wait` |
| `water_cap` | order would pass the forest's per-order or per-day cap | `water` reduced to what fits, or `wait` |
| `cannot_afford_water` | balance below the order cost | `ask_help` for the cost, if no open request |
| `give_breaks_rules` | a pre-check of the contract rules fails | `wait` (the contract would revert anyway) |
| `request_already_open` | `ask_help` (or `cannot_afford_water`) while the plant already has an open request | `wait` (the contract would revert with `RequestAlreadyOpen`) |

## 5. Decision record (stored on 0G Storage, one per checkpoint)

```ts
type DecisionRecord = {
  version: 1
  checkpointId: string      // `${plantName}:${ts}`
  plantName: string
  plantWallet: `0x${string}`
  mode: PlantMode
  ts: number
  inputs: {
    reading: Omit<PlantReading, 'frameJpegB64'> & { frameRoot?: string }
    stage: 'sapling' | 'growing' | 'mature'
    balanceWei: string
    reserveWei: string
    giftedInWindowWei: string
    openHelpRequests: { id: number; plantName: string; amountWei: string; filledWei: string }[]
    ownOpenRequestId: number   // 0 when none
  }
  zeroG: {
    provider: `0x${string}`
    model: string
    requestId: string          // from the ZG-Res-Key header, or data.id
    verified: boolean | null   // processResponse result; null if not checked
    raw: string                // the model's text output
  }
  decision: Decision | null    // null when 0G did not answer
  rulesApplied: string[]
  finalDecision: Decision
}
```

- The frame is uploaded separately and referenced by `frameRoot`.
- The record's 0G Storage root hash is the `root` passed to every contract call for that checkpoint.

## 6. Contracts (0G mainnet, Solidity ^0.8.24, Foundry)

### Forest

```solidity
constructor(address guardianExecutor, address supplier, uint256 waterPriceWeiPerMl,
            uint16 shareLimitBps, uint32 maxWaterMlPerOrder, uint32 maxWaterMlPerDay)

function registerPlant(address wallet) external;           // guardian only
function setRules(uint256 waterPriceWeiPerMl, uint16 shareLimitBps,
                  uint32 maxWaterMlPerOrder, uint32 maxWaterMlPerDay) external; // guardian only
function isPlant(address wallet) external view returns (bool);
function openHelpRequest(uint256 amountWei, string calldata requestId, bytes32 root)
    external returns (uint256 id);                         // caller must be a registered PlantWallet
function recordGift(uint256 id, uint256 amountWei) external; // caller must be a registered PlantWallet
function helpRequest(uint256 id) external view
    returns (address plant, uint256 amountWei, uint256 filledWei, bool open);
function openRequestOf(address plant) external view returns (uint256 id); // 0 when none; ids start at 1

event PlantRegistered(address indexed wallet);
event RulesSet(uint256 waterPriceWeiPerMl, uint16 shareLimitBps, uint32 maxWaterMlPerOrder, uint32 maxWaterMlPerDay);
event HelpRequested(uint256 indexed id, address indexed plant, uint256 amountWei, string requestId, bytes32 root);
event HelpFilled(uint256 indexed id);
```

### PlantWallet

```solidity
constructor(address forest, address agent, address guardianExecutor, uint256 reserveWei)

receive() external payable;                                // emits Funded
function orderWater(uint32 ml, string calldata requestId, bytes32 root) external returns (uint256 orderId); // agent only
function askHelp(uint256 amountWei, string calldata requestId, bytes32 root) external returns (uint256 id); // agent only
function give(address to, uint256 helpRequestId, uint256 amountWei,
              string calldata requestId, bytes32 root) external; // agent only
function logDecision(uint8 action, string calldata requestId, bytes32 root) external; // agent only, for wait
function setReserve(uint256 reserveWei) external;          // guardian only
function setAgent(address agent) external;                 // guardian only
function guardianWithdraw(address to, uint256 amountWei) external; // guardian only

event Funded(address indexed from, uint256 amountWei);
event WaterOrdered(uint256 indexed orderId, uint32 ml, uint256 costWei, string requestId, bytes32 root);
event Gift(address indexed to, uint256 indexed helpRequestId, uint256 amountWei, string requestId, bytes32 root);
event DecisionLogged(uint8 action, string requestId, bytes32 root);
event GuardianAction(bytes4 indexed selector, bytes data);

error NotAgent();
error NotGuardian();
error NotInForest();
error NoOpenRequest();
error ReserveBreached();
error OverShareLimit();
error WaterCapExceeded();
error InsufficientBalance();
error RequestAlreadyOpen();
```

Rules the contracts enforce:
- **`orderWater`:** pays `ml * waterPriceWeiPerMl` to the supplier. It may spend into the reserve, because water is survival; the reserve only blocks gifts. Reverts with `WaterCapExceeded` past the per-order or rolling per-day cap.
- **`askHelp`:** at most one open request per plant (`RequestAlreadyOpen`).
- **`give`:**
  - `to` must be a registered plant (`NotInForest`).
  - `helpRequestId` must be open and belong to `to`, and the amount must not exceed what is unfilled (`NoOpenRequest`).
  - The balance after the gift must stay at or above the reserve (`ReserveBreached`).
  - Total gifts in the current 24-hour window must stay at or under `surplusAtWindowStart * shareLimitBps / 10000` (`OverShareLimit`).
  - The window starts at the first gift after the previous window ended.
- **Defaults at deploy:**
  - `waterPriceWeiPerMl` = 1e12 (150 ml = 0.00015 0G)
  - `shareLimitBps` = 2500
  - `maxWaterMlPerOrder` = 150
  - `maxWaterMlPerDay` = 500

`Action` encoding for `logDecision`: water = 0, wait = 1, ask_help = 2, give = 3.

## 7. ENS records (Sepolia)

On the forest name (`ourforest.eth`):

| Key | Value |
|---|---|
| `forest.contract` | Forest contract address on 0G |
| `forest.chain` | `16661` |
| `forest.plants` | comma-separated labels, e.g. `banyan-01,tulsi-04` (guardian-written; how the app discovers plants) |
| `forest.supplier` | supplier address |

On each plant name (`<label>.ourforest.eth`), served by its own Permissioned Resolver:

| Key | Writer | Value |
|---|---|---|
| addr, coin type `2147500309` | guardian | PlantWallet address on 0G |
| `forest.species` | guardian | e.g. `neem` |
| `forest.stage` | guardian | `sapling`, `growing` or `mature` |
| `forest.mode` | guardian | `real` or `simulated` |
| `forest.persona` | guardian | the persona text, at most 400 characters |
| `forest.status` | plant agent | `ok`, `thirsty` (the distress signal), `giving` or `safe_stop` |
| `forest.decision` | plant agent | root hash of the latest decision record |
| `avatar`, `description` | guardian | standard ENS keys |

The plant agent's key is granted `ROLE_SET_TEXT` only for `forest.status` and `forest.decision`, on its own resolver. It writes at most once every 5 minutes, or when its status changes.

## 8. Agent service HTTP API (JSON)

| Method and path | Caller | Body or query | Returns |
|---|---|---|---|
| `POST /readings/:plantName` | station | `PlantReading` | `{ ok: true }` |
| `POST /checkpoint/:plantName` | app (demo button), scheduler | none | `{ checkpointId }` |
| `GET /forest` | app | none | `{ forestName, plants: PlantView[] }` |
| `GET /plants/:plantName/decisions` | app | `?limit=20` | `DecisionSummary[]` |
| `GET /talk` | app | `?since=<ts>` | `TalkLine[]` |
| `GET /events` | app | server-sent events | `{ type, data }` with type `decision`, `talk`, `order`, `delivered`, `status` |
| `POST /delivered/:plantName` | station | `{ orderId, ml, pumpMs }` | `{ ok: true }` |
| `POST /chat/:plantName` | app | `{ message }` | `{ reply, refused }` |
| `POST /guardian/bind` | app | `{ proof }` | `{ ok }` or 403 |
| `POST /guardian/action` | app | `{ action: GuardianAction, proof }` | `{ ok, txHash }` or 403 `{ error }` |
| `POST /replay` | app | `{ episodeRoot }` or `{ stop: true }` | `{ ok }` |

```ts
type PlantView = {
  name: string; wallet: `0x${string}`; mode: PlantMode; stage: string; persona: string
  balanceWei: string; reserveWei: string; moisture: number | null
  status: 'ok' | 'thirsty' | 'giving' | 'safe_stop'
  lastDecision: DecisionSummary | null
}
type DecisionSummary = { checkpointId: string; ts: number; action: Action; reason: string
  requestId: string | null; root: string | null; txHash: string | null; rulesApplied: string[] }
type TalkLine = { ts: number; plantName: string; kind: 'ask' | 'give' | 'thanks' | 'water' | 'refuse'
  text: string; txHash?: string }
type GuardianAction =
  | { kind: 'setRules'; waterPriceWeiPerMl: string; shareLimitBps: number; maxWaterMlPerOrder: number; maxWaterMlPerDay: number; nonce: number }
  | { kind: 'setReserve'; plantName: string; reserveWei: string; nonce: number }
  | { kind: 'withdraw'; plantName: string; to: `0x${string}`; amountWei: string; nonce: number }
  | { kind: 'setPersona'; plantName: string; persona: string; nonce: number }
  | { kind: 'setStage'; plantName: string; stage: 'sapling' | 'growing' | 'mature'; nonce: number }
  | { kind: 'resetSafeStop'; plantName: string; nonce: number }
```

## 9. World ID

| Item | Value |
|---|---|
| Action ID | `forest-guardian`, set to allow repeated verifications by the same person |
| Signal | `keccak256` of the canonical JSON of the `GuardianAction` (sorted keys), so a proof works for exactly one action |
| Binding | the first successful `POST /guardian/bind` stores the proof's nullifier hash as the forest's guardian |
| Check | every `POST /guardian/action` verifies the proof in the backend, then requires the nullifier hash to equal the stored one; any other verified human is refused with 403 `not_guardian` |
| Replay protection | `nonce` must be greater than the last used nonce |

## 10. Station configuration (hardware side)

```yaml
service_url: http://<agent-service-host>:8787
rpc_url: https://evmrpc.0g.ai
plants:
  - name: banyan-01.ourforest.eth
    pump_gpio: 17
    sensor_channel: 0        # ADC channel
    ml_per_second: 8.0       # measured by pumping into a measuring cup
  - name: tulsi-04.ourforest.eth
    pump_gpio: 27
    sensor_channel: 1
    ml_per_second: 8.0
max_pump_seconds: 30
wet_threshold: 0.7
reading_interval_s: 10
offline_safe_stop_s: 10
```

The station resolves each plant's wallet through the agent service's `GET /forest`, which resolves it from ENS. No wallet addresses are written in the station config.
