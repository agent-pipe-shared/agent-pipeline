---
schema: pipeline.backlog-item.v1
id: pipeline.a-budget-checkpoint-is-resumed-with-a-grant-not-redispatched
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-29
priority: P1
release: 0.7.0
sprint: alfred
source: "PO direction 2026-10-29 (chat): Goldfish keep failing at the budget limit, splitting into small successor dispatches costs more than it saves, and 'everyone will do it wrong' unless the standard procedure is enforced; Elephant analysis the same day"
done_when: manual
---

# A budget checkpoint is resumed with a grant, not re-dispatched as a successor

## Evidence

One outcome (the PO acceptance of residual Critic findings, held patch `w7-d190-accept-residual-critic-findings`) was worked as seven successor Goldfish dispatches (C8 to C14, each with its own dispatch id and a fresh briefing). Four of them ended at the 40-call budget having only read code, because every fresh Goldfish re-read the same large files (`pipeline-state.mjs` is about 14,000 lines) before it could write. The remaining slices were made smaller and given a fixed call plan, which worked, but only after roughly a day of wall-clock and an equal amount of Elephant time spent writing briefings.

The canon already forbids this. `roles/elephant.md` EL-25a: "An exhausted budget blocks or checkpoints that same outcome; it does not create a successor identity that resets limits." EL-13b: resume the same owner procedurally; "A new owner or item ID used solely for budget recovery is a lifecycle violation." The Elephant (this session) did it anyway and nothing refused it: the `Check` of both rules is a ledger inspection, not a mechanical gate. A rule that only the dispatching session can break and only the dispatching session checks will be broken by every session.

## What exists today

- A per-agent working cap (briefed base 40, working cap `maxTurns - 15`), counted by `hooks/guard-dispatch-budget.mjs`, with an 80 percent checkpoint notice and a small closing allowance. `maxTurns: 76` in the agent definition is the runtime stop.
- An orchestrator-only budget grant store (`dispatch-budget-grant.mjs`): the Elephant may add up to 30 calls to one running or checkpointed agent (ceiling 70 in total, PO decision 2026-10-27). A dispatched agent touching the store is refused.
- A checkpoint return (`outcome: checkpoint`) that "keeps the reservation live so the work can be resumed", and a resumable agent (`SendMessage` to the agent id) that keeps its whole context.

What is missing is the glue: nothing tells the Elephant to use them, and nothing stops the successor route.

## Standard procedure (to become canon; EL-25a and EL-13b already say the principle)

1. Brief the whole independently verifiable outcome once. If the honest estimate exceeds the base cap, request the grant in the briefing package, not after the failure.
2. A checkpoint is not a failure and not a new task: read the report, check the actual diff and evidence, then grant extra calls (up to the single-grant ceiling) and resume the SAME agent with a procedural message (`SendMessage` to its id). The resumed agent keeps its context; nothing is re-read.
3. A successor dispatch (new id) is allowed only for a genuinely new vertical outcome with its own criteria, never as budget recovery, and the briefing states which checkpointed outcome it does not continue.
4. Never commit a checkpoint under the original dispatch's trailer to "release" the reservation and then start a fresh dispatch for the same outcome; that is the successor route with an extra step.
5. A package that asks for more than the cap and for no grant is a dispatch-time warning, not a silent budget failure later.

## Enforcement ladder (smallest first; each rung is its own slice, PO applies kernel files under a Guard Maintenance Window)

- **R1, generator** (`scripts/dispatch-briefing.mjs build`): refuse or warn when a package targets an item and write scope that has a checkpointed, resumable owner (prior dispatch record or live reservation with outcome checkpoint), and print the grant-and-resume commands instead of a fresh `dispatchCall`. A typed `--successor-reason` is the way past it, and the Elephant can always use it (see "No deadlock" below).
- **R2, guard** (`hooks/guard-dispatch.mjs`): a fresh Agent dispatch whose slice is bound to an item that still has a checkpointed owner is refused with a typed code that names the owner and the resume command, unless the briefing carries a typed successor reason. The refusal is a nudge toward the cheap move, never a wall.
- **R3, checkpoint notice** (`hooks/guard-dispatch-budget.mjs`, `lib/dispatch-budget-notice.mjs`): the notice that already fires at the checkpoint also prints, for the orchestrator, the exact grant command and the resume instruction, so the right move is the cheap move.
- **R4, estimate lint** (generator): `estimatedToolCalls` above the base cap without a requested grant produces a warning; an estimate above the single-grant ceiling asks for a real split with independent criteria.
- **R5, canon**: add the five steps above to `roles/elephant.md` (as part of EL-25a / EL-13b, not a new rule) and to `references/workflow-dispatch.md`, with the lived example above as the `Why`.

## No deadlock (PO requirement 2026-10-29)

Every rung above must leave the Elephant a deliberate way to reach the outcome, however much budget it needs:

1. **Repeatable grants.** The Elephant can raise an owner's budget again and again, each time by up to 30 calls, each grant a deliberate act with a recorded reason. The single-grant ceiling of 70 (PO decision 2026-10-27) is a per-grant step and a cost signal, not a lifetime wall for the outcome. Open point to VERIFY before building: `maxTurns: 76` is the runtime stop of one agent run. Whether a resumed agent starts a fresh turn count (so repeated grants can really exceed 76 calls in total) must be measured on the live runtime; if it does not, grants alone can never exceed one run and the next point is the only route.
2. **Elephant-decided restart.** On request the Elephant can always restart the outcome with a fresh owner: a typed successor reason `elephant-restart` (alongside `new-vertical-outcome`, `owner-lost`, `context-poisoned`) is accepted by R1 and R2 without any further approval. The restart carries a handover (the recorded notes and the evidence pointer of the prior owner) so it does not start from zero; the prior attempt history stays linked, and the restart is visible in the dispatch ledger as a restart, not hidden as a new outcome.
3. **No enforcement may refuse both.** A change that would make "grant refused (ceiling reached)" and "successor refused (checkpointed owner exists)" true at once is a defect: the test suite for R1 and R2 includes the case "ceiling reached, restart requested, accepted".

## Open for the PO

Whether the base cap itself should rise (for example 40 to 70 for every implementor dispatch) instead of relying on grants. That is a cost-policy decision; the procedure above works under either answer.
