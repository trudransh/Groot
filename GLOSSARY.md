# Plant forest

A forest of autonomous plant agents that share money instead of competing for resources. Each plant decides for itself through 0G, pays for its own water, and gives to the young plants around it.

## The forest

**Forest**:
The community of plants under one ENS name, sharing one set of rules, one water supplier and one guardian.
_Avoid_: garden, ecosystem, network

**Plant**:
One member of the forest, real or simulated, with its own name, wallet, persona and stage.
_Avoid_: node, tree (unless the species is a tree), bot

**Real plant**:
A plant in a pot on the table, sensed by the plant station and watered by its pump.

**Simulated plant**:
A plant whose sensing is computed instead of measured. It runs the same agent loop and makes real 0G calls, and is always labelled as simulated.
_Avoid_: fake plant, mock plant, virtual plant

**Stage**:
How grown a plant is: sapling, growing or mature. It sets how fast the plant dries out and whether it usually asks or gives.

**Persona**:
A plant's personality and voice, stored as an ENS text record. It shapes how the plant talks and how readily it gives. It never overrides the forest rules.

**Guardian**:
The one verified human bound to a forest, the only person who can change its rules, move money outside them, or reset a plant from safe stop.
_Avoid_: admin, owner, operator

## Deciding

**Plant agent**:
The software that thinks and acts for one plant: it gathers the plant's context, asks 0G for a decision, and signs the plant's transactions.
_Avoid_: bot, AI, assistant

**Checkpoint**:
One turn of a plant's loop: sense, decide, record, act.
_Avoid_: tick, cycle, heartbeat

**Decision**:
The single action 0G chose for a plant at a checkpoint: water, wait, ask for help, or give, with an amount, a reason and a confidence.

**Request ID**:
The identifier 0G Compute returns for the inference behind a decision.

**Decision record**:
The JSON document stored on 0G Storage for every decision. It holds the inputs, the 0G response, the rules applied and the final action, and is identified by its root hash.
_Avoid_: log entry, episode (except when talking to 0G, whose track calls the collection an episode log)

**Episode log**:
The ordered set of decision records for a run. It is what replay reads.

**Safe stop**:
The state a real plant enters when 0G does not answer, the answer is invalid, or the payment does not confirm. The pump stays off until the next good checkpoint or a guardian reset.

**Replay**:
Re-running an episode log from its recorded inputs and recorded 0G responses, without hardware. Always labelled as replay.

## Money

**Plant wallet**:
The smart contract that holds one plant's money and enforces the forest rules on everything the plant agent tries to do with it. Its address is what the plant's ENS name resolves to.
_Avoid_: account, balance, budget

**Reserve**:
The amount a plant wallet always keeps and can never give away.

**Surplus**:
A plant wallet's balance above its reserve.

**Share limit**:
The most of its surplus a plant may give away in any 24 hours.

**Help request**:
A sapling's open ask to the forest for an amount of money, recorded in the forest contract until it is filled.
_Avoid_: loan, request for funds

**Gift**:
Money a plant sends to another plant against an open help request, within the forest rules.
_Avoid_: donation, transfer, loan

**Water order**:
A plant's payment to the forest's supplier for a number of millilitres. It is the only thing that starts the pump.

**Supplier**:
The single address that sells water to the forest at the forest's price per millilitre.

## Talking

**Forest talk**:
The live feed of what plants say to each other when they ask, give and thank, each line in the speaker's persona.
_Avoid_: chat log, messages

**Chat**:
A conversation between a person and one plant. The plant answers in its persona from its own data and refuses any request to move money or change rules.
