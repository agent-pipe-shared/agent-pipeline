# D190 held patch, slice 1: diff Critic rounds are not capped (CHECKPOINT, partial)

Status: checkpoint. The patch next to this note carries ONLY the RED cases (test file); no production edit was made. Base: candidate 2d8b02548afcf6b7a787ac202c3f87db1166dc5f. Parent continues in a second slice.

## Where each count is checked (re-verified in the clone; recon lines hold)

- `lib/review-economy.mjs` `CRITIC_DISPATCH_LIMITS` / `REVIEW_LIMITS` (criticRounds 4, correctionCommits 3, lines 32-41).
- `admitReviewAttempt` 186-193: round > 4 gives RE-CRITIC-ROUND-LIMIT, correctionCommits > 3 gives RE-CORRECTION-LIMIT, both before the mode check.
- `criticProjectionRecordCode` 384-410: record fields maxReviewRounds === 4 and maxCorrectionCommits === 3 (retained on disk, must stay), reviewRound <= 5, correctionCommitCount <= 4, and `admitted === exhausted` is refused (an admitted record may not exceed the limits; a po-course-gate record must). Transition 474-495 (gate crossing only at exactly 4 to 5 / 3 to 4); `projectCriticReviewEconomy` 545 caps records at 5.
- `lib/critic-review-lineage-core.mjs` `courseCode` 209-225 (round <= 5, count <= 4, `exhausted === (status === "po-course-gate")`), history chain 392-409 (CRL-HISTORY-COURSE-GATE, CRL-HISTORY-ROUND needs round = parent + 1), 461 (history length <= 5).
- `lib/critic-review-lineage.mjs` `reviewAttemptCode` 61-77 (round <= 5, correctionCommits <= 4; CRL-REVIEW-ATTEMPT); record writer 439 hardcodes max 4 and 3.
- `lib/critic-course-admission.mjs`: `deriveCriticCourseAdmission` 307 (history.length > 4 is CCA-SHAPE), 326 (CCA-CORRECTION-RANGE, keep), 346 (`admitReviewAttempt`); runtime v2 `runtimeCompose` 576 (CCA-HISTORIC-COUNTER-BINDING: record.correctionCommitCount === classified count, keep untouched, no retroactive recount), 580 budgets, 584-585 early return when over the limits, 586 (CCA-CORRECTION-RANGE, keep), 598 (`prepareRegisteredCriticDeltaRequest`: CCA-REVIEW-BUDGET-EXHAUSTED). Line 570 refuses a full request when history exists (CCA-REQUESTED-MODE), which already gives hard behaviour (b) on the runtime route.
- `review-economy.mjs` brief limits 853-865 belong to the course-decision brief (continuity), a different surface; not touched in this slice. `scripts/course-decision.schema.json` was not read; unverified whether it pins the limits.

## Chosen design (not yet implemented)

Keep the recorded constants (maxReviewRounds 4, maxCorrectionCommits 3) so every retained record stays byte-valid; only the GATING changes, for delta follow-up rounds only.

1. `admitReviewAttempt`: `deltaFollowUp = round > 1 && requestedMode === "delta"`; skip both limit checks for it (still safe-integer checks). Full requests keep RE-CRITIC-ROUND-LIMIT / RE-CORRECTION-LIMIT / RE-FOLLOWUP-DELTA-REQUIRED exactly as before.
2. Record validation (`criticProjectionRecordCode`, `courseCode`): reviewRound and correctionCommitCount upper bounds become safe-integer; replace `admitted === exhausted` by "a po-course-gate record must be exhausted; an admitted record over the limits must have request.mode delta". Old gate records (mode none, over the limit) and old admitted records (within limits) validate exactly as before; counters are never recomputed.
3. Lineage: `reviewAttemptCode` and history length caps (core 461, economy 545, admission 307) relaxed to safe-integer / a large sanity bound; round = parent + 1 rule stays.
4. `runtimeCompose` 584-585 and `prepareRegisteredCriticDeltaRequest` 598: drop the over-limit early exits (history exists implies delta, because line 570 refuses full). 586 stays, so an empty delta cannot loop.
5. `critic-verify-lifecycle.mjs` untouched: CVL-CRITIC-FAILED stays; PO-exception route is the next slice.

## RED cases (in the patch; test file only, existing suite file)

In `plugins/pipeline-core/lib/critic-course-admission.test.mjs` (fixture `packet()` char table extended from 6 to 12 entries so rounds beyond 5 can be built; existing indexes unchanged):

- CCA016 D190 (a): delta after 4 and 5 retained rounds is admitted. RED.
- CCA017 D190 (a2): delta whose range pushes correction commits to 6 is admitted. RED.
- CCA018 D190 (b): full request after a consumed round is refused (RE-CRITIC-ROUND-LIMIT / RE-FOLLOWUP-DELTA-REQUIRED). Green already (guard, must stay).
- CCA019 D190 (c): delta with zero correction commits in range raises CCA-CORRECTION-RANGE. Green already (guard, must stay).

RED run: `node plugins/pipeline-core/lib/critic-course-admission.test.mjs` in the clone, exit 1, failing names exactly CCA016 and CCA017 (log: scratch/agent-out/w7d190/red.critic-course-admission.test.mjs.log, untracked). Existing cases were not changed; none pinning the old cap for delta rounds was identified yet (CCA04/CCA05 use full mode and stay valid).

## NOT done

Production edits (items 1 to 4 above), GREEN run, whole-file runs of the ten named suites in clone and clone2, failing-name comparison, revert proof, read of `course-decision.schema.json`, the PO-exception route, refusal wording. Patch is kernel-path work (review-economy, lineage, course admission): the PO applies it under a Guard Maintenance Window. The clones under scratch/agent-out/w7d190/ were left in place for continuation (driver.mjs there: setup, run, patch, check, cleanup; cleanup not yet run).

## Proposed commit message

feat(critic): admit a diff round after the first full round without a round or correction-commit count refusing it

Operator flow after completion: apply-diff, `git add -u` with a path limit, commit as the PO, stamp, install. An independent Critic review stays a parent-owned batch gate.
