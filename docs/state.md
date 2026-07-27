# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

**Last updated:** 2026-07-27
**Project status:** ACTIVE
**Current block:** Sprint Phoenix design correction and fixed-candidate review
**Branch:** `sprint_phoenix`, based on public `origin/main`
`9d1b3dc108eb77629ace5b82002120f5539abd8d`
**Pipeline:** `0.4.6+codex.20260726170452`
**DoD:** 🟡 not ready for Product Owner approval — the current design correction
requires aggregate Verify and a fresh independent Critic review

## Operational head

- Project calibration is [`.claude/pipeline.json`](../.claude/pipeline.json);
  the required aggregate gate is `node harness/scripts/verify.mjs`.
- Phoenix is the only active feature in this checkout. Its readable plan is
  [the Phoenix PRD](../specs/sprint-phoenix-epic/prd_phoenix-epic.md), bound
  to the immutable [technical Spec](../specs/sprint-phoenix-epic/spec.md).
- Pipeline state deliberately remains `phase:"design"` and
  `planApproved:false`. Continuity revision `5` has the known next action
  `review`; no implementation package is dispatchable. Its earlier PRD/Spec
  authority digests are diagnostic only and cannot authorize the revised design
  until PHX-0 supplies a sanctioned revision writer.
- Earlier reviews remain preserved in the append-only
  [Phoenix Result](../specs/sprint-phoenix-epic/result.md). The latest
  independent fixed-candidate Critic recorded one blocker (failed aggregate
  Verify) and two major handover/evidence findings. They are being corrected;
  no passing Critic verdict is claimed for the revised candidate.
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

1. Correct the broken local-evidence link, reconcile the canonical handover,
   and preserve the R-13 candidate-specific trajectory without inventing a
   Security implementation requirement.
2. Commit the exact corrected candidate, run aggregate Verify and Security, and
   obtain a fresh independent Critic review of that exact candidate.
3. Only after those gates may the Product Owner review the readable Phoenix PRD
   and reply with a fresh literal `approved` token for that exact bound Spec.
4. Only after that decision may the sanctioned plan writer record approval and
   the implementation phase begin.
5. The first approved work is PHX-0 slice A. It must implement and independently
   clear the transactional lifecycle writer before PHX-0 slice B or any later
   package.
6. Each implementation package must map its criteria to named automated tests,
   run focused and aggregate gates, receive the required independent review,
   and retain public-safe evidence.
7. Remote publication remains a separate, explicitly authorized tail with
   public-account readback and privacy checks.
8. The monthly Pipeline tooling-radar run is overdue because no current-month
   `tooling-radar` backlog item exists. Dispatch it separately; it is not
   Phoenix implementation authority.
9. The close ritual could not append the root History and telemetry records:
   the still-correct Dev-Plan gate classified both as implementation. The
   canonical Handover, Phoenix Recovery audit, self-retro item, Error Register,
   Continuity transition, and all verification evidence remain written. Do not
   bypass or approve the plan merely to fill those two records; reconcile them
   through a sanctioned close-artifact path.

No implementation, lifecycle promotion, or remote action is implied by this
handover. The previous `approved` cannot authorize a material revision; the
correct next action is the persisted review, followed by a fresh exact PO gate.

## Re-entry

1. Start a fresh session with `pipeline-core:pipeline-start` in this physical
   checkout and require resolved Pipeline `0.4.6` or a later explicitly
   accepted compatible version.
2. Read this file, the active Pipeline state, the Phoenix PRD, Spec, readiness
   audit, Result, Recovery record, and latest Critic record.
3. Confirm branch `sprint_phoenix`, base identity, clean worktree, valid
   continuity, and `planApproved:false`.
4. Run the exact candidate Verify/Security evidence and fresh Critic review
   before presenting a material revision to the Product Owner.
5. If a fresh exact PO decision is not the literal `approved`, remain in design
   and do not dispatch implementation.
6. If it is `approved`, use only the sanctioned plan/lifecycle writers and
   begin with PHX-0 slice A.
