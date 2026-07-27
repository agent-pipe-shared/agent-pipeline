# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

**Last updated:** 2026-07-27
**Project status:** ACTIVE
**Current block:** PHX-0A planner-bootstrap revision approved; Goldfish dispatch next
**Branch:** `sprint_phoenix`, based on public `origin/main`
`9d1b3dc108eb77629ace5b82002120f5539abd8d`
**Pipeline:** `0.4.6+codex.20260726170452`
**DoD:** 🟡 implementation pending — the PHX-0A planner-bootstrap revision is
recorded as a renewed Plan/Spec-bound approval

## Operational head

- Project calibration is [`.claude/pipeline.json`](../.claude/pipeline.json);
  the required aggregate gate is `node harness/scripts/verify.mjs`.
- Phoenix is the only active feature in this checkout. Its readable plan is
  [the Phoenix PRD](../specs/sprint-phoenix-epic/prd_phoenix-epic.md), bound
  to the immutable [technical Spec](../specs/sprint-phoenix-epic/spec.md).
- Pipeline state is in `phase:"implementation"` with a renewed v2
  Plan/Spec-bound approval for the PHX-0A scope revision. The canonical #22
  planner may receive only its narrow read-only absent-manifest `draft`
  bootstrap preview and existing-suite coverage. Continuity revision `5` still
  names `review`; the first implementation package must be recorded through the
  designated lifecycle/dispatch path. Its earlier Continuity PRD/Spec authority
  digests remain diagnostic only; PHX-0 slice A owns their revision writer.
- Earlier reviews remain preserved in the append-only
  [Phoenix Result](../specs/sprint-phoenix-epic/result.md). The external-handoff
  correction candidate passed Full Verify, Security, and a fresh independent
  fixed-candidate Critic with no findings. Earlier failed reviews remain
  preserved and were not reclassified.
- The approved bounded Advisor route was exhausted without an answer in this
  session and earlier attempts were likewise unavailable. No Advisor pass,
  effective model identity, native selected-sandbox execution, or OS isolation
  is claimed. Advisor unavailability is non-blocking; a fresh independent
  Critic remains required.
- All eight open issues carrying `sprint:phoenix` at the design snapshot
  (#5, #9, #17, #23, #24, #30, #31, and #32) and all 105 issue acceptance
  bullets map into 157 unique normative Phoenix criteria.
- PHX-0 through PHX-6 form one dependency-ordered Epic. PHX-0 first delivers
  the missing lifecycle writer as slice A, then the runner-neutral ruleset
  source/freshness trust root as slice B. PHX-1 through PHX-6 cannot begin
  before complete PHX-0 evidence.
- The runner-neutral marketplace path and sanitized workaround/recovery audit
  are first-class Phoenix scope. They are not authorized as isolated early
  fixes.
- R-13 records two distinct Security evidence observations with their exact
  candidates. It does not establish a reproducible Security-gate defect and
  therefore creates no unproven Phoenix implementation scope.
- Completed 0.4.6 recovery/release work remains Product Owner-dispositioned
  and is not reopened by stale historical documentation.
- Sentinel remains outside Phoenix product scope, but its retained active
  authority continues to be discoverable as required:
  [PRD](../specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md),
  [Spec](../specs/2026-07-19-sprint-sentinel-epic/spec.md),
  [acceptance matrix](../specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md),
  [reconciliation design](../specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md),
  [Recovery](../specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md),
  [platform support](../specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md),
  and
  [Windows blockers](../specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md).
- Nova and Cyborg remain parallel, independent Sprints. Nightwing follows
  after the active Sprint design phases; Phoenix consumes no unmerged sibling
  branch as an implementation dependency.
- No push, merge, tag, release, issue mutation, or other remote write occurred
  in the Phoenix design block. Public-only identity and no-private-information
  delivery constraints remain binding for any later authorized publication.

## Design evidence

- Scope and issue validation:
  [scope-validation.md](../specs/sprint-phoenix-epic/design/scope-validation.md)
  and
  [issue-coverage.md](../specs/sprint-phoenix-epic/design/issue-coverage.md).
- Architecture and criteria:
  [architecture.md](../specs/sprint-phoenix-epic/design/architecture.md) and
  [acceptance.md](../specs/sprint-phoenix-epic/acceptance.md).
- Review trail:
  [critic-review.md](../specs/sprint-phoenix-epic/design/critic-review.md),
  [privacy-review.md](../specs/sprint-phoenix-epic/design/privacy-review.md),
  and
  [advisor-review.md](../specs/sprint-phoenix-epic/design/advisor-review.md).
- Readiness and governance:
  [readiness-audit.md](../specs/sprint-phoenix-epic/design/readiness-audit.md)
  and
  [governance-conformance.md](../specs/sprint-phoenix-epic/design/governance-conformance.md).
- Bootstrap, recovery, rejected-route, cleanup, and readback audit:
  [RECOVERY.md](../specs/sprint-phoenix-epic/RECOVERY.md).

## Open items and next block

1. The PO authorized and renewed the Plan/Spec-bound gate for the narrow
   PHX-0A #22 planner correction: only a read-only absent-manifest `draft`
   bootstrap preview and its existing-suite coverage.
2. The first approved work is PHX-0 slice A. It must implement and independently
   clear the transactional lifecycle writer before PHX-0 slice B or any later
   package.
3. Each implementation package must map its criteria to named automated tests,
   run focused and aggregate gates, receive the required independent review,
   and retain public-safe evidence.
4. Remote publication remains a separate, explicitly authorized tail with
   public-account readback and privacy checks.
5. The monthly Pipeline tooling-radar run is overdue because no current-month
   `tooling-radar` backlog item exists. Dispatch it separately; it is not
   Phoenix implementation authority.
6. The close ritual could not append the root History and telemetry records:
   the still-correct Dev-Plan gate classified both as implementation. The
   canonical Handover, Phoenix Recovery audit, self-retro item, Error Register,
   Continuity transition, and all verification evidence remain written. Do not
   bypass or approve the plan merely to fill those two records; reconcile them
   through a sanctioned close-artifact path.

No remote action is implied by this handover. The renewed approval remains
limited to the exact bound Phoenix PRD and Spec; every later material revision
requires its own renewed PO gate.

## Re-entry

1. Start a fresh session with `pipeline-core:pipeline-start` in this physical
   checkout and require resolved Pipeline `0.4.6` or a later explicitly
   accepted compatible version.
2. Read this file, the active Pipeline state, the Phoenix PRD, Spec, readiness
   audit, Result, Recovery record, and latest Critic record.
3. Confirm branch `sprint_phoenix`, base identity, clean worktree, valid
   continuity, and the renewed v2 Plan/Spec-bound `planApproved:true` record.
4. Begin only with a sanctioned, briefed Goldfish dispatch for PHX-0 slice A.
