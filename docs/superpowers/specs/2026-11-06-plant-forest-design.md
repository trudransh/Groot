# Plant forest: design

Status: approved 6 Nov 2026, 02:15 IST. Workstreams are split by the team in the morning.

Working name. The team picks the real name; `ourforest.eth` below is a placeholder.

## 1. Intent

We are building autonomous plants that fight their own biology. In a natural forest the big trees are self-sufficient and pull water and nutrients away from the small plants around them, so the small ones struggle until they are grown. Our plants do the opposite: they share instead of competing, and grow together as a forest.

Each plant is an AI agent with its own wallet, its own name and its own personality. It watches its own health, buys its own water, and when it is strong it sends money to the young plants that need it. People can talk to any plant.

It is a physical thing. Real plants sit on the table, a Raspberry Pi watches them, and a real pump waters a plant only after that plant has paid for the water onchain.

## 2. Why, and what success looks like

- Finalist at ETHGlobal Mumbai, with a demo that feels alive on stage.
- Prizes from three partners, each one load-bearing: 0G (Physical AI, and Wildcard comes with it), ENS v2, World ID.
- A product with a future beyond the weekend. That future is not designed here; the pitch can speak to it.

## 3. Goals

1. A plant decides for itself through 0G, at every checkpoint, what it needs: water, wait, ask for help, or give to another plant.
2. A plant pays for its own water from its own wallet, and the pump runs only after the payment lands.
3. Mature plants send money to saplings that asked for help, and the forest's rules are enforced by contract code, not by the AI behaving well.
4. Every plant is a name under the forest's ENS name, with its own records and permissions.
5. Anyone can talk to a plant. Only a verified human guardian can change a plant's rules or move its money outside the forest rules.
6. The forest has more plants than the table: simulated plants run the same loop with real 0G calls and are labelled as simulated.

## 4. Non-goals

- Plants that move. No wheels, no robot arms.
- Physical water routing between pots. Only money moves between plants.
- Nutrients from a real supplier, multiple forests, real money on mainnet.
- 0G iAI track. Parked until the team decides; the design leaves room for it (section 9).

## 5. Anti-goals: it fails even if it technically works when

- A decision on screen did not come from a real 0G call. The 0G track disqualifies faked decisions.
- The pump runs without a paid order behind it, or keeps running when 0G is unreachable.
- The plants look like a chat wrapper: talking is a feature, the autonomy is the product.
- A stranger in the chat can talk a plant into sending its money away.
- The app has hard-coded plant addresses instead of resolving them from ENS. ENS lists "no hard-coded values" as a must-show.

## 6. Constraints

**Event rules (ETHGlobal Mumbai)**
- Submissions close Sat 7 Nov 09:00 IST. Video 2 to 4 minutes, under 3 for 0G.
- From Scratch: project code must be written after hacking starts. Specs, plans and prompts written before are allowed, and must be committed to the repo. **Open question for the station builder:** if any of the Raspberry Pi prototype code was written before 5 Nov, it cannot be copied in. The hardware is fine; the code gets rewritten during the event, or the project enters Continuity and discloses it.
- Commit history is judged: one feature or fix per commit, under each person's own name.
- Up to 3 partners. A partner with several tracks counts once and makes us eligible for all of them.
- `AI_USAGE.md` must say what was generated, written by hand and reviewed.

**0G must-shows (Physical AI)**
- A 0G call inside the decision loop.
- An episode log on 0G Storage with a request ID per decision.
- A replayable simulation.
- A safe-stop fallback.
- Wildcard additionally needs a compute request ID, a storage root hash, a chain contract address and one sentence on what breaks without 0G. We will have all four.
- Every 0G track: video under 3 minutes, live demo link, contract addresses, team Telegram and X.

**ENS v2 must-shows**
- ENS v2 features at the centre: subname registry, Enhanced Access Control, Permissioned Resolver. Bonus for "agents as namespaces, each with their own identity and permissions".
- Built on mainnet or Sepolia, no hard-coded values, live demo link, open source.

**World ID must-shows**
- The full journey: request, the person completes it, the backend validates it, the protected action runs.
- A failed path where the action does not happen.
- Validation in the backend, never trusting the client.
- An integration debrief: time to first success, friction, missing capability, top improvement.

**Facts checked on 6 Nov 2026**
- 0G Galileo testnet: chain ID 16602, RPC `https://evmrpc-testnet.0g.ai`, explorer `https://chainscan-galileo.0g.ai`, faucet `https://faucet.0g.ai` at 0.1 0G per wallet per day. [0G docs](https://docs.0g.ai/developer-hub/testnet/testnet-overview)
- 0G Compute: package `@0gfoundation/0g-compute-ts-sdk`; `createZGComputeNetworkBroker`; ledger needs a 3 0G minimum deposit and each provider at least 1 0G; request ID from the `ZG-Res-Key` header or `data.id`; `processResponse` verifies the provider's signature. Only LLM chat services are documented; vision is not confirmed. [0G inference docs](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference)
- 0G Storage: package `@0gfoundation/0g-storage-ts-sdk`; testnet indexer `https://indexer-storage-testnet-turbo.0g.ai`; `indexer.upload(file, rpc, signer)` returns `{ rootHash, txHash }`. [0G storage docs](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)
- ENS v2 is deployed on Sepolia (2026-09-15 redeploy); ensjs support for it is in an open PR. [ENS v2 overview](https://docs.ens.domains/ensv2/overview/), [ensjs PR 380](https://github.com/ensdomains/ensjs/pull/380)
- ENS v2 Permissioned Resolver roles can be scoped to one text key, but not to one name: "a role holder can write the covered records on every name served by the resolver instance". Per-name permissions need one resolver instance per name. [Permissioned Resolver](https://docs.ens.domains/ensv2/permissioned-resolver)

**Money budget.** The faucet gives 0.1 0G per wallet per day, while the 0G Compute ledger needs 3 0G plus 1 0G per provider. Testnet 0G has to come from 0G's team on Discord. This blocks the decision loop, so it is the first thing to ask tonight.

## 7. Approaches considered

### 7.1 Sponsor stack

| Option | What it is | Trade-off | Picked |
|---|---|---|---|
| 0G + ENS v2 + World ID | Plants decide and log on 0G, live as ENS names, a verified guardian protects their money | Three load-bearing partners; World adds the "failed path" moment | **Yes (team choice)** |
| 0G + ENS v2 + Chainlink CRE | CRE brings in a weather forecast so a plant skips watering before rain | Nice moment, $1.5k, and CRE on the 0G chain is unconfirmed | No |
| 0G + ENS v2 only | All depth in two partners | Leaves a prize slot empty | No |
| Hedera, Arc or Whitechain | Need their own chain | Conflicts with 0G as the home chain | Ruled out |

### 7.2 Plant wallets

| Option | Trade-off | Picked |
|---|---|---|
| One plain key (EOA) per plant | Simplest, but the forest rules live only in agent code, so a buggy or tricked agent can send everything | No |
| One smart-contract wallet per plant, owned by that plant's agent key | Each plant has a real address its ENS name resolves to, gifts are real transfers, and the contract enforces the forest rules | **Yes (team choice: own wallet per plant; contract wallet is my call)** |
| Budgets inside one shared contract | Easy, but plants don't really have wallets | No |

### 7.3 What moves between plants

Money only (team choice). A sapling uses the money to buy its own water. Physical water routing was considered and dropped (section 4).

### 7.4 0G tracks

Physical AI is the main target and Wildcard comes with picking 0G. iAI is parked until the team decides.

## 8. The design

### 8.1 Parts and workstreams

The team splits these workstreams among itself in the morning. Each one owns whole parts, so nobody waits on a half-built neighbour.

| Workstream | What it builds |
|---|---|
| WS-STATION | Raspberry Pi with a camera, a soil-moisture sensor and a pump per real plant. Reports readings, watches for paid water orders, runs the pump only for a paid order, stops safely |
| WS-AGENT | One agent per plant. Runs checkpoints, calls 0G Compute, writes decision records to 0G Storage, signs the plant's transactions, serves the app's API and live feed |
| WS-SIM | Simulated plants and replay mode, driving the same agent loop as real plants |
| WS-CONTRACTS | `PlantWallet` per plant and a `Forest` registry on the 0G testnet: rules, help requests, the supplier, water orders |
| WS-ENS | `ourforest.eth` on Sepolia with a subname per plant, one Permissioned Resolver per plant, scoped roles, deploy scripts |
| WS-GUARDIAN | World ID check in the backend before every guardian action, and the guardian panel |
| WS-APP | Forest view, plant page, forest talk feed, chat |
| WS-SHIP | Demo script, video, README, AI_USAGE.md, sponsor write-ups, submission |

**Hardware is not confirmed yet** (checked in the morning). The plan works either way:
- If the station hardware is ready, two real plants lead the demo.
- If it is not, WS-SIM carries the demo and the station joins when it works.

### 8.2 One checkpoint

1. The station (or the simulator, for a simulated plant) reports the plant's state: soil moisture, a camera frame, time since last watering.
2. The plant's agent gathers its context: stage, persona, wallet balance, reserve, open help requests in the forest, and its own open request.
3. The agent asks 0G Compute for one decision: `water`, `wait`, `ask_help` or `give`, with an amount, a reason and a confidence.
4. Hard rules apply on top and can only make the decision safer: a water cap per day, a minimum gap between waterings, and `wait` when confidence is low.
5. The decision record goes to 0G Storage and returns a root hash.
6. Only then is the action signed from the plant's wallet, carrying the request ID and the root hash.

### 8.3 Buying water: payment first, then the pump

1. The plant decides `water` for N ml.
2. `PlantWallet.orderWater(ml, requestId, root)` pays the forest's water supplier at the forest's price per ml and emits `WaterOrdered(orderId, plant, ml, requestId, root)`.
3. The station watches for `WaterOrdered` events for its plants, runs the pump for N ml, then reports completion to the agent service (`POST /delivered/:plantName`), which shows it in forest talk.
4. No event, no pump. If 0G does not answer within the timeout, or the transaction does not confirm, the plant does not water and the station shows `SAFE_STOP`.
5. The station's firmware also refuses to run the pump past a fixed maximum time, or when the soil is already wet.

### 8.4 Sharing: asking and giving

1. A sapling whose balance cannot cover the water it needs decides `ask_help` and opens a help request in the `Forest` contract for an amount.
2. At their next checkpoint, other plants see the open request in their context. A plant with money above its reserve asks 0G whether to give, and how much, in its own persona.
3. `PlantWallet.give(to, amount, helpRequestId, requestId, root)` sends the money only if all rules hold. Each failure is a revert reason with its own test:
   - `NotInForest`: both plants are registered in the same forest.
   - `NoOpenRequest`: the receiver has an open help request.
   - `ReserveBreached`: the giver keeps at least its reserve.
   - `OverShareLimit`: a giver passes at most a fixed share of its surplus above reserve in any 24 hours (25% to start).
4. A request closes when it is filled.
5. Each ask, gift and thank-you gets one line in the plant's voice from 0G, shown in the forest talk feed. The contract decides whether money moves; the voice only describes it.

### 8.5 Where plants get money

Anyone can send money to a plant by its ENS name, because the name resolves to the plant's wallet. The guardian seeds the forest at the start. Mature plants need less water than they receive, so they build up a surplus to share. (My call, see section 10.)

### 8.6 ENS: the forest as a namespace

- `ourforest.eth` is registered on Sepolia under ENS v2, with its own subname registry.
- Each plant is a subname, for example `banyan-01.ourforest.eth`, served by **its own Permissioned Resolver instance**, because per-name permissions need one resolver per name.
- Records on each plant name:
  - The 0G-chain address of its `PlantWallet`, as an address record for chain 16602 (ENSIP-11 coin type).
  - Text records for species, stage, persona, and the latest decision root.
  - Agent records per ENSIP-25 and ENSIP-26, if they fit (to confirm with ENS).
- Roles:
  - The plant's agent key may write only its own `status` and `decision` text keys, on its own resolver.
  - The guardian holds the root roles on every plant's resolver: persona, stage, address.
  - Everyone else can only read.
- The app starts from the forest name alone and discovers plants and addresses through ENS. No addresses are hard-coded.

### 8.7 Guardian: a verified human protects the plants

- Anyone can chat with a plant. If a chat message asks the plant to send money, change its rules or change its persona, the plant refuses and says only its guardian can do that.
- The guardian panel requires a fresh World ID proof for each protected action:
  - Change a forest rule: reserve, share limit, water price.
  - Withdraw from a plant's wallet outside the sharing rules.
  - Change a plant's persona or stage.
  - Reset a plant out of `SAFE_STOP`.
- The proof is verified in the agent service backend. Only after it passes does the service execute the action with the guardian role.
- Failed path shown live: an unverified or expired proof, and the action does not happen.
- Every guardian action is logged with the World nullifier for that action.

**Who the guardian is (my call, confirm with World):**
- One guardian per forest.
- World ID proves a unique human, not a specific person. So the guardian is bound once: their first proof, for the World action `forest-guardian`, stores that proof's nullifier hash as the forest's guardian.
- The same person proving the same action again produces the same nullifier. So every later guardian action asks for a fresh proof of `forest-guardian` and checks that the nullifier matches the stored one. Any other verified human is refused, and that refusal is the failed path.
- The proof's signal is the hash of the exact action ("withdraw 5 from banyan-01, nonce 7"), so a proof cannot be replayed for a different action.
- This needs the World action set to allow repeated verifications. That is open verification 6.

### 8.8 Simulated plants and replay

- Simulated plants run the same agent loop and make real 0G calls. Only their sensing is simulated: moisture falls over time, watering raises it, and a stage sets how fast they dry out.
- Every simulated plant is labelled as simulated in the app and in its decision records.
- Replay mode re-runs a recorded episode log, using the recorded inputs and the recorded 0G responses with their request IDs. Judges can replay it without hardware.
- Replay is always labelled as replay.

### 8.9 Forest app

- **Forest view:** every plant as a card or a node, showing ENS name, stage, health, balance, real or simulated, with a line between plants when one gives to another.
- **Plant page:** ENS records, persona, decisions with request IDs linked to their 0G Storage roots, orders and gifts with explorer links.
- **Forest talk:** a live feed of asks, gifts and thanks in each plant's voice.
- **Chat:** talk to one plant. It answers in its persona from its own data only.
- **Guardian panel:** World ID, then the protected actions.

### 8.10 Live demo link after the event

My call: the hosted app stays up reading the chain and ENS, with replay available.

Simulated plants keep running with real 0G calls only during the judging window, under a fixed budget of checkpoints per hour, so the testnet 0G we ask for covers:
- the build;
- the stage demo;
- about 48 hours of judging.

## 9. Left for later (not in this build)

- 0G iAI track: each plant pays for its own thinking with daily credits on 0G Private Computer, through Privy, with the demo on localhost:3000. If the team adds it, it goes into the agent service as a second decision provider.
- Per-plant keys held on the station, nutrients, multiple forests, mainnet.

## 10. Calls I made that the team should check

1. **Contract wallet per plant**, rather than a plain key, so the rules are code.
2. **Stages** (sapling, growing, mature) as an ENS text record set by the guardian.
3. **Where money comes from:** people send to plant names, and the guardian seeds the forest. No treasury or allowance.
4. **Share limit of 25% of surplus per 24 hours**, and a reserve per plant set by the guardian.
5. **Water is paid to a single forest supplier address** at a price per ml stored in the `Forest` contract.
6. **The plant refuses money requests in chat** and points to the guardian. That is the World ID failed-path moment.
7. **Stack:**
   - Python on the Pi (WS-STATION).
   - TypeScript with viem for the agent service.
   - The 0G TypeScript SDKs (which need ethers).
   - Foundry for contracts.
   - Next.js for the app.

## 11. Left to the builder

- Pin mapping, sensor calibration and pump flow rate (ml per second) on the Pi.
- The prompt wording for decisions, persona voice and chat, as long as outputs follow the decision schema.
- Polling versus websockets for chain events and the live feed.
- UI layout and styling, made during the event.

## 12. Open verifications (ask sponsors tonight)

| # | Question | Ask | If no |
|---|---|---|---|
| 1 | Can 0G give us enough testnet 0G for the Compute ledger (3 0G plus 1 per provider)? | 0G Discord | Nothing in the loop works; escalate first |
| 2 | Does any 0G Compute testnet provider take image input? | 0G | Send soil reading plus simple image features as text, and store the frame on 0G Storage as evidence |
| 3 | Are two real plants plus simulated plants with real 0G calls, plus replay, accepted as the Physical AI simulation? | 0G | Add a scripted sim scenario the judges can run from the repo |
| 4 | Is the 2026-09-15 Sepolia ENS v2 deployment the one to use, and is there working tooling to deploy a subregistry and one Permissioned Resolver per name? | ENS | Write the deploy scripts directly against contracts-v2 |
| 5 | Which record keys do ENSIP-25 and ENSIP-26 expect for agents? | ENS | Plain text records with a `forest.` prefix |
| 6 | Current World ID backend verify endpoint and IDKit version; staging or simulator for testing? | World | Use their documented v2 verify endpoint |
| 7 | Was any of the Pi prototype code written before 5 Nov? | Station builder | Rewrite it during the event, or enter Continuity |
