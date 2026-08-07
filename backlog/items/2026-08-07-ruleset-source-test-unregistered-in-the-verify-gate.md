---
schema: pipeline.backlog-item.v1
id: pipeline.ruleset-source-test-unregistered-in-the-verify-gate
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: Measured by the PHX-R1-REWORK-1 dispatch while correcting R1's protection boundary, and re-verified independently by the Elephant. Third occurrence of the same defect class in this feature area.
---

# `ruleset-source.test.mjs` exists but is not registered in the verify gate

## Description

`plugins/pipeline-core/lib/ruleset-source.test.mjs` is a tracked test file with
no entry in `harness/scripts/verify.mjs`. Verified independently: `rg -c
"ruleset-source.test.mjs" harness/scripts/verify.mjs` returns no match.

Suite registration in this repository is a hand-maintained static array —
`TEST_SUITES` plus the equally static `SCOPED_VERIFY_SUITES` and
`WINDOWS_ASSURANCE_VERIFY_SUITES`. There is no globbing and no auto-discovery,
which `harness/scripts/verify.mjs:314-316` states in its own words:

> Registered in the same commit that created them. An unregistered suite is not
> a test Verify forgot to run — it is a test that protects nothing, and the gap
> is invisible precisely because the file exists and passes when run by hand.

That is exactly the present state for this file.

## Why this one matters beyond the general rule

`normalizeRulesetSource` from that module decides one of the two disjuncts of
the bootstrap readiness gate's attestation
(`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:282-292`:
`attestationFailed = !originAllowlisted || normalized?.status !== "ready"`). So
the unrun suite is not incidental coverage — it pins an input to a
security-relevant gate decision.

This is the **third** occurrence of the same defect class in this feature area,
which is why it is recorded as a pattern rather than only as an instance:

1. `public-core-origin-allowlist.test.mjs` was created unregistered — found as
   Critic finding F3 on the WP2-WP3 Part A implementation review.
2. Six further suites across three work packages were found unregistered while
   assembling that fix (closed by commit `550b21f`).
3. This one, still open.

The common cause is structural, not carelessness: `harness/scripts/verify.mjs`
is TP-3-protected, so the registration line cannot be added in the same dispatch
that writes the test. Every author therefore has to hand the edit off, and a
hand-off is exactly what gets dropped.

## Triggering situation

Found 2026-08-07 by the dispatch reworking residual R1's protection boundary,
while establishing which modules the extracted attestation gate depends on.
Re-verified by the Elephant against `harness/scripts/verify.mjs` before
recording.

## Affected artifact

`harness/scripts/verify.mjs` (the missing registration; TP-3-protected) and
`plugins/pipeline-core/lib/ruleset-source.test.mjs` (the unrun suite). Context
for why it matters: `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:282-292`.

## Proposal

**Owner: PO.** Two parts, and the second is the one that stops the recurrence.

1. **The instance.** Add the registration line for
   `plugins/pipeline-core/lib/ruleset-source.test.mjs`, following the shape of
   its siblings. Because `harness/scripts/verify.mjs` is TP-3-protected this
   needs its own briefed test-change task or a PO edit outside an agent session
   — it cannot ride along in an unrelated dispatch. Note the newly available
   signed-override route may make this cheaper than it was; that is worth
   checking before scheduling the hand-off.
2. **The class.** Three occurrences with one structural cause is a design
   signal. Options, disclosed rather than pre-selected: (a) a check that fails
   when a `*.test.mjs` file under the registered roots has no registration entry
   — mechanical, closes the class, and is itself a verify step so it needs the
   same protected edit exactly once; (b) make registration part of the
   protected-path hand-off checklist so it is never implicit; (c) accept the
   recurrence and rely on review, which has caught it three times but only
   after the fact. Option (a) is the only one that makes the gap visible without
   a reviewer.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
