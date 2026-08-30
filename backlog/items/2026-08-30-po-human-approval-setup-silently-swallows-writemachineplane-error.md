---
schema: pipeline.backlog-item.v1
id: pipeline.po-human-approval-setup-silently-swallows-writemachineplane-error
type: defect
owner: pipeline
status: open
created: 2026-08-30
sprint: nova
tracking: "NOW / Nova A -- surfaced 2026-08-30 while cross-checking the Claude/Windows greenfield retrospective against current code; confirmed still present, unfixed."
source: "Claude-060-78 greenfield retrospective, section 8, tool defect 2; verified live against plugins/pipeline-core/scripts/po-human-approval.mjs:109 on 2026-08-30."
---

# `po-human-approval.mjs setup` silently swallows a `writeMachinePlane()` failure

## What happened

`plugins/pipeline-core/scripts/po-human-approval.mjs` line 109:

    try { writePlane(next, dependencies); } catch { /* best-effort: never fails setup itself */ }

An empty catch block means a real `writeMachinePlane()` failure during
`setup` produces zero visible output -- no warning, no error, nothing. The
operator has no way to know the machine-plane write silently failed short of
independently inspecting the resulting state.

## Proposal

Keep the "never fails setup itself" design intent (a machine-plane write
failure should not block the human key-setup ceremony that setup exists
for), but stop swallowing the failure silently: log a visible warning
(stderr) naming what failed and why, so an operator or a later diagnostic
pass can actually notice.

## Acceptance criteria

- A `writeMachinePlane()` failure during `setup` produces a visible warning.
- `setup` itself still succeeds/does not throw on this failure (unchanged
  best-effort behavior).
- Regression test added covering the warning-on-failure path.

## Triage

- **Decision:** accepted, Nova A
- **Rationale:** PO-prioritized 2026-08-30 alongside 3 sibling findings from
  the same retrospective cross-check
- **Date:** 2026-08-30
