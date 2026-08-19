---
schema: pipeline.backlog-item.v1
id: pipeline.two-guard-hook-test-files-unregistered-in-verify
type: defect
owner: pipeline
status: closed
created: 2026-08-19
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "14bebfe6e510bcc336dc1da2c0c1d3fd118f3743"
closure_evidence: "harness/scripts/verify.mjs"
source: "Found while gathering full harness/scripts/verify.mjs evidence for the HGO Part C Critic round-2 delta re-review (dispatch PHX-WP-HGO-FAILCLOSED-IMPL-C), 2026-08-19."
---

## Closed — 2026-08-19

Both suites registered in `verify.mjs`'s `TEST_SUITES`
(`14bebfe6`), unblocked by a PO-signed TP-3 maintenance window (a prior
dispatch attempt hit an expired window; re-dispatched after the PO
completed the signature ceremony). `verify-suite-registration-check`:
0 unregistered.

# Two guard-hook *.test.mjs suites exist under a registered root with no verify.mjs entry

## Description

`harness/scripts/check-verify-suite-registration.mjs` (the `verify-suite-registration-check`
step) fails against current HEAD:

```
UNREGISTERED plugins/pipeline-core/hooks/guard-gate-strength-ledger.test.mjs is a
  *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/hooks/guard-handover-size.test.mjs is a
  *.test.mjs suite under a registered root with no verify.mjs registration entry
```

Both files exist under `plugins/pipeline-core/hooks/`, a root the registration
check already covers for every OTHER hook's test file — these two were never
added to `harness/scripts/verify.mjs`'s `TEST_SUITES` list, so they never run
as part of the calibrated verify gate (QG-02) even though they exist and are
presumably meant to protect real guard behavior.

## Affected artifact

`harness/scripts/verify.mjs` (needs two new `TEST_SUITES` entries),
`plugins/pipeline-core/hooks/guard-gate-strength-ledger.test.mjs`,
`plugins/pipeline-core/hooks/guard-handover-size.test.mjs`.

## Proposal

Add both files as registered suites in `harness/scripts/verify.mjs`, following
the existing entry pattern for sibling hook test files (e.g. the adjacent
`guard-gate-strength-tests`/`guard-gate-strength-guard-tests` entries). Run
each standalone first to confirm they currently pass in isolation before
registering (a suite added to the gate while red would immediately block
every other in-flight submission).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
