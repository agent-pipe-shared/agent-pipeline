---
schema: pipeline.backlog-item.v1
id: pipeline.pipeline-state-is-a-13810-line-monolith
type: defect
owner: pipeline
status: open
created: 2026-10-21
source: "PO question 2026-10-21 while patch 13 (AC-140 typed configure-verify repair) had to be made line-neutral"
sprint: none
done_when: manual
---

# pipeline-state.mjs is a 13810-line monolith

## Description

`plugins/pipeline-core/scripts/pipeline-state.mjs` has 13810 lines, exactly its accepted bound in
`architecture/boundary-policy.json` (default `lineBound` 1000). The file holds every sanctioned
State writer (plan submission and approval, push and deploy approval, feature lifecycle,
continuity result rebind and bootstrap, PO authority rebind, configure-verify, inspect) plus their
flag parsing. It is protected (PB-SANCTIONED-WRITER), so every change needs a signature sitting.

Consequences seen in sprint Alfred:

- A frozen bound plus zero headroom makes every fix line-neutral: patch 13 had to move its repair
  table into `lib/calibration-verify-commit-transition.mjs` and fold statements onto existing
  lines. That trades readability for a number.
- One protected file means one ceremony scope for unrelated concerns: a configure-verify fix and a
  push-approval fix share the same protected path and review surface.
- The bound entry carries a reason ("split it before it grows") but no owner and no expiry, which
  QG-06 requires of an accepted exception.

## Proposal

1. Split by subcommand family into `lib/` modules with one owner each (QG-07): plan
   submission/approval, push/deploy approval, feature lifecycle, continuity result routes, PO
   authority rebind, calibration/configure-verify. `pipeline-state.mjs` stays the sanctioned entry
   point: the command table, flag parsing, the State lock, and dispatch to the modules.
2. Decide per extracted module whether it joins PB-SANCTIONED-WRITER (writer code) or stays
   unprotected (pure read and derivation code), and record that in the protected baseline.
3. After each extraction, lower the accepted bound to the new size (ratchet), and give the
   remaining exception an owner and an expiry.
4. Move tests with their module; keep the existing `run()`-level suites as the contract.

PO decision 2026-10-21 (tile, recorded with D79): not for 0.7.0, because each extraction is a
protected-file change with real regression risk in approval and push paths. Target: 0.7.x, one
family per ceremony, starting with configure-verify (smallest, already half in
`lib/calibration-verify-commit-transition.mjs`).

## Acceptance

- `pipeline-state.mjs` is at or under 3000 lines, and each new module is under the default bound.
- Every subcommand's existing tests pass unchanged against the router.
- `architecture/boundary-policy.json` names an owner and an expiry for any remaining exception.
