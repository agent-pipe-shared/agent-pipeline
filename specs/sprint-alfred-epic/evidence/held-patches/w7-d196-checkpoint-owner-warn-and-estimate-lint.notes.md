# W7-D196 held patch: checkpointed-owner warning and estimate lint (R1, R4, R5)

Patch: `w7-d196-checkpoint-owner-warn-and-estimate-lint.patch` (4 files, +113/-3). Built in the scratch clones; the repository tree is untouched except this note and the patch.

## Behaviour as built

- R1 (`dispatch-briefing.mjs`, `generateDispatchBinding`, after the D75 recon block): warning `DBG-CHECKPOINTED-OWNER` (never a refusal) per other slice of the SAME item that is started and unfinished. Text names the slice id, the grant command (`dispatch-budget-grant.mjs --agent-id <the agent id of that run> --extra <1..30> --reason`), the SendMessage resume of the same agent, the successor reasons (elephant-restart, owner-lost, context-poisoned, new-vertical-outcome) and the release route (`slice-queue.mjs cancel <id> --started --reason "<why>" --class budget`). Build still succeeds and prints dispatchCall. Test seam: `deps.startedOwners`.
- R4 (`build`, after `budgetDecision`): `DBG-ESTIMATE-ABOVE-BASE` when estimate > base cap and budgetRationale lacks the word grant; `DBG-ESTIMATE-NEEDS-SPLIT` when estimate > 2 x (base cap + 30). Warnings only; D193 refusal and DBG-PACKAGE-TIER-RAISED handling untouched.
- R5: EL-25a in `roles/elephant.md` gets step (5); `workflow-dispatch.md` gets one paragraph under the existing grant-not-redispatch section.
- R2 (guard) not built (D196).

## Premise correction (deviation)

The briefing says the queue rows carry a started state. They do not: `SLICE_STATES` is ready|hold-po|blocked-external|deferred|cancelled, and a budget checkpoint changes no state (finalizer: reservation stays live). A started slice is a native pending state without terminal record. The default reader therefore is `inspectNativeGoldfishItemDelivery` (named by D196), keeping `phase === "active"` items (running or budget-checkpointed; the two are indistinguishable). Read faults yield no warning. The queue reader (`queueRows`) is not used for R1.

## RED to GREEN

RED before the production edit (log `red1`): the 3 new cases that assert a warning fail. The negative cases (no warning) pass vacuously both ways. GREEN after: dispatch-briefing.test.mjs 108/108 (102 before + 6 new). New cases: R1 positive; R1 other item / same id / none; R1 finished or cancelled; R1 unreadable reader; R4 above base / grant wording / D193 refusal kept; R4 needs-split edge and far.

## Clone vs clone2 (c1 vs base1), all exit 0, no failing names in either

dispatch-briefing (108 vs 102 pass), scripts/slice-queue 20, lib/slice-queue 40, four pins reading elephant.md / workflow-dispatch.md (9, 10, 15, 27), module-inventory 27, generate-elephant-role-prohibitions 13, check-section-citations 17, po-language-projection 16, check-doc-contracts 76. Failing-name sets: both empty.

## Revert proof

Production file reverted to the candidate, new test file kept: exactly the 3 positive-warning cases fail; restored byte-equal true. `driver patch`: apply-check on clone2 exit 0.

## Not verified / open

- `plugins/pipeline-core/roles/elephant.md` is a byte-identical vendored copy of `roles/elephant.md` at the candidate and is OUTSIDE the write scope. The EL-25a step (5) edit must be mirrored there (same one-sentence insertion) or a copy-sync check in Full Verify will be red. Not run here.
- Full Verify, Critic, PO acceptance: parent-owned, pending. No suite beyond those above was run.
- Edit line ranges: see the patch hunks.

CONTINUATION CARD: done: all of R1, R4, R5 in the briefed scope; remaining: mirror EL-25a step (5) into plugins/pipeline-core/roles/elephant.md (needs scope); next step: PO/Elephant apply patch plus that mirror, then Full Verify.

## Elephant addendum (after the hand-back)
- The mirror is done in the clone and travels in the regenerated patch: `plugins/pipeline-core/roles/elephant.md` is a byte copy of `roles/elephant.md` (25159 bytes, five files, apply-check exit 0 on the plain candidate).
- `node harness/scripts/generate-vendored-canon.mjs --check` reports the same three findings in the edited clone and in the plain baseline (`plugins/pipeline-core/roles/critic.md`, `plugins/pipeline-core/docs/adr/0014-critic-contract.md`, `plugins/pipeline-core/docs/push-release-flow.md` stale); `roles/elephant.md` is not among them. Those three are pre-existing drift at the candidate, not caused by this patch, and make `harness/scripts/generate-vendored-canon.test.mjs` AC-1/AC-1b/AC-7 red in both trees.
- `plugins/pipeline-core/scripts/module-inventory.test.mjs` 27 of 27 in the clone.
