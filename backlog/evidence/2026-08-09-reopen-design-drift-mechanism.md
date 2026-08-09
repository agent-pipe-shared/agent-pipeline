# Closure evidence — what actually throws when a reopened design is edited

Item: `backlog/items/2026-08-09-reopen-design-invites-the-edit-that-ends-the-session.md`
Date: 2026-08-09

## The item's diagnosis, and where it was off

The item named `continuity.authority` — the digests the state carries from
submission time — as what stops matching when the agent edits `spec.md`. That is
true, and it is not the first throw. Tracing the observation before changing
anything is what kept the fix small.

`observeDetailed` in `plugins/pipeline-core/lib/onboarding-continuity.mjs` walks
the **private promotion history** before it ever parses the state's continuity
block. Each promotion transaction records `planPath`/`prdSha256` and
`specPath`/`specSha256` as they were at promotion, and the loop re-observes both
documents against those digests:

```
if (bound.status !== "present" || bound.sha256 !== expected) {
  fail("KICKOFF-PROMOTION-AUTHORITY-DRIFT", `${label} does not match its mutual digest binding`);
}
```

`fail()` throws a `KickoffError`. The `catch` at the end of `observeDetailed`
discards `error.code` and returns `continuity: { status: "unavailable", … }`.
`planProjectOnboardingLifecycleV4` then reaches its catch-all — everything that is
not `valid`, `damaged` or `absent-pristine` — and returns
`status: "continuity-observation-unavailable"` with `nextAction: null` and the
guidance "repair continuity read access before retrying", a cause it never
established.

So the observed live output the item recorded is reproduced exactly, and the
sanctioned edit is terminal three layers before the authority digests are
consulted.

## The decision

`reopen-design` releases the binding (the item's direction 2, first alternative).
The promotion record is a transaction, not a live authority. The live binding for
an edited package is `continuity.authority` plus `planApproval.poGateAuthority`,
both re-established by `submit-plan`/`approve-plan` and both checked elsewhere.
Enforcing a promotion's digests for the rest of a feature's life conflates history
with authority, and that conflation is what made the edit terminal.

The mutual binding and the design-input binding beside it now stand down when the
state carries `planInvalidation` — the durable record `reopen-design` writes when
the lifecycle releases the documents. The marker is read narrowly and fails
closed: unreadable or unparseable answers "no", and the binding enforces exactly
as before. `validPlanInvalidation` in `plan-spec-state-v2.mjs` remains the only
validator of that record; this is a read of a marker, never a second source of
truth.

## Why this does not weaken the assurance

`planInvalidation` is only written by `reopenPlanDesign`. A state that never
reopened its design cannot carry it, so every such state keeps the check. The two
pre-existing tests — "editing the promoted PRD invalidates the mutual digest
binding" and "editing the promoted Spec invalidates the mutual digest binding" —
pass untouched, and REOPEN-1 in `onboarding-continuity.test.mjs` closes the loop
from the other side: it edits both documents with the marker present (not
unavailable), then removes the marker and asserts the same edited bytes are
invalid again. The marker is what separates the two cases, not the edit.

## Result

126/126 onboarding-continuity checks pass, including REOPEN-1.
