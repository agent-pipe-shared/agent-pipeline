---
schema: pipeline.backlog-item.v1
id: pipeline.resume-hint-test-unregistered-in-verify-gate
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "Discovered as a byproduct of the PHX-WP-GOVPROD-REGISTER dispatch (2026-08-18), which registered a different suite and found this one also unregistered while re-running the registration checker."
---

# plugins/pipeline-core/lib/resume-hint.test.mjs is unregistered in verify.mjs

## Description

`node harness/scripts/check-verify-suite-registration.mjs` reports `plugins/pipeline-core/lib/resume-hint.test.mjs` as UNREGISTERED in `harness/scripts/verify.mjs`'s `TEST_SUITES` array. The suite exists on disk, was recently extended with regression coverage (`RH-SCHEMA-DIAG-2`, landed 2026-08-18 commit `977a78ee`), and needs the same one-line registration treatment `PHX-WP-GOVPROD-REGISTER` (commit `0b540510`) just gave `phoenix-authority-approval.test.mjs`.

## Affected artifact

`harness/scripts/verify.mjs` (`TEST_SUITES` registration).

## Proposal

Confirm `node --test plugins/pipeline-core/lib/resume-hint.test.mjs` passes standalone, then add one `{ name, file }` entry to `TEST_SUITES` mirroring a neighboring `plugins/pipeline-core/lib/*.test.mjs` entry's exact shape. Needs a TP-3 GMW window (or the next one opened) — same constraint as every other `verify.mjs` edit.

## Triage — 2026-08-18

- **Decision:** accept-open, dispatch-ready.
- **Rationale:** Small, mechanical, one-line registration with a ready-made model to copy (the sibling fix that just landed). No PO judgment call needed.
- **Assignment (if accepted):** Goldfish, next TP-3 GMW window.
- **Date:** 2026-08-18
