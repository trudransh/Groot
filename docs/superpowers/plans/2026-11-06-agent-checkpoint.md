# Agent checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One simulated plant's checkpoint runs end to end on real 0G: reading, decision, rules, record on 0G Storage, `logDecision` onchain, visible in `GET /forest`. This is the G1 tracer bullet (ticket 03), with the seams the water and sharing paths reuse.

**Architecture:**
- A checkpoint is a fixed pipeline over five interfaces: `Decider`, `Rules`, `RecordStore`, `PlantWalletClient`, `EventBus`.
- Each interface has a real implementation and a fake.
- The pipeline is tested with fakes; the live run uses the real ones.

**Tech Stack:** TypeScript, Node 22, pnpm, vitest, viem, `@0gfoundation/0g-compute-ts-sdk`, `@0gfoundation/0g-storage-ts-sdk`, ethers (peer dependency of both 0G SDKs).

**Spec:** `docs/specs/02-agent-service.md`, `docs/specs/03-sim-and-replay.md`, and `docs/specs/00-interfaces.md` sections 2 to 5 and 8.

## Global Constraints

- Every type crossing a boundary is copied exactly from `00-interfaces.md`, into `agent/src/types.ts`.
- 0G request timeout 8 s. Minimum confidence 0.6. `MIN_WATER_GAP_S` default 600. `CHECKPOINT_SECONDS` default 30.
- No onchain call without a stored record root.
- All URLs, keys and addresses come from `agent/.env`; plant names and wallets come from ENS once ticket 06 lands. Until then, from `contracts/deployments/16661.json`.
- No code comments, ever (see AGENTS.md).
- One feature per commit, under the human's own name, no AI co-author lines.

## Review Focus

1. **A model reply that is valid JSON but has an unknown `action`** (for example `"fertilize"`) must become `wait` with `invalid_decision`. Test in Task 2.
2. **A `give` with no `toPlant` or no `helpRequestId`** must become `wait` with `invalid_decision`. Test in Task 2.
3. **A model reply wrapped in a markdown code fence** must still parse. Test in Task 3.
4. **Two checkpoints for the same plant triggered at once** (the scheduler tick plus a "check now" click) must run one after the other, never in parallel. Test in Task 5.
5. **A record upload that succeeds but returns an empty root** must be treated as a failure. No onchain call. Test in Task 4.

---

### Task 1: Agent package and shared types

**Files:**
- Create: `agent/package.json`, `agent/tsconfig.json`, `agent/vitest.config.ts`, `agent/.env.example`, `agent/src/types.ts`

**Interfaces:**
- Produces: `PlantReading`, `Decision`, `Action`, `DecisionRecord`, `PlantView`, `DecisionSummary`, `TalkLine`, `GuardianAction`, exactly as in `00-interfaces.md`, plus `CheckpointContext`:

```ts
type CheckpointContext = { plantName: string; plantWallet: `0x${string}`; reading: PlantReading
  stage: 'sapling' | 'growing' | 'mature'; persona: string; balanceWei: bigint; reserveWei: bigint
  giftedInWindowWei: bigint; shareLimitBps: number; waterPriceWeiPerMl: bigint
  maxWaterMlPerOrder: number; waterMlToday: number; maxWaterMlPerDay: number
  openHelpRequests: { id: number; plantName: string; amountWei: bigint; filledWei: bigint }[]
  ownOpenRequestId: number }
```

- [ ] **Step 1:** `pnpm init`, add the dependencies above, and add a `test` script running `vitest run`.
- [ ] **Step 2:** Write `src/types.ts`.
- [ ] **Step 3:** Run `pnpm tsc --noEmit`. Expected: no errors.
- [ ] **Step 4:** Commit `chore(agent): package and shared types`.

### Task 2: Rules

**Files:**
- Create: `agent/src/rules.ts`, `agent/test/rules.test.ts`

**Interfaces:**
- Produces: `applyRules(ctx: CheckpointContext, decision: Decision | null, opts: { minConfidence: number; minWaterGapS: number; now: number }): { finalDecision: Decision; rulesApplied: string[] }`

- [ ] **Step 1: Write the failing table tests,** one case per rule in `00-interfaces.md` section 4, plus Review Focus 1 and 2. Each asserts `finalDecision.action` and `rulesApplied`. `decision = null` asserts `wait` with `zero_g_timeout`.
- [ ] **Step 2: Run** `pnpm vitest run test/rules.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `applyRules` as a pure function.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(agent): hard rules on decisions`.

### Task 3: 0G Decider

**Files:**
- Create: `agent/src/decider/types.ts`, `agent/src/decider/zeroG.ts`, `agent/src/decider/fake.ts`, `agent/src/decider/parse.ts`, `agent/test/parse.test.ts`

**Interfaces:**
- Produces:
  - `interface Decider { decide(ctx: CheckpointContext): Promise<DeciderResult> }`
  - `type DeciderResult = { decision: Decision | null; zeroG: DecisionRecord['zeroG'] | null }`, where `null` means timeout or error.
  - `parseDecision(text: string): Decision | null`.

- [ ] **Step 1: Write the failing tests** for `parseDecision`: plain JSON, JSON inside a markdown fence (Review Focus 3), JSON with extra prose around it, invalid JSON returns null.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `parseDecision` and `ZeroGDecider`:
  - `createZGComputeNetworkBroker` with the agent wallet;
  - pick the provider from `listService()` by the `ZG_PROVIDER` env var, or the first `chatbot`;
  - `getServiceMetadata`, `getRequestHeaders`, then `fetch` `${endpoint}/chat/completions`;
  - the request ID from the `ZG-Res-Key` header, else `data.id`;
  - `processResponse(provider, chatID)` into `verified`;
  - an 8 s `AbortController` timeout returns `{ decision: null, zeroG: null }`.

  The prompt asks for the `Decision` JSON only and includes the context fields. Its wording is the builder's call.
- [ ] **Step 4: Run** the tests (PASS), then the live smoke script `pnpm tsx scripts/smoke-decide.ts`. Expected: prints a `Decision` and a non-empty `requestId`.
- [ ] **Step 5: Commit** `feat(agent): 0G compute decider`.

### Task 4: Record store and the checkpoint pipeline

**Files:**
- Create: `agent/src/records/zeroGStorage.ts`, `agent/src/records/fake.ts`, `agent/src/wallet/client.ts`, `agent/src/wallet/fake.ts`, `agent/src/checkpoint.ts`, `agent/test/checkpoint.test.ts`

**Interfaces:**
- Consumes: `Decider`, `applyRules`.
- Produces:
  - `interface RecordStore { put(record: DecisionRecord): Promise<{ root: string }>; putFrame(jpeg: Uint8Array): Promise<{ root: string }> }`
  - `interface PlantWalletClient { logDecision(action: number, requestId: string, root: `0x${string}`): Promise<`0x${string}`>; orderWater(ml: number, requestId: string, root: `0x${string}`): Promise<`0x${string}`>; askHelp(amountWei: bigint, requestId: string, root: `0x${string}`): Promise<`0x${string}`>; give(to: `0x${string}`, helpRequestId: number, amountWei: bigint, requestId: string, root: `0x${string}`): Promise<`0x${string}`> }`
  - `runCheckpoint(deps: { decider: Decider; store: RecordStore; wallet: PlantWalletClient; bus: EventBus; now: () => number }, ctx: CheckpointContext): Promise<DecisionSummary>`

- [ ] **Step 1: Write the failing tests** with fakes:
  - The happy path calls, in order, `decide`, `put`, then exactly one wallet method matching `finalDecision.action` (`wait` maps to `logDecision(1, …)`).
  - A `put` rejection makes no wallet call and emits status `safe_stop`.
  - An empty root makes no wallet call (Review Focus 5).
  - A decider timeout records a `wait` with `zero_g_timeout`, still stores the record, and emits status `safe_stop`.
  - The returned summary carries `requestId`, `root` and `txHash`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement:**
  - `ZeroGRecordStore`: `MemData` of the JSON, `merkleTree()`, `indexer.upload(file, RPC_URL, signer)`, return `rootHash`.
  - The viem `PlantWalletClient`.
  - `runCheckpoint`, in the fixed order from `02-agent-service.md`.
- [ ] **Step 4: Run** the tests (PASS), then `pnpm tsx scripts/smoke-checkpoint.ts banyan-01`. Expected: prints a request ID, a root that opens on the 0G storage explorer, and a tx hash that opens on `https://chainscan.0g.ai`.
- [ ] **Step 5: Commit** `feat(agent): checkpoint pipeline on 0G`.

### Task 5: Simulated plant, scheduler and API

**Files:**
- Create: `agent/src/sim/plant.ts`, `agent/src/scheduler.ts`, `agent/src/events.ts`, `agent/src/api/server.ts`, `agent/test/sim.test.ts`, `agent/test/scheduler.test.ts`, `agent/test/api.test.ts`

**Interfaces:**
- Produces:
  - `class SimulatedPlant { constructor(opts: { plantName: string; stage: 'sapling' | 'growing' | 'mature'; moisture: number; speed: number; potCapacityMl: number }); reading(now: number): PlantReading; deliver(ml: number): void }`
  - `class Scheduler { trigger(plantName: string): Promise<DecisionSummary>; start(): void; stop(): void }`, where `trigger` queues behind a running checkpoint for the same plant.
  - `interface EventBus { emit(type: 'decision' | 'talk' | 'order' | 'delivered' | 'status', data: unknown): void }`
  - HTTP routes `GET /forest`, `POST /checkpoint/:plantName`, `GET /plants/:plantName/decisions`, `GET /events`, with response shapes from `00-interfaces.md` section 8.

- [ ] **Step 1: Write the failing tests:**
  - `SimulatedPlant` moisture falls by 0.12 per simulated hour for a sapling, and `deliver(100)` adds 0.1.
  - `Scheduler.trigger` twice at once runs sequentially (Review Focus 4).
  - `GET /forest` returns the `PlantView` shape with `lastDecision` filled after one checkpoint (fakes).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** them. The server listens on `PORT`, default 8787.
- [ ] **Step 4: Run** the tests (PASS), then `pnpm dev` and `curl -X POST localhost:8787/checkpoint/banyan-01.ourforest.eth && curl localhost:8787/forest`. Expected: the plant shows a `lastDecision` with a request ID, a root and a tx hash. **This is gate G1.**
- [ ] **Step 5: Commit** `feat(agent): simulated plants, scheduler and API`.
