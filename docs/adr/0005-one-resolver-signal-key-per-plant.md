# One forest resolver, one signal key per plant

Supersedes ADR 0002.

ENS v2's Permissioned Resolver scopes roles by text key, never by name: a role on a key covers that key on every name the resolver serves. ADR 0002 answered this with one resolver per plant. We now serve the whole forest from one resolver and give each plant its own key instead: the distress signal of plant `<label>` is the text record `signal.<label>` on the forest name `vantaraa.eth`, value `1` (thirsty) or `0` (ok). The guardian grants each plant agent `ROLE_SET_TEXT` on its own `signal.<label>` key only, with `grantSetterRoles`.

Readers look up one name: `forest.plants` gives the labels, then one `signal.<label>` per plant. No indexer is needed, and a live view can watch the resolver's `TextUpdated` events. A plant agent cannot write another plant's signal (`EACUnauthorizedAccountRoles`), and writes it might make on other names under its key are ignored, because readers only read the forest name.

## Considered options

- One resolver per plant (ADR 0002): isolates names, but costs a factory deploy per plant and makes the app read every plant's resolver to see who is thirsty.
- A custom contract that relays agent writes: adds a contract the ENS prize does not need and hides the Enhanced Access Control we want to show.
- One resolver, one key per plant (chosen): one deploy, one place to read every signal, and the access rule is ENS's own.

## Consequences

- Each plant agent pays its own Sepolia gas for signal writes; `pnpm deploy-forest` tops agents up from the guardian.
- A role holder on a key has it on every name the resolver serves, so plant records the agent must not touch (address, persona, stage) are written by the guardian, whose roles cover everything.
- At most 15 holders per role per key. One holder per signal key, so this is not a limit.
