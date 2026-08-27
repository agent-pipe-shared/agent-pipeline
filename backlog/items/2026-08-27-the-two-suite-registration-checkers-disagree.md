---
schema: pipeline.backlog-item.v1
id: pipeline.the-two-suite-registration-checkers-disagree
type: defect
owner: pipeline
status: closed
created: 2026-08-27
closed_at: "2026-08-27"
closure_repository: "self"
closure_commit: "d38f65df9457f6c6ca32c87c2a7c2fb9b15d9d2f"
closure_evidence: "plugins/pipeline-core/scripts/check-suite-registration.mjs"
source: "Observed 2026-08-27 while re-verifying an inherited nine-suite registration claim: the two checkers return 9 and 0 on the same tree"
---

## Closed — 2026-08-27

The item's own preferred proposal (option 1) was taken — the checker was
taught the folded-in scoped arrays instead of being deleted. Both checkers
now agree on the same tree: `check-suite-registration.mjs` reports
`OK: 451 suite file(s) enumerated against 478 TEST_SUITES/SCOPED_VERIFY_SUITES/WINDOWS_ASSURANCE_VERIFY_SUITES entries; all registered or opted out with a reason.`,
and `verify-suite-registration-check` reported 0 in the full Verify run. The
six false positives are gone.

# Two suite-registration checkers disagree, and the unwired one reports six false positives

## Description

This repository has two registration checkers, and on the same clean tree they
disagree completely:

- `harness/scripts/check-verify-suite-registration.mjs` — wired into Verify as
  `verify-suite-registration-check`. Reports 469 registered, 3 declared exclusions,
  **0 unregistered**.
- `plugins/pipeline-core/scripts/check-suite-registration.mjs` — not wired into
  Verify. Reports **9 unregistered**, exit 1.

Six of those nine are false positives. They are registered, and they demonstrably run
in Verify — `scoped-verify-registration-tests`, `workflow-preflight-tests`,
`interaction-continuity-tests`, `trusted-tool-resolution-tests`,
`advisory-receipt-assurance-tests` and `toolchain-preflight-tests` all appear with
exit 0 in the run summary. They live in a separate scoped registration block in
`verify.mjs` rather than in the main `TEST_SUITES` array, and
`check-suite-registration.mjs` only looks at the latter.

The remaining three are genuine and are tracked separately.

## Triggering situation

An inherited session claim that "nine suites never run in Verify" was re-verified on
2026-08-27 rather than acted on. The re-verification produced two wrong answers in
succession before the right one: first the wired checker was run and reported zero,
which made the inherited claim look stale; then the unwired checker reproduced the
nine. Only reading `verify.mjs` directly settled it at three.

The cost is not hypothetical. A checker that cries wolf six times out of nine is a
checker whose output gets discounted, and the three real gaps in its list include the
ADR consistency checker whose absence let six ADR number collisions land unnoticed.

## Affected artifact

- `plugins/pipeline-core/scripts/check-suite-registration.mjs` — the false positives
- `harness/scripts/check-verify-suite-registration.mjs` — the wired checker
- `harness/scripts/verify.mjs` — carries two registration surfaces: the main
  `TEST_SUITES` array and the scoped block

## Proposal

Decide which checker is authoritative and make the other agree with it or disappear.
Three shapes, in descending preference:

1. **Teach `check-suite-registration.mjs` about the scoped block.** Smallest change,
   removes the false positives, keeps a second opinion.
2. **Delete it and keep only the wired checker.** Honest if the wired one genuinely
   subsumes it — but that has to be established, not assumed; the wired checker's
   "0 unregistered" answer did not surface the three real gaps either, which is itself
   worth understanding before deleting anything.
3. **Wire it into Verify as well**, after fixing the false positives, so the two
   cannot silently drift apart again.

Whichever is chosen, the underlying condition to remove is that `verify.mjs` has two
registration surfaces and only one of them is common knowledge.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
