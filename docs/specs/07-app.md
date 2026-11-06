# 07. WS-APP: the forest app

## Problem Statement

The plants live in contracts, ENS records and 0G Storage, and none of that is something a person on stage, a judge or a donor can see. The forest has to be visible and alive: who is thirsty, who is giving to whom, what each plant said, and the proof behind each decision.

## Solution

One web app that starts from the forest's ENS name, with five views:
- **Forest view:** every plant and its state, with gifts drawn between plants.
- **Plant page:** identity, decisions and proofs.
- **Forest talk:** a live feed of plants talking to each other.
- **Chat:** talk to one plant.
- **Guardian panel:** World ID, then the protected actions.

The app updates live from the agent service's event stream, and reads names and balances directly from ENS and the chain where it can.

## User Stories

1. As a visitor, I want to see the whole forest at a glance (every plant's name, stage, health, balance, and whether it is real or simulated), so that I understand it in seconds.
2. As a visitor, I want to see a line drawn from one plant to another when a gift happens, so that sharing is visible.
3. As a visitor, I want to see a plant go thirsty, ask, receive and drink, live, so that the forest feels alive.
4. As a visitor, I want forest talk as a live feed in each plant's voice, so that I hear the plants talking.
5. As a visitor, I want to open a plant and see its ENS records, persona, decisions with request IDs, record roots and transactions, each linked to its explorer, so that I can check everything.
6. As a visitor, I want to chat with a plant, so that I can get to know it.
7. As a visitor, I want to send money to a plant by its name, so that I can help it.
8. As the guardian, I want a panel where each protected action asks for a fresh World ID proof, so that only I can change the forest.
9. As a judge, I want the failed guardian path to show a clear refusal, so that the protection is visible.
10. As the team on stage, I want a "check now" button on each plant, so that the demo does not wait for the timer.
11. As a judge, I want clear labels for SIMULATED, REPLAY and SAFE_STOP wherever they apply, so that nothing pretends to be live hardware.
12. As a judge, I want the app to resolve everything from the forest name with no hard-coded addresses, so that the ENS must-show holds.
13. As the team, I want the app to work on a projector at 1080p and on a phone, so that it reads on stage and in the judges' hands.

## Implementation Decisions

- Next.js with TypeScript and viem; a public component library (for example shadcn/ui) disclosed in the README.
- The app's only configuration:
  - the forest ENS name;
  - the Sepolia and 0G RPC URLs;
  - the agent service URL;
  - the World app ID.
- **Live updates:** one server-sent events connection to `GET /events`. Initial state comes from `GET /forest`.
- **Names and addresses:** resolved from ENS in the browser, as described in spec 05. The app shows them even if the agent service is down.
- **Send money to a plant:** a wallet connect, then a plain transfer on the 0G chain to the resolved wallet address.
- **Labels:** SIMULATED, REPLAY and SAFE_STOP each have one fixed visual treatment, used everywhere.
- **Design work:** made during the event (From Scratch). This spec fixes flow, state and content, not appearance.

## Testing Decisions

- A good test renders a view against a faked agent API and event stream, and asserts on what a person sees: labels, numbers, links.
- What gets tested:
  - Forest view, plant page, the talk feed appending events.
  - The guardian panel's success and refusal states.
- One end-to-end click-through against the live service before G3.

## Out of Scope

- Accounts and sign-up, notifications, mobile app, analytics.

## Further Notes

- 0G iAI would need the demo on localhost:3000, 3001 or 5173 with Privy. Running the app on port 3000 costs nothing and keeps that door open.
