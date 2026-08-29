---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-evidence-record-shape-not-enforced-beyond-taskid-and-outcome
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs pipeline.dispatch-record-briefing-fields-enforced
source: "Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md §3.1), cited by scratch/greenfield-triage-2026-08-29.md finding F18, observed during the 2026-08-29 three-runner greenfield test."
---

# A dispatch-evidence record can be a bare `{id, outcome, timestamp}` and still pass authorship verification

## What happened

The shipped run's dispatch-evidence file was a bare object carrying only
`id`, `outcome`, and `timestamp` — no briefing content, no diff summary, no
model/effort fields. There is no way to confirm from that record that the
six-field briefing (EL-05: Goal, Context files, DoD checks, Prohibitions,
Stop conditions, Dispatch metadata) actually existed for that dispatch.

## Where it is

`plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs`, the record
validation performed inside `verifyCommitAuthorship`/its callees (around
lines 488-539): after `readRecord(taskId)` returns, the ONLY fields checked
are:

- `record.taskId` (line 495, only checked for a MISMATCH if present — not
  required to be present),
- `record.outcome` via `isTerminalOutcome(record.outcome)` (line 498).

Nothing else about the record's shape is validated — no check for `model`,
`effort`, `rulesetSha`, `report` (with `report.text`/`report.changedFiles`),
or `log` being present at all. A record containing only `{id, outcome,
timestamp}` (with `outcome` a terminal value) passes this verifier exactly
as well as a fully-populated one, because the verifier's job today is
narrowly "does this commit's trailer bind to A record with a terminal
outcome," not "does this record actually evidence a real six-field
briefing having been dispatched and executed."

## Proposal

Extend `dispatch-authorship-verify.mjs` (or a sibling checker it can call)
to also validate that a bound record carries the minimum shape a genuine
dispatch record should have per this repository's own templates
(`templates/prompts/goldfish-task.md` / `critic-review.md`): at minimum
`model`, `rulesetSha`, and a non-empty `report` field. A record missing
these should be reported `UNVERIFIABLE` (mirroring the existing verdict this
tool already uses for other gaps) rather than silently passing on `taskId`+
`outcome` alone. Add a marker
`pipeline.dispatch-record-briefing-fields-enforced` at the point this
validation is added.

## Acceptance

- A record shaped `{id, outcome, timestamp}` (or missing `model`/`report`)
  is reported `UNVERIFIABLE` by `dispatch-authorship-verify.mjs`, not `pass`.
- A fully-shaped record (matching this repository's own dispatch-record
  template fields) continues to pass exactly as before — no regression for
  well-formed dispatches.
- A test in `dispatch-authorship-verify.test.mjs` exercises both cases.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Confirmed directly in `dispatch-authorship-verify.mjs`'s own
  validation logic — the gap is real and specific, not inferred from the
  runner's report alone.
- **Assignment:** `sprint: nova`, Nova B — hardens an existing verification
  tool; does not block the 0.6.0 candidate.
- **Date:** 2026-08-29
