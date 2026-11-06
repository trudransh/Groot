# 02. WS-AGENT: plant agents and the agent service

## Problem Statement

A plant has no way to decide what it needs, pay for it, or help another plant. Something has to think for each plant, in its own voice, every few seconds, with every decision traceable to a real 0G inference, and it must never move money the forest rules forbid.

## Solution

One service runs one plant agent per plant, real or simulated. At each checkpoint an agent:
1. gathers its plant's reading, stage, persona, wallet balance and the forest's open help requests;
2. asks 0G Compute for one decision;
3. applies the hard rules;
4. stores the decision record on 0G Storage;
5. signs the matching call on the plant's wallet.

The service also gives each plant its voice in forest talk and chat, and serves the app's API and live event stream.

## User Stories

1. As a plant, I want my agent to check on me at a fixed rhythm, so that I am never forgotten.
2. As a plant, I want my agent to decide from my moisture, my camera frame, my stage and my money, so that the decision fits me.
3. As a plant, I want every decision to come from a real 0G Compute call with its request ID kept, so that nobody can say my choices were faked.
4. As a plant, I want every decision stored on 0G Storage before anything happens, so that what I did can always be checked afterwards.
5. As a plant, I want my agent to buy water from my own wallet when I need it and can afford it, so that I take care of myself.
6. As a sapling, I want my agent to ask the forest for help when I cannot afford water, so that I am not left to dry out.
7. As a mature plant, I want my agent to see open help requests and decide, in my persona, whether to give and how much, so that strong plants support young ones.
8. As a plant, I want my agent to stop a gift that would break the forest rules before sending it, so that I do not waste gas on a revert.
9. As a plant, I want the hard rules to make decisions only safer, never riskier, so that a confident but wrong answer cannot hurt me.
10. As a plant, I want to wait and show `SAFE_STOP` when 0G does not answer in 8 seconds, so that silence never becomes action.
11. As a plant, I want a line in my own voice when I ask, give, thank or drink, so that the forest feels alive.
12. As a person, I want to chat with a plant and get answers in its persona from its own data, so that I can get to know it.
13. As a plant, I want to refuse any chat request to send money, change rules or change my persona, and say only my guardian can, so that strangers cannot talk me out of my wallet.
14. As the app, I want `GET /forest`, decisions, talk and a live event stream, so that the screen updates as plants act.
15. As the team on stage, I want a button that triggers a checkpoint now for one plant, so that the demo does not wait for the timer.
16. As a judge, I want every decision summary to carry its request ID, storage root and transaction hash, so that I can open each one.
17. As the team, I want each plant's ENS `forest.status` and `forest.decision` records updated when they change (at most every 5 minutes), so that ENS shows the live forest without burning Sepolia gas.
18. As the team, I want plant names, wallets and records read from ENS at start-up, so that nothing is hard-coded.
19. As the team, I want the service to keep running when one plant's checkpoint fails, so that one error does not stop the forest.

## Implementation Decisions

- **Stack:** TypeScript on Node 22, viem for the 0G chain and Sepolia, `@0gfoundation/0g-compute-ts-sdk` and `@0gfoundation/0g-storage-ts-sdk` (both need ethers), a small HTTP server with server-sent events.
- **Modules, each with one interface:**
  - `Decider`: context in, `Decision` plus 0G metadata out. Its 0G implementation:
    - uses `createZGComputeNetworkBroker`, `getServiceMetadata` and `getRequestHeaders`;
    - reads the request ID from `ZG-Res-Key` or `data.id`;
    - verifies the answer with `processResponse` when possible.
  - `RecordStore`: uploads a `DecisionRecord` (and frames) to 0G Storage, returns the root hash.
  - `Rules`: a pure function, `(context, decision) -> { finalDecision, rulesApplied }`, with exactly the rules listed in `00-interfaces.md` section 4.
  - `PlantWalletClient`: the wallet calls and their events.
  - `Names`: ENS reads and the agent's own text-record writes.
  - `Voice`: a 0G call for one line in a plant's persona for a talk event, and for chat replies.
  - `Scheduler`: runs checkpoints per plant every `CHECKPOINT_SECONDS` (default 30), never two at once for the same plant.
- **Order of a checkpoint is fixed:** context, decide, rules, store record, act onchain, update ENS (if due), emit events. No onchain action happens without a stored record root.
- **Keys:** one agent key per plant, derived from a single mnemonic in `.env` by index. The plant agent key is the `agent` on that plant's wallet.
- **Model choice:** at start-up the service picks a 0G chat provider from `listService()`.
  - If a provider takes image input (open verification 2), the frame goes into the prompt.
  - Otherwise the prompt gets moisture plus simple frame features (mean greenness, leaf droop estimate) computed locally, and the frame is stored by root as evidence.
- **Chat safety:** before calling 0G, chat messages pass through a classifier prompt that labels intent. Any request to move money, change rules or persona returns `refused: true` with the plant's own refusal line.
- **0G budget:**
  - The Compute ledger needs 3 0G minimum, plus 1 0G per provider.
  - Every Storage upload costs a fee.
  - The service logs 0G spend per checkpoint, so the team can see the burn rate.

## Testing Decisions

- A good test calls a module through its interface with the others faked and asserts on what comes out (a decision, a record, a call made), never on internal state.
- What gets tested:
  - `Rules`: table tests for every rule in `00-interfaces.md`.
  - The checkpoint pipeline, with fake `Decider`, `RecordStore` and `PlantWalletClient`:
    - The order of steps is followed.
    - No onchain call happens when the record upload fails.
    - A 0G timeout becomes `wait` and `SAFE_STOP`.
  - Chat refusal cases.
  - The API shapes.
- One live smoke test against the real 0G testnet: one decision, one record, root printed. This is the G1 gate.

## Out of Scope

- 0G iAI (daily credits on Private Computer). The `Decider` interface leaves room for a second implementation if the team adds it.
- Keys on the station. Multiple forests.

## Further Notes

- The prompt text is the builder's call. The output shape is not: it is the `Decision` JSON or it becomes `wait`.
