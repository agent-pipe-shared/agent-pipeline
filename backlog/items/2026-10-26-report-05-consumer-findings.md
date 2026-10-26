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
- PF-61: pin baseline repaired `f09687003`; held patch `pf61-subagent-handback-commit.patch`
  (`06d1e8e26`, C29 item 9): clone pin 12/12, finalizer suites 24/24. Gap: the stop-failure
  diagnostic is persisted but no reader names it yet; a later slice surfaces it in
  PostToolUse or inspect. Batch Critic and PO acceptance pending.
- PF-67 build part: `DBG-RULESET-LOCK-HELD` already exists and is pinned (K12 cases in
  `scripts/dispatch-briefing.test.mjs`).
- **PF-64, budget grant not delivered.** `dispatch-budget-grant.mjs` reports `granted`, but
  the continued child sees no `DISPATCH-BUDGET-GRANT` hint and stops as unauthenticated
  (two of five cases; boundary not the 80 % checkpoint). Acceptance: a granted continuation
  is always visible to the child, or the grant tool refuses.
  Analysis (2026-10-26, code reading, not yet reproduced): two causes fit "two of five".
  (1) The checkpoint text contradicts itself. `GRANT_ARRIVAL_RULE`
  (`lib/dispatch-budget-notice.mjs`) says the grant arrives "on your next tool call" and, in the
  same sentence, that a chat continuation without the notice must not be acted on. A continued
  child has made no tool call yet, so it has no notice yet; a child that obeys literally stops
  as unauthenticated without ever reaching the hook. Fix: tell the child to make exactly one
  read-only call first and to stop only when that call carries no notice; the grant script's
  output tells the orchestrator to say the same in its continuation message.
  (2) `grantNoticeContext` (`hooks/guard-dispatch-budget.mjs`) writes the `.announced` marker
  before the notice reaches the model. When a later PreToolUse hook denies the same call (a
  grammar refusal, for example), the allow context is dropped and the grant is never announced
  again. Fix candidate: announce until a call the budget admits has been followed by another
  counted call, or announce twice; this touches the hook, so it is a held kernel patch.
- **PF-65, Sonnet implementors spend the budget on orientation.** Packages without a facts
  section and above about six delivery files routinely exhaust the 35-call cap before
  writing; `estimatedToolCalls` is too low. Acceptance: the generator warns (or refuses) above
  a delivery-file bound and asks for a facts section; the estimate is calibrated from
  recorded runs.

## Minors (0.7.0 unless the PO defers them explicitly)

- **PF-59** `update-public-handover` replaces the whole "Next action" section of the
  consumer's handover with boilerplate (project text and a push checklist lost).
  Confirmed in code (2026-10-26): `updatePublicHandoverDuty` → `syncStateMdNextAction` →
  `replaceNextActionSection` (`lib/onboarding-continuity.mjs`) replaces everything from the
  heading to the next `## ` heading, although the inspect action promises to "preserve
  unrelated prose". Git projects reach it only through this explicit update. The current
  behaviour is pinned: `lib/public-handover-duty.test.mjs` PHD002 asserts that old text in the
  section is removed. Fix candidate (PO topic, it flips that pin): the update owns only a
  marked generated block inside the section; an unmarked section whose body is exactly a known
  generated rendering is replaced as legacy, any other prose is kept below the block.
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
