---
schema: pipeline.backlog-item.v1
id: pipeline.report-05-consumer-findings
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
source: "PO consumer report pipeline-feedback-05 (findings PF-58 to PF-70, plugin 0.7.0+claude.20261025134513.977dad8), relayed 2026-10-26"
done_when: manual
---

# Report 05: consumer findings after handover 04

A consumer project ran the 0.7.0 candidate plugin from 2026-10-20 to 2026-10-26 and reported
thirteen findings. The PO asked for blockers and majors to be fixed in the next candidate.
Triage below. "Verified" means the Source was read and confirms the cause; a
reproduction is still owed for every entry.

## Blocker

- **PF-58, Critic review unit rejects compound criterion ids (verified).**
  `register-feature-package.mjs --add-review-unit` refuses `FPR-REVIEW-UNIT-UNAVAILABLE`
  because `REVIEW_UNIT_CRITERION` in `lib/feature-package-registration.mjs` is
  `/\bAC-[0-9]{1,6}\b/`. A Spec using `AC-E<epic>-<story>-<nn>`, which
  `dispatch-briefing.mjs binding --criterion` admits and binds, therefore has no admissible
  Critic route at all. Acceptance: the review unit accepts every criterion id form the
  binding admits (one shared pattern), with a case for the compound form; related to
  `2026-10-20-a-running-batch-has-no-admissible-critic-route`.

## Majors

- **PF-67 and PF-62, orphaned and racing registry lock.** Same class as the P0
  `2026-10-26-concurrent-hooks-refuse-dispatch-on-registry-lock` and the open
  `2026-10-20-an-orphaned-registry-lock-blocks-every-dispatch`. A dead owner held the lock
  60 to 150 s three times in one session; `dispatch-briefing.mjs build` refused until `heal`.
  A second parallel launch failed `SDC-LOCK-HELD`, a retry seconds later worked. Acceptance
  lives in the P0 item; record both reproductions there.
- **PF-61, native host commit missing after a budget grant.** After
  `dispatch-budget-grant.mjs` and a SendMessage continuation the child returned a valid
  `succeeded` contract, but SubagentStop produced no commit (twice). Suspected: only the first
  stop (`blocked`) is evaluated. Acceptance: a continued child that returns `succeeded` is
  host-committed exactly once, or the hook names why not.
  Reproduced in this repository on 2026-10-26 WITHOUT a budget grant: the PF-58 slice
  (`W4-PF58-REVIEW-UNIT-CRITERIA-20261026`) launched in the background, its PostToolUse said
  the host commit completes at SubagentStop, the child returned a valid `succeeded` contract
  on its first and only stop, and no commit followed (host committed as orchestrator,
  `29d4b4619`). The same happened for identity C6. So the first-stop hypothesis is wrong;
  the SubagentStop route itself does not complete.
  Cause found the same day (transcript shape, read via a scratch diagnostic): the current
  Claude runtime ends a background child with a `SubagentHandback` tool call whose
  `input.message` carries the return contract; the last assistant record is that tool call,
  not text. `observeClaudeSubagentStop` (`lib/native-goldfish-host-finalizer.mjs`) validates
  only `input.last_assistant_message`, so the contract is never seen, and the hook reports the
  failure on stderr only, which SubagentStop does not surface. The child's meta file and
  pending state were present and matched (`toolUseId` correlation intact).

## Progress

- PF-58 fixed directly (unprotected file): `29d4b4619`, pin file 8/8, preflight, round-cap
  and consumer-safe-path suites 65/65. Batch Critic and PO acceptance pending.
- PF-62 and PF-67: the root cause of the deterministic variant in this repository was a
  session-cleanup lock left inside custody; held patch `p0-session-cleanup-lock-recovery.patch`.
- **PF-64, budget grant not delivered.** `dispatch-budget-grant.mjs` reports `granted`, but
  the continued child sees no `DISPATCH-BUDGET-GRANT` hint and stops as unauthenticated
  (two of five cases; boundary not the 80 % checkpoint). Acceptance: a granted continuation
  is always visible to the child, or the grant tool refuses.
- **PF-65, Sonnet implementors spend the budget on orientation.** Packages without a facts
  section and above about six delivery files routinely exhaust the 35-call cap before
  writing; `estimatedToolCalls` is too low. Acceptance: the generator warns (or refuses) above
  a delivery-file bound and asks for a facts section; the estimate is calibrated from
  recorded runs.

## Minors (0.7.0 unless the PO defers them explicitly)

- **PF-59** `update-public-handover` replaces the whole "Next action" section of the
  consumer's handover with boilerplate (project text and a push checklist lost).
- **PF-60** guard grammar refuses `find -o` and `cat` on paths containing `(app)`.
- **PF-63** generated briefings point consumers at `templates/prompts/agent-obligations.md`
  "at the repository root" and `project/pipeline.json`, neither of which a consumer has; the
  digest check fails when the trailing newline after the marker line is dropped.
- **PF-66** `slice-queue.mjs cancel` has no `--root`; `item-delivery-criterion-owner-collision`
  blocks two slices with disjoint write scopes that bind the same criterion.
- **PF-68** `newFiles` are not added to `allowedPaths`; generated build artifacts named only
  in the goal text must be listed under `newFiles`.
- **PF-69** the 80 % checkpoint demands `blocked` even when every check is already green.
- **PF-70** background launches never get a host-commit completion (`NGHF-PENDING-UNAVAILABLE`)
  while reservations still settle as `integrated-by-commit` through the trailer; which
  record the Critic batch precheck needs is undocumented.
