# N33c: every text about the Critic review budget follows D190

Held patch `w7-n33c-critic-budget-wording-follows-d190.patch`, cut against the stacked candidate (w7-ac175a, w7-n33a, w7-n33b on a71b985b9). Text, comment and test-wording change only: no admission logic changed (`review-economy.mjs`, `critic-course-admission.mjs`, `critic-generic-batch.mjs` untouched except one comment in `review-economy.mjs`).

## What D190 says, and what the code does (read, not assumed)

D190: one full Critic review, then correction-diff reviews until PASS or until the PO grants an exception; no round or correction-commit count refuses a diff round on its own; the PO may accept a residue only for severity `minor`.

Code readback at the candidate:

- `review-economy.mjs` `admitReviewAttempt`: `deltaFollowUp` (round > 1 and `requestedMode === "delta"`) skips both the round cap and the correction-commit cap. The caps still gate a FULL request after round 1 (`RE-CRITIC-ROUND-LIMIT`, `RE-CORRECTION-LIMIT`).
- `review-economy.mjs` projection step: a delta round may follow any number of correction commits.
- `critic-course-admission.mjs` ~723: no count refuses a diff round; a full request with history is refused (`CCA-REQUESTED-MODE`); D204 admits a delta as an effective full round (`RE-DELTA-FALLBACK-FULL`).
- `critic-generic-batch.mjs`: `MAX_BATCH_DELTA_ORDINAL` is 4096, a corruption bound, not a policy count; a second full request is refused.
- `critic-dispatch-preflight.mjs` CDP-COURSE-BUDGET fires only when the requested mode does not match the round (`expectedMode === null`, `maxReviewRounds` differs from `CRITIC_DISPATCH_LIMITS.criticRounds`, admission mode differs from the expected mode, or the delta-request presence differs from the expected mode). It never fires on a count.

No text was changed to describe behaviour the code lacks. No stop condition.

## CDP-COURSE-BUDGET

- Code string kept: `CDP-COURSE-BUDGET`. Downstream sweep (`rg COURSE-BUDGET|Critic budget spent|BUDGET_NEXT_STEP|do not dispatch another Critic|Elephant self-verification` over `plugins`, `harness`, `scripts`, `roles`, `templates`, `guardrails`, `policies`, `docs`, `schemas`, `project`): the only consumer of the code or the message text is the pin `critic-round-cap-and-delta-scope-are-not-enforced.test.mjs` (source-text match, restated). Other hits are history (`specs/.../checkpoint-2026-10-12`, earlier held-patch notes, delivery remeasure JSON) and `close-coordinator-refuses-a-required-critic-without-evidence.test.mjs:205`, a `doesNotMatch` that stays true. No runtime consumer reads the message or `nextStep`.
- Old message: `Critic dispatch is limited to one full review and at most three correction-DIFF reviews per registered batch. Critic budget spent (...): do not dispatch another Critic; the next step is Elephant self-verification, which cannot become PASS, or an explicit PO decision.`
- New message names the real cause (the requested review mode does not match the round: round 1 is a full review, every later round is a correction-DIFF review from the immediately previous reviewed candidate, the admission limits must equal the dispatch limits) and the real next step (ask for the mode the round needs; the D204 effective-full-round note; a limit mismatch is a defect to report). The constant `BUDGET_NEXT_STEP` is renamed `MODE_MISMATCH_NEXT_STEP`; the `{ nextStep }` shape is unchanged.
- Comment above the check ("the current one-full plus three-DIFF policy") restated to D190.
- `close-coordinator.mjs` ~441-447: already D190/D199/D212 worded by N33a ("no round cap since D190/D199; a further correction-diff Critic round is always allowed"); not edited (already aligned). `review-economy.mjs` ~38 comment: restated.

## Old and new sentence per file

Common new wording: "one full independent Critic review, then correction-diff reviews until genuine PASS or an explicit PO decision (D190: no round or correction-commit count refuses a correction-diff review on its own)". Kept in every paragraph: exact delta range from the immediately previous reviewed candidate, one Correction Goldfish per batch, no reset by renaming/repartitioning/restarting, PASS stops, the Reader's own two-plus-one budget.

| File | Old | New |
|---|---|---|
| `roles/elephant.md` ~367 | "any following correction-diff findings in the same context until genuine PASS or the maximum of three correction-diff reviews" | "the findings of every following correction-diff review in the same context until genuine PASS or an explicit PO decision; no review count ends the course on its own" |
| `roles/critic.md` ~199 | "one full independent review and at most three fresh correction-diff reviews, stopping on genuine PASS ... Four calls total is the maximum" | "one full independent review and fresh correction-diff reviews until genuine PASS or an explicit PO decision (D190: no round count) ... There is no full-review rerun" |
| `templates/prompts/critic-review.md` ~130 | "one full review and at most three correction-diff reviews (four reviews total). There is no fifth-round exception" | "one full review, then correction-diff reviews until genuine PASS or an explicit PO decision (D190: no round count refuses a correction-diff review)" |
| same ~212 | "one full ... and at most three correction-diff reviews, for four reviews total ... No fifth review is permitted ... across all three correction rounds" | D190 wording; "A second full review is not admitted, except the effective full round the admission itself records when a correction moves a trust boundary or its impact is ambiguous (D204)"; "across all correction rounds" |
| same ~302 (BATCH_SCOPE) | "one full review and at most three correction-diff reviews" | "one full review, then correction-diff reviews until genuine PASS or an explicit PO decision (no round count)" |
| same ~632 (generic batch) | "supports ordinal 2, 3, or 4 as a delta ... A fifth attempt or second full is refused" | "supports ordinal 2 and every later ordinal as a delta (D190: no round count refuses one) ... A second full request is refused" |
| `templates/prompts/goldfish-task.md` ~395, ~512 | "one full Critic plus up to three correction-diff reviews, stopping on genuine PASS" | "one full Critic, then correction-diff reviews until genuine PASS or an explicit PO decision (no round count)" |
| `templates/prompts/elephant-kickoff.md` ~146 | "up to three correction-diff reviews ... through PASS or the three-diff limit" | "correction-diff reviews until genuine PASS or an explicit PO decision (no round count) ... through PASS or that PO decision" |
| `guardrails/quality-gates.md` ~141-142 (QG-13) | "up to three fresh correction-diff reviews ... Four Critic calls total is the maximum ... stop at PASS or after the third correction-diff review ... removes no runtime budget or course gate" | D190 wording; "stop at PASS or at an explicit PO decision. Each round must still be a real, committed correction reviewed as a diff ... no authorization to repeat a review without a new correction, and it removes no course gate (a full request after round 1 stays refused)" |
| `harness/checklists/critic-review.md` ~38 | "for at most three correction-diff rounds ... A further correction requires the applicable PO course gate" | "through every correction-diff round ... until genuine PASS or an explicit PO decision (D190: no round count) ... A full request after round 1 requires the applicable PO course gate" |
| `policies/model-policy.md` ~130 (MP-07 item 4, English half) | "one full review plus at most three correction-diff re-critics per batch, PO decision 2026-10-16; a second full or fifth review is refused" | "one full review, then correction-diff re-critics until genuine PASS or an explicit PO decision, with no round count: PO decision 2026-10-16 as amended by D190; a second full review is refused" |
| `docs/operating-model.md` ~365, ~464 | "up to three correction-diff reviews ... Four Critic calls total is the maximum" | "correction-diff reviews until genuine PASS or an explicit PO decision (D190: no round count)" |
| `docs/usage.md` ~141 | "The batch budget is one full Critic plus at most three delta Critics" | "The batch course is one full Critic, then delta Critics until PASS or an explicit PO decision (no round count)" |
| `plugins/pipeline-core/agents/critic.md` ~45 | as critic-review.md ~212 | identical D190 wording |
| `plugins/pipeline-core/skills/critic-review/SKILL.md` ~14, ~413, ~415 | "up to three correction-diff reviews ... Four Critic calls total is the maximum"; "through genuine PASS or the three-diff limit"; "shared full-plus-three-diff accounting" | D190 wording; "through genuine PASS or an explicit PO decision"; "shared round accounting (one full round, then diff rounds with no count limit)" |
| `plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md` ~56 | "through PASS or the three-diff limit ... one full Critic plus at most three correction-diff reviews" | "through PASS or an explicit PO decision ... one full Critic, then correction-diff reviews without a round count" |
| vendored mirrors (7 files) | | regenerated with `node harness/scripts/generate-vendored-canon.mjs`, never by hand |

Not in the briefed list, found by the wider sweep and restated for the same reason: `roles/critic.md`, `templates/prompts/critic-review.md` ~302/~632, `docs/usage.md`, `skills/critic-review/SKILL.md` ~413/~415, `skills/pipeline-start/references/workflow-dispatch.md`, the preflight comment.

## Pins restated (QG-04: intent kept, none weakened, none deleted)

- `lib/pins/critic-round-cap-and-delta-scope-are-not-enforced.test.mjs`: "AC2 dispatch preflight carries the typed ... refusal" now pins the typed code plus the real-cause wording and that "at most three correction-DIFF reviews" and "Critic budget spent" are gone; "AC3 guardrail and Elephant role contract" pins the D190 phrase instead of "Four Critic calls total" / "maximum of three" and keeps Correction-only scope / self-verification-cannot-become-PASS; "AC1 typed ... refusal" (was "E3: one number, four calls") pins the mode-mismatch cause, `nextStep: MODE_MISMATCH_NEXT_STEP`, the immediately-previous-candidate step and that "do not dispatch another Critic" / "Elephant self-verification ..." are gone. One NEW case, "AC3 N33c sweep": no stale count phrase in 11 plugin-relative files (+ 2 repo-root files when present, English half only), the Reader's three-correction-batches text untouched, and the behavioural twin (round 9 / 8 corrections as a delta is admitted, as a full request is `RE-CRITIC-ROUND-LIMIT`).
- `lib/pins/opus-critic-only-batched-for-architecture-and-security.test.mjs` ~194: pins the English MP-07 D190 phrase and the absence of "at most three correction-diff re-critics".
- `harness/scripts/check-language-canon.test.mjs` ~78-79: English half pins the D190 phrase and the absence of "Four Critic calls total is the maximum".
- `lib/review-economy.test.mjs` RE23 and RE25 titles only (assertions unchanged): "remains within the approved budget" -> "D190 no round/correction-commit count ... creates a course gate for a diff round".
- `harness/scripts/check-verify-case-completion.test.mjs`: not edited; no pinned count moved by this change.
- No case asserts that a count refuses a diff round: RE24/RE26 (full request past the cap), `critic-review-lineage.test.mjs:499` (full request, round 5) and the AC1 case in the pin file only assert that a FULL request past the cap is refused, which is still true.

## Results (clone = patch applied, base = clone2 at the candidate; logs in the scratch clone directory, driver `run`)

- RED before any text or code edit (restated pins, original texts): pin file 4 failing cases (preflight wording, AC3 canon, AC1 refusal, new sweep), `opus-critic...` 1 (MP-07 English phrase), `check-language-canon` 1 (operating-model phrase). Log prefix `red1`.
- GREEN in the clone (`c1`): critic-round-cap pin 11/11 (base 10/10; +1 new case), opus-critic pin 16/16, check-language-canon 4/4, review-economy.test 134/134, critic-dispatch-preflight.test 74/74, close-coordinator.test 38/38, generate-vendored-canon.test 8/8, check-doc-contracts.test 76/76, generate-agent-obligations.test 13/13. Vendored mirrors regenerated: `wrote 7/41 vendored canon file(s)`.
- `check-verify-case-completion.test.mjs`: exit 1 with the one pre-existing red VCR01 (count drift, same expected/actual diff in clone and base; the changed suites do not appear in the diff). Failing-name set identical to base.
- Wider sweep, clone `c2` vs base `base2`: check-vendored-template-sync 4/4, check-completeness-vocabulary-doclint 9/9, check-critic-contract-citations 21/21, check-section-citations 17/17, generate-elephant-role-prohibitions 13/13, check-observation-governance 7/7, po-language-projection 16/16, critic-course-admission 82/82, goldfish-test-briefs pin 7/7, elephant-main-context pin 9/9, goldfish-budgets pin 7/7, dispatch-record-log pin 31/31, goldfish-bugfix pin 6/6, module-inventory 27/27, critic-packet-preflight 18/18, critic-packet-governance 7/7; `check-reference-paths.test.mjs` red with the same four names in clone and base (pre-existing, unrelated).
- Revert proof (driver `revert`, the three production files reverted to the candidate): the pin file fails the preflight case, the refusal case and the sweep case; restored byte-equal. The documentation texts are covered by the RED run above (original texts, same pins red).
- Driver `patch`: 26 files changed, 130 insertions, 91 deletions; `apply-check exit 0` against the candidate in the baseline clone.
- Rerun after the PO applies the patch: the pin file, `check-language-canon`, `opus-critic...`, `review-economy.test`, then Verify.

## Deliberately not changed (open items for the Coordinator)

- German reference halves of `docs/operating-model.md` and `policies/model-policy.md` (below the `DE-REFERENCE-BELOW` marker, agents must not read them) still carry the old cap ("bis zu drei", "Insgesamt sind höchstens vier", "höchstens drei Delta-Reviews"); the pins `check-language-canon.test.mjs` ~80-81 and `opus-critic...test.mjs` ~192-193 still assert them and stay unchanged. They need their own translation pass.
- `scripts/review-attempt.schema.json` maxima (round 4, correction commits 3, budget maxima) and RE67a-c: historical-record schema, imported only by the test; not sentences, not touched.
- `REVIEW_LIMITS`/`CRITIC_DISPATCH_LIMITS` values (4, 3), `admitReviewAttempt` logic, lineage validators for historic four-round records: behaviour, out of scope.
- Reader budget (`reader-review-protocol.md` both copies, `skills/reader-review/SKILL.md`, `bounded-reader-terminal-binding` and `doc-reader-terminal-binding` tests): the Reader's own budget.
- `critic-review.md` ~634 "Historic four-round validators ... stay unchanged" and "Historical receipts remain readable but cannot authorize another new round": statements about history, still true.
- `docs/state-archive/*`, `backlog/*`, `specs/.../held-patches/*` earlier notes: history.
