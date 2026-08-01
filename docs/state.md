# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

**Last updated:** 2026-08-01
**Project status:** ACTIVE
**Current block:** Publication remains fail-closed pending the Human Governance Decision Ledger and Authority Resolver; the persisted queue remains `review` before any further package dispatch
**Branch:** `sprint_phoenix`, based on public `origin/main`
`9d1b3dc108eb77629ace5b82002120f5539abd8d`
**Pipeline:** `0.4.7+codex.20260801130757`
**DoD:** 🟡 Phoenix remains open; the lifecycle manifest is status-ready, while later package selection remains gated by the persisted review action

## Operational head

### Restart checkpoint — 2026-08-01 (no close ritual)

- This is an in-progress-session checkpoint only: no close-block ritual,
  commit, push, merge, tag, or other remote action was performed.
- Immediately before writing this checkpoint, the working tree was clean at local candidate
  `ff229cd05ac60dac956643d7a89b93ab165164cd`. Its exact-bound aggregate
  Verify and Security evidence passed; the latest independent Critic reported
  PASS with no findings under
  `functional-equivalent-read-only; OS isolation not asserted`.
- The current canonical Continuity State is revision `11`, with queue head
  `phoenix-design` / `audit-handoff-design-revision` / `review` and no active
  dispatch, blocker, decision transaction, or recovery journal. PHX-0 slice A
  (lifecycle-authority writer) is the selected next implementation package,
  but has not been dispatched.
- The attempted, exact generic CAS transition from `review` to the PHX-0A
  dispatch was rejected as `PS-CONTINUITY-RESULT-FENCE` with zero State and
  Result mutation. The bound `specs/sprint-phoenix-epic/result.md` contains
  historical Markdown entries but not the single strict `pipeline-result`
  authority fence now required by the writer.
- On restart, run `pipeline-core:pipeline-start`, re-read the canonical State,
  verify no recovery is pending, and keep this failure fail-closed. Do not
  hand-edit State or Result and do not manufacture a dispatch: the next repair
  must use a sanctioned, exact Result-Authority bootstrap route or an
  explicitly authorized scope decision for that missing writer.
- TP-5 is restored; no temporary protected-test lift is active. Publication
  remains fail-closed and no remote push has been attempted.

### Result-Authority reconciliation — 2026-08-01

- The explicitly confirmed, digest-bound Result reconciliation completed through
  the sanctioned State writer. It preserved the historical Markdown Result
  bytes, appended the one canonical `pipeline-result` fence, and read back
  both Result and State.
- Continuity is now revision `12`; its Result binding is
  `708d9293ad8ec13bb58e39ffd857c0a624d93e17b35cde380f242d26de6d9198`.
  The queue remains `phoenix-design` / `audit-handoff-design-revision` /
  `review`; no implementation dispatch, publication authority, or remote
  action was created.
- The narrow writer fix is covered by Pipeline State `244/244`, including
  historical-byte preservation, one-fence append, State binding, and exact
  zero-mutation replay. TP-5 was restored immediately after the test run.

### Push-readiness recovery — 2026-08-01

- The current lifecycle manifest already binds the reviewed `RECOVERY.md`
  bytes. A newly issued Recovery Bridge decision therefore produced no writer
  request and was removed unused; no lifecycle-manifest or private-journal
  bytes were edited by hand.
- Two historical, already `consumed` private Bridge journals used the retired
  `operator-local-attested` label. The status projection now recognizes only
  that exact terminal predecessor form after validating every other binding.
  It continues to reject any malformed or non-terminal legacy journal. The
  live lifecycle status is `ready`.
- The Push Guard retains the ordinary PHX-2 fail-closed behavior. A local
  Publication Authority projection is coordination data and cannot replace the
  required Human Governance Decision Ledger and Authority Resolver. No remote
  action was attempted, and no push is claimed.
- Focused evidence for this local candidate: Pipeline State 242/242, Push
  Guard 99/99, Publication State Authority 6/6, and Publication Authority
  12/12. Aggregate Verify, Security, and independent Critic remain required
  before a one-shot, exact remote publication decision may be requested.

- Project calibration is [`.claude/pipeline.json`](../.claude/pipeline.json);
  the required aggregate gate is `node harness/scripts/verify.mjs`.
- Phoenix is the only active feature in this checkout. Its readable plan is
  [the Phoenix PRD](../specs/sprint-phoenix-epic/prd_phoenix-epic.md), bound
  to the immutable [technical Spec](../specs/sprint-phoenix-epic/spec.md).
- The current neutral State authority is valid at continuity revision `10`, in
  `phase:"implementation"` with `planApproved:true`, the renewed
  Plan/Spec-bound approval, and the canonical Result authority
  `specs/sprint-phoenix-epic/result.md` bound at
  `a95979c94a93547be2de4d130d5825b97946f63fae5345289b412458882a60c6`.
  It still names `audit-handoff-design-revision` / `review` as its queue head;
  that action must be resolved through the designated lifecycle/dispatch path
  before selecting another writing package. The legacy `.claude` State and
  this handover are diagnostic mirrors, not a replacement for that active
  authority.
- PHX-0A's narrow writer-only lifecycle-manifest reconciliation is complete:
  its `draft` state and reviewed inventory were retained, its four stale digest
  bindings were reconciled through the feature-package writer, and the
  committed readback receipt is retained under the Phoenix lifecycle evidence.
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
- The current PHX-0B repair candidate is local commit
  `3e8261131a7f3152c09e287cb803fa56fe503819` (`fix(freshness): bind host
  adapter to bootstrap`), a descendant of the approved candidate `8ddb9a8`.
  It addresses the independent Critic's proven host-transport binding defect
  strictly inside the existing PHX-0B/Freshness inventory: it carries the
  opaque Step-0 preflight digest to the host adapter, rejects missing or stale
  binding, and wires the declared `pipeline-start` route. Its five-file scope
  is limited to the preflight, host adapter, their focused tests, and the
  `pipeline-start` contract. The focused Node tests passed and `git diff
  --check` was clean before commit. Aggregate Verify remains unrun for this
  repaired candidate because pre-existing tracked State/handover changes keep
  the candidate-preflight intentionally closed; no aggregate-Verify, Security,
  Critic-pass, completion, or dispatch claim is made. At PO direction, the
  fresh independent Critic review is deferred until after the imminent restart.
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

## 0.4.7 Elephant hotfix handover — Result-Authority bootstrap

**Trigger.** The current neutral Phoenix State is valid at continuity revision
`9`, is approved for implementation, and retains the queue head
`audit-handoff-design-revision` / `review`, but has
`authority.result:null`. This makes the state non-dispatchable
(`CS-NOT-DISPATCH-ACTION`). The existing Result file is readable historical
evidence but has no required `pipeline-result` fence, so it cannot become a
Course-Decision authority as-is.

**Confirmed limitation.** The generic continuity CAS intentionally rejects a
first Result binding (`CS-PROTECTED-AUTHORITY`); the existing Result-first
Course-Decision writer intentionally requires an already non-null Result
authority (`PS-CONTINUITY-RESULT-BINDING`). No planner or dedicated writer
bridges this valid `result:null` state. A Product Owner exception cannot safely
bypass either invariant.

**Required generic hotfix.** Pipeline 0.4.7 needs an Elephant-owned,
repository-generic, digest-bound *Result-Authority bootstrap* plan/apply
workflow. It must not be Phoenix-specific. Its read-only plan must bind the
physical project root, current State SHA/revision, active feature, PRD/Spec
digests, exact Result path/bytes, and the absence of a Result authority. The
returned apply action must require explicit PO confirmation, create the
strict canonical `pipeline-result` authority envelope only through the
sanctioned writer, atomically bind its readback digest into State, and be
idempotent/recoverable after every Result-before-State interruption.

**Safety contract.** Refuse malformed State/Result, a pre-existing Result
authority, changed State SHA/revision, symlink/unsafe Result paths, duplicate
or noncanonical fences, an active dispatch, a pending decision transaction,
or a changed PRD/Spec binding. The bootstrap must create no implementation
dispatch, modify no product artifact beyond the Result authority envelope,
perform no remote action, and make no completion, verification, security, or
model-identity claim. After successful readback, the ordinary existing
Course-Decision flow alone may record a PO brief and select a dispatch.

**Acceptance evidence.** Add tests for valid `result:null` bootstrap;
stale/replay/conflict rejection; Result-before-State and State-before-receipt
interruption recovery; strict Result-fence/canonicality/path rejection; and
proof that ordinary `continuity-cas` and Course-Decision behavior stay
unchanged. The final hotfix candidate requires focused tests, aggregate
Verify, Security, and an independent Critic before it can repair Phoenix or
any other project.

**Phoenix disposition.** The PO states that no factual Phoenix-content issue
has been found. Preserve candidate `8ddb9a8` and the completed PHX-0A
lifecycle-manifest reconciliation unchanged. Once the generic hotfix is
released and read back, use the separately recorded PO decision to select
`phx-0b-current-candidate-validation`; that Goldfish work validates and
consolidates evidence for the existing PHX-0B/Freshness candidate and may
change files only for a demonstrated defect within the existing PHX-0B
inventory.

1. The PO authorized PHX-0A to add the existing Phoenix `lifecycle.json` to
   its bounded scope and reconcile only its stale PRD, Spec, acceptance, and
   architecture digests through preview → exact PO-bound apply → readback;
   the material revision is now covered by a renewed literal Plan/Spec-bound
   approval.
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
   through a sanctioned close-artifact path. **Owner:** Phoenix close owner
   (Elephant). **Expiry:** 2026-08-08; resolve it or obtain an explicit PO waiver
   before any Phoenix push or final acceptance.

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
