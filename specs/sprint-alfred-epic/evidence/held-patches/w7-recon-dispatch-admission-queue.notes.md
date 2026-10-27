# Recon notes: PF-85, PF-86, PF-83, D31/D32 (W7-RECON-DISPATCH-ADMISSION-QUEUE-C1-20261027)

Status: INTERIM (budget checkpoint at call 28 of 35). Read-only recon, no patch, no clone made. Candidate 6431bf29a. Findings 1 and 3
are code-grounded; finding 2 (where the lock is taken for the whole admission) and finding 4 (grant headroom rule) are only partly
grounded and are marked so. Line references are `plugins/pipeline-core/lib/` at the candidate.

## 1. PF-85: a follow-up package on the same item is refused

Where each refusal is produced (`native-goldfish-host-state.mjs`):

- `NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD`: three sites. (a) line 215-218 in the PreToolUse admission: for a ready slice with
  `dependsOn`, `observeGovernedItemIntegrationReadiness` is read and every dependency not in `readiness.integrated` is held;
  (b) line 1099-1103 in the queue preparation (`prepareGovernedItemQueue`): same check before the queue is written, with a
  repair text that already teaches `slice-queue.mjs cancel <slice id> --reason ... --class`; (c) line 749-752 in the
  reservation publish: `item-delivery-integration-dependency-held` as a native-managed fault (no repair text).
- Where the dependency comes from: `orderAndCoverAdmittedSlice` (line 995-1002). EVERY other non-cancelled, non-critic slice
  whose write scope overlaps the new slice's scope becomes a `dependsOn` of the new slice, regardless of the other slice's
  state. A partial or blocked predecessor (never committed, not cancelled) is therefore a hard dependency until it has its
  `Dispatch: <slice id> (goldfish)` commit. That is the red-intermediate-commit pressure PF-85 names: a follow-up on the same
  files is only admitted after the incomplete work is committed or cancelled.
- `item-delivery-owner-collision`: line 767 (registry reservations) and 778 (native `pending-` states), both inside the
  reservation publish, only for reservations NOT in `settled` (`readSettledItemSliceIds`, line 764) and not released. Same
  item id and still unsettled means refused. Also `item-delivery-criterion-owner-collision` (768/779) for the same criterion
  locator and `item-delivery-scope-collision` (769/780) for overlapping scope.
- `catalogue-source-closure`: found only in `session-authority-registry.mjs:354` (`closedCatalogue`: participants, participant
  set digest, exactly 12 producers). It is a registry catalogue integrity check, not an item-id lookup. NOT confirmed: the
  relayed "item id outside the spec catalogue fails with catalogue-source-closure" was not reproduced in code reading; the
  item-id-to-spec resolution path (criterion locator resolve) was not reached. Treat as unverified.
- What a `--continuation-of` reference could reuse: the `slice-queue.mjs cancel --class <budget|wrong-premise|review-defect|
  integrated-elsewhere|superseded>` taxonomy (slice-queue.mjs line 10, 379-384) already decides re-dispatch from the class. A
  continuation of a `budget`-cancelled or still-reserved predecessor on the same item could be admitted when the new package
  names the predecessor slice id (declared supersession) instead of requiring cancel plus commit.

Gap list:

| # | Gap | Tag |
|---|---|---|
| 1a | A declared continuation (`--continuation-of <slice id>`) of a held or incomplete predecessor on the same item and scope is not admitted: it is treated as an undeclared overlap dependency | code-fixable-here (+ po-decision on the rule) |
| 1b | Refusal (c) at line 752 and the owner-collision faults carry no repair hint (only site (b) does) | code-fixable-here |
| 1c | `catalogue-source-closure` hint for an item id outside the catalogue | unverified, needs repro |

Minimal slice (1a+1b), files: `lib/native-goldfish-host-state.mjs`, `lib/native-goldfish-host-state.test.mjs` (protected test
path rules do not list it; `guard-dispatch.test.mjs` in this briefing's scope is NOT the right test file for it). RED cases:
(i) a ready predecessor with overlapping scope, successor declares it as continuation: today `dependsOn` gains it and
admission is `HELD`; expected: admitted without dependency when the predecessor is cancelled with class `budget` or is the
declared continuation target; (ii) owner-collision text names `slice-queue cancel --class` in `repair`. Commit subject:
`fix(delivery): admit a declared continuation of an incomplete predecessor on the same item (PF-85)`.
PO decision: whether a declared continuation may run while the predecessor is only reserved (parallel risk) or only after a
`budget` cancel. Recommendation: only after cancel with class `budget` or `wrong-premise`, but make the successor carry the
predecessor in `dependsOn` as "superseded" rather than "integration-held". Confidence: medium-high for sites, medium for the fix.

## 2. PF-86: registry lock is busy while agents run (PARTLY GROUNDED)

- The lock is a file lock `registry.lock` taken with exclusive create in `acquireRegistryLock`
  (`session-authority-registry.mjs`), wait bound `SESSION_AUTHORITY_LOCK_WAIT_MS = 1500` (line 233), poll loop at line 299-303,
  typed refusal `SDC-LOCK-HELD` (line 277-279, carries owner, pid, ageSeconds, waitedMs). `withSessionAuthorityBoundary`
  (line 331) holds it for the whole callback and releases in `finally`.
- Whole-admission hold: `native-goldfish-host-state.mjs` line 739-781 runs `integrated-slice-read`, `collision-check` and the
  inventory scan inside the publish callback, i.e. inside the boundary. This matches the backlog item (Wanted 1, D182 open point 2).
- NOT reached in this budget: the exact call site of `withSessionAuthorityBoundary` in `publishNativeAuthorityState`, and the
  build-side `DBG-RULESET-LOCK-HELD` producer. Do not rely on any claim about them.
- What each option changes: (a) bounded wait with retry raises wait beyond 1.5 s; contradicts the 10 s hook-budget reasoning
  pinned by `lib/session-authority-lock-wait.test.mjs` and still serializes, so it only converts refusals into queueing;
  (b) lock-free pre-scan (compute `settled`, `integration`, baseline facts before the lock, then compare-and-publish under the
  lock with a CAS on `governed.sha256` and registry generation) is the Wanted 1 fix and is the only one that allows fan-out.
  The CAS pieces already exist (`item-delivery-queue-drift` at line 741, `item-course-approval-cas` at 1108).
- Tags: pre-scan outside the lock = code-fixable-here but a protected core registry path, needs its own slice and Critic review
  (po-decision: accept that); in-session fan-out of four Agent calls is also limited by the host (native-host-only: parallel
  PreToolUse hooks of one message start together).
- Slice sketch: files `lib/native-goldfish-host-state.mjs`, `lib/session-authority-registry.mjs` (read-only API), tests in
  `native-goldfish-host-state.test.mjs`; RED: two admissions started concurrently, both admitted; second sees the first's
  reservation in CAS and re-checks only the delta. Subject: `perf(dispatch): scan outside the registry lock, publish by compare-and-swap (PF-86)`.
  Recommendation: do this before raising any wait. Confidence: medium (call site not fully read).

## 3. PF-83: stop-failure files are still created

- Writer: `recordSubagentStopOutcome` in `native-goldfish-host-finalizer.mjs` line 155-169, called from
  `finalizeNativeGoldfishHostReturn` (171-176) after EVERY finalizer run. It writes
  `stop-failure-<32 hex>.json` when `stop.viaHandback` is true and the result is anything other than the single status
  `authored-commit-recorded` (only success status in the finalizer, line 347). It removes the file only on that status, and
  only the file of the same session id + tool use id.
- Directory: at the candidate it is already `.git/agent-pipeline/run/native-goldfish-host-diagnostics` (comment: D180b), a
  sibling that no authority scan inventories. So the inventory-unreadable half of the backlog item
  (`native-managed-unknown-native-entry`, classifier at `native-managed-authority-support.mjs:63`) is addressed in the
  candidate for NEW files; the item's Wanted 1 should be re-read before dispatching it (re-verify rule). Old files written
  into `native-goldfish-host-commit/` before D180b would still trip the classifier (not checked).
- Why files exist after a "succeeded" dispatch (hypothesis, not measured): the success JSON is accepted by a different
  status path than `authored-commit-recorded` (statuses seen in the file: `agent-bound` line 232,
  `awaiting-subagent-stop` line 259, `authored-commit-recorded` 347); a handback seen first via `viaHandback` that returns
  `awaiting-subagent-stop`/non-success writes the file, and the later success call carries a different `toolUseId`/session
  pair or `viaHandback` false, so the unlink targets a different name. Needs a repro (RED case below).
- Warning text promises removal ("A later success removes it", line 152) that happens only for the identical session+tool-use key;
  nothing prunes the directory and `heal` does not know it.
- Gaps: (3a) unlink on any non-failure terminal status for the dispatch id (match by `dispatchId`, not only name hash), code-fixable-here;
  (3b) corrected comment/warning plus a retention rule (prune after N days or when the dispatch is settled), code-fixable-here;
  (3c) `heal` retires stale diagnostics, code-fixable-here (touches repair tool, protected review);
  (3d) a `checkpoint` outcome must not write a stop-failure (see 4).
- Slice (3a+3b), files `lib/native-goldfish-host-finalizer.mjs`, its test file. RED: (i) handback with `awaiting-subagent-stop`
  then success under another tool use id leaves no file; (ii) a succeeded dispatch never leaves a file. Subject:
  `fix(host-commit): remove a stop-failure diagnostic once the dispatch has succeeded (PF-83)`. Confidence: medium.

## 4. D31/D32: budget stop and resume (PARTLY GROUNDED)

- Grounded from the backlog item (2026-10-27 D180b measurement) and the hook notices I received: the budget is enforced by a
  hook (`guard-dispatch-budget.mjs`) that counts authenticated subagent calls; a checkpoint notice arrives at 80 percent
  (call 28 of 35 here); a grant is accepted only through the orchestrator-only `dispatch-budget-grant.mjs` (my own Bash
  attempt to look at it was refused `DISPATCH-BUDGET-GRANT-ORCHESTRATOR-ONLY`; I did not retry). The backlog item states a
  grant is capped at `maxTurns - 6` (44 for the implementor) and once per agent, so about nine more calls; the briefing relays
  the same (35-call implementor, maxTurns 50).
- NOT read in this budget: the grant script and the cap arithmetic source (`lib/dispatch-policy.mjs` had no `grantCeiling`
  symbol by the names I tried; the working cap is `maxTurns - 15` per `dispatch-policy.test.mjs` comments, Critic maxTurns 65).
  So the exact headroom rule, the reservation hold during a continuation, and the `SendMessage` resume interaction are
  unverified here.
- Interaction found in code: any non-success return reaches `recordSubagentStopOutcome` (finding 3) and writes a failure
  diagnostic, so an interim report is classed as a failed stop; the reservation stays held (finding 1 refusal for a
  continuation dispatch) until `cancel --class budget`. D31 (budget stop) and D32 (resume hang) therefore combine PF-83 and PF-85.
- Gaps: (4a) typed return outcome `checkpoint` (return contract schema, finalizer, no stop-failure, reservation stays live):
  code-fixable-here, protected native authority = Critic batch gate; (4b) grant headroom rule: po-decision; (4c) runner
  adapters for Codex and Antigravity: native-host-only / `unenforced` readback; (4d) whether a resumed background agent keeps
  its pending host-commit state: native-host-only, unmeasured.
- PO decision (4b), recommendation: headroom = a second window of the base cap (for example +15 working calls up to
  `maxTurns - closing allowance`) per grant, at most two grants per agent, ceiling counted in windows; keep the single
  `maxTurns` harness cap as the hard backstop. Confidence: low-medium (rule source not read).
- Slice 4a, files `lib/native-goldfish-host-finalizer.mjs`, return schema, tests; commit subject
  `feat(host-commit): accept a checkpoint outcome that keeps the reservation live (D31)`. RED: interim return writes no
  diagnostic and leaves a following `heal` complete.

## Checks

No production or test file was changed (no patch, no clone, no new cases): the briefing asks for notes only. The
"new cases RED/GREEN", "baseline versus patched" and "apply check" targeted checks do not apply and were not run.

CONTINUATION CARD -- done: PF-85 refusal sites and cause (orderAndCoverAdmittedSlice overlap dependency), PF-83 writer and
unlink gap, PF-86 lock primitive and wait bound, D31/D32 only from the backlog item; remaining: PF-86 call site of
`withSessionAuthorityBoundary` in `publishNativeAuthorityState` and `DBG-RULESET-LOCK-HELD`, grant script cap arithmetic
(needs an orchestrator-permitted read), PF-85 `catalogue-source-closure` repro, PF-83 repro of the post-success file;
next step: a second recon dispatch with those four reads or an Elephant read of the grant script.
