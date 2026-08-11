---
schema: pipeline.backlog-item.v1
id: pipeline.unregistered-suite-is-red-and-invisible-to-verify
type: defect
owner: pipeline
status: open
created: 2026-08-07
due: 2026-08-21
source: "Found incidentally during the 0.5.3 candidate work, 2026-08-07, while looking for something else. Re-confirmed by running the suite directly on candidate d4887b7."
---

# A test suite has been red for an unknown length of time and Verify cannot see it

## Description

`plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs`
fails, and `harness/scripts/verify.mjs` does not register it. Verify therefore
reports 255/255 green on a candidate that carries a red suite. The gate is not
wrong about what it ran; it is wrong about what it covers, which is worse,
because a green gate is exactly the artifact that stops anyone from looking.

Measured directly on candidate `d4887b7`:

```
node plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs
```

exits 1 after two passing cases, on a pinned digest for
`harness/review-protocol.md`:

- expected `624852e54024328c41cecb7f3f6decb331d10708398cd069826693762b79ebf5`
- actual   `184a5140552476a96b394db7334db69df977663e9b07793e6c4d8522e4b95c57`

A grep for the suite's name in `verify.mjs` returns nothing.

## Two separate defects, deliberately not merged

**1. The pin is stale.** `harness/review-protocol.md` was edited and this
suite's expected digest was not updated with it. On its own that is routine —
a preimage pin exists precisely so an unreviewed edit to a protected document
is noticed. Whoever fixes it must confirm the current bytes are the *intended*
bytes rather than reflexively re-pinning the digest; a pin updated without
reading what changed converts a real check into a rubber stamp, and this
suite's whole purpose is the Codex Critic isolation contract.

**2. The suite is unregistered, which is the finding that matters.** The stale
pin would have been caught the day it appeared if the suite ran in the gate. It
was not, so the pin has been wrong for an unknown period and nothing reported
it. This is a coverage hole in the registration mechanism, not in the suite: a
suite file that exists, is runnable, and is not in `verify.mjs` is invisible,
and nothing today makes that state noisy.

There is an existing item on scoped Verify registration
(`2026-07-19-verify-gate-scoped-registration.md`) and one on gates never being
tested end to end for satisfiability
(`2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md`). This is a
third, narrower instance of the same family and should be designed with them
rather than separately.

## Triggering situation

Noticed while reading the plugin's script directory for an unrelated reason
during the 0.5.3 candidate work on 2026-08-07. Not surfaced by any gate, any
review, or any dispatch — which is the point.

## Affected artifact

- `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs`
  (red on a stale pin)
- `harness/scripts/verify.mjs` (does not register it)
- `harness/review-protocol.md` (the protected document whose bytes moved)

## Proposal

Not designed here. Candidates, in the order they should be considered:

1. **Make unregistered suites detectable.** A check that enumerates
   `**/*.test.mjs` under the plugin and harness trees and fails when a file is
   not present in the registration list — with an explicit, named opt-out list
   for suites deliberately excluded, so exclusion is a decision on the record
   rather than an omission. This is the fix that generalizes; everything else
   below is the individual instance.
2. Fix the stale pin, after reading what actually changed in
   `harness/review-protocol.md` and confirming the current bytes are intended.
3. Register the suite in `verify.mjs` (this touches `TP-3`, so it needs a
   maintenance window or a briefed test-change task).
4. Once 1 lands, sweep for other unregistered suites in the same pass and
   record how many there were — the count is the real measure of how wide this
   hole is, and nobody knows it today.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted, both candidates 1 and 3 — build the generalized
  unregistered-suite detector AND actually register
  `codex-isolated-critic-protected-preimage.test.mjs` in `verify.mjs`. Paired
  with `2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md`
  (same decision, same rationale, cluster A).
- **Rationale:** PO, 2026-08-11: "1 und 3" — more than the Elephant's own
  narrower recommendation (detector only, registration deferred). Urgency
  confirmed by a live third recurrence this same session: `NVA-BL-42`'s
  Critic review found this exact suite's pin (for `critic.md`, not
  `review-protocol.md` this time) stale and unregistered again, independently
  of this item.
- **Assignment (if accepted):** Candidate 1 (detector: enumerate
  `**/*.test.mjs`, fail on any file absent from `verify.mjs`'s registration
  list with an explicit named opt-out) is a bounded, dispatchable task.
  Candidate 3 (the actual registration) touches `harness/scripts/verify.mjs`
  (TP-3) and needs a signature/maintenance-window ceremony — sequence the
  detector first (it doesn't touch TP-3), then the registration once a window
  is available. Candidate 2 (fix the stale pin, confirming the current bytes
  are intended before re-pinning) is a prerequisite step inside candidate 3's
  work, not a separate dispatch. Neither started this session.
- **Date:** 2026-08-11
