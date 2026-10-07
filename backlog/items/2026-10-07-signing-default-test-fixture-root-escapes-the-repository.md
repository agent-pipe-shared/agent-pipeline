---
schema: pipeline.backlog-item.v1
id: pipeline.signing-default-test-fixture-root-escapes-the-repository
type: defect
owner: pipeline
status: open
created: 2026-10-07
source: "CLOSEOUT-T2 dispatch stop report, evidence/dispatch-record-CLOSEOUT-T2.json"
sprint: alfred
done_when: manual
due: 2026-10-20
---

# The signing-default test fixture root escapes the repository and breaks on Windows

## Description

`plugins/pipeline-core/scripts/design-workflow-signing-default.test.mjs` (lines 32-33) builds its `fixtureRoot` from
`new URL("../../../../scratch/default-signing/", import.meta.url).pathname`. Four levels up from `scripts/` is one directory
above the repository root, so the suite writes outside the repository on every platform; on Windows the raw URL pathname
(`/D:/...`) is not a valid path and the suite fails at import with `ENOENT mkdir` on a doubled drive letter. Cases
RC21C001..RC21C005 (pinned in `harness/verify-suites.json`) therefore never run on a Windows host.

## Triggering situation

CLOSEOUT-T2, 2026-10-07: a baseline run of existing case `canonical DWP equality` exited 1 at import.

## Affected artifact

`plugins/pipeline-core/scripts/design-workflow-signing-default.test.mjs`.

## Proposal

Test-only fix: derive the root with `fileURLToPath` and place it inside the repository's own `scratch/` (or a
`privateMkdtemp` root), keeping the five pinned case IDs; in the same dispatch extend RC21C003 with a strictly reversed
member order (the JSON key-reordering item's remaining gap). Owner: pipeline; due before the 0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** writing outside the repository is a containment defect; a suite that cannot import on a first-class platform is silent coverage loss.
- **Assignment (if accepted):** CLOSEOUT-T3 (test-only), 0.7.0 candidate.
- **Date:** 2026-10-07
