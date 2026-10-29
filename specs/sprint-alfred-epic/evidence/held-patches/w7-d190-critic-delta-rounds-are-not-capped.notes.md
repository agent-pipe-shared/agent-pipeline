# D190 held patch: diff Critic rounds are not capped

Status: implementation complete in a scratch clone, targeted suites green, patch regenerated against candidate 9eec48b18847daa76e75ee75dcf88bcc1f30f937 (`git apply --check` passes in a second clone at the candidate). Independent Critic review, Full Verify and PO acceptance are pending (parent-owned batch gates).

## Where each count is checked (re-verified in the clone; every cited line held)

- `lib/review-economy.mjs` `CRITIC_DISPATCH_LIMITS` / `REVIEW_LIMITS` (criticRounds 4, correctionCommits 3); `admitReviewAttempt`; `criticProjectionRecordCode`; `projectCriticReviewEconomy`.
- `lib/critic-review-lineage-core.mjs` `courseCode`, history length cap in `validateCriticReviewHistory`.
- `lib/critic-review-lineage.mjs` `reviewAttemptCode`; record writer still hardcodes max 4 and 3 (kept on purpose).
- `lib/critic-course-admission.mjs` `deriveCriticCourseAdmission` history cap, `runtimeCompose` early return, `prepareRegisteredCriticDeltaRequest` budget refusal. CCA-CORRECTION-RANGE, CCA-HISTORIC-COUNTER-BINDING and CCA-REQUESTED-MODE untouched.
- `scripts/course-decision.schema.json`: read. It pins `consumedBudgets.reviewRounds` and `correctionCommits` (maximum 2) and the budget name enum, but only on the course-decision brief surface (same surface as review-economy brief limits, a different surface). It does not pin the lineage or admission limits. NOT edited.

## Design as implemented

Recorded constants (maxReviewRounds 4, maxCorrectionCommits 3) are unchanged so retained records stay byte-valid; counters are never recomputed. Only gating changed, for diff follow-up rounds only.

1. `admitReviewAttempt`: `deltaFollowUp = round > 1 && requestedMode === "delta"` skips the round and correction limit checks (still safe-integer checks). Full requests keep RE-CRITIC-ROUND-LIMIT / RE-CORRECTION-LIMIT / RE-FOLLOWUP-DELTA-REQUIRED.
2. Record validation: `criticProjectionRecordCode` reviewRound / correctionCommitCount bounds are safe-integer; `admitted === exhausted` replaced by "not admitted and not exhausted is refused; admitted and exhausted requires request.mode delta". `courseCode`: a po-course-gate record must be exhausted, an admitted record may exceed the old limits.
3. Lineage: `reviewAttemptCode` upper bounds removed (safe-integer only); history length caps in core, economy and admission relaxed to `Number.MAX_SAFE_INTEGER`. The round = parent + 1 rule stays.
4. `runtimeCompose` over-limit early return and `prepareRegisteredCriticDeltaRequest` CCA-REVIEW-BUDGET-EXHAUSTED refusal removed. The empty-range refusal (CCA-CORRECTION-RANGE) stays, so an empty delta cannot loop. Gate vs admitted status of a written record is driven by `admission.courseGateRequired`, so no downstream code keyed on the removed sentinel.
5. `critic-verify-lifecycle.mjs` untouched.

## Evidence

- RED (before production edits, clone with the committed test patch): `critic-course-admission.test.mjs` exit 1, failing exactly CCA016 and CCA017.
- GREEN (patched clone): CCA016, CCA017, CCA018, CCA019 pass. `critic-course-admission.test.mjs` 72 tests, 72 pass, 0 fail.
- Revert proof (four production files stashed, test edits kept): exit 1, failing exactly CCA016 and CCA017; stash popped, `git diff --stat` equals the patch stat (restore proof).
- Whole files, clone2 (unchanged candidate, baseline): all green. critic-course-admission 68/68, review-economy 131 minus the 2 new cases (129 checks listed as passing), critic-review-lineage 17/17, critic-verify-lifecycle 7/7, critic-generic-batch 35/35, round-cap pin 10/10, security-review budget pin 8/8, design-course-run-v2 pin 10/10, kernel-closure 11/11, session-critic-finalizer 90/90, architecture overview `--check` current.
- Whole files, patched clone: critic-course-admission 72/72, review-economy 131/131, critic-review-lineage 17/17, critic-verify-lifecycle 7/7, critic-generic-batch 35/35, round-cap pin 10/10, security pin 8/8, design-course-run-v2 10/10, kernel-closure 11/11, session-critic-finalizer 90/90, architecture overview current. Baseline failing set: empty. Patched failing set after the justified updates: empty. (The first patched run showed failures in review-economy RE24, RE26, RE26d, the round-cap pin AC1 x2, critic-review-lineage CRL12 and CCA016 (fixture); all fixed as below and rerun green.)

## Existing cases updated (each pinned the OLD cap for a diff round; none weakened, skipped or deleted)

- `review-economy.test.mjs` RE24, RE26, RE26d: the over-cap request is now a FULL request (the cap still refuses it, same assertions); added RE24d and RE26d2 pinning that a diff round past the cap is admitted. Justification: D190, the cap gates full requests only.
- `pins/critic-round-cap-and-delta-scope-are-not-enforced.test.mjs` AC1 (two cases): same change (full request keeps refusal and typed course-gate code; diff admitted asserted additionally; the mirror comparison uses the full request).
- `critic-review-lineage.test.mjs` CRL12 gate record: the attempt that builds a po-course-gate record is now a full request at round 4 / correction 4 (a diff request there is admitted by D190 and cannot compile into a gate record).
- `critic-course-admission.test.mjs` fixture `fourRoundHistory`: `String(index + n)` replaced by `(index + n).toString(16)` (index 4+ produced a two-character value, an invalid digest); identical output for indexes below 10. Fixture fix of the first-slice RED cases, not a behaviour change.
- `harness/scripts/check-verify-case-completion.test.mjs`: not touched; the VCR01 count pin was not run in this slice (not in the briefed suite list). The parent should run it in Full Verify because RE24d, RE26d2 and CCA016 to CCA019 add cases.

## NOT done

- The PO-exception route and the refusal wording (CVL-CRITIC-FAILED stays).
- Known gap: CCA017 admits a correction count jump 1 to 6 at the admission layer, but the record-chain rules left in place (`review-economy.mjs` `![0, 1].includes(correctionStep)` and the core history `correctionDelta` rule) still refuse a lineage record whose correction count steps by more than 1. Not resolved in this slice.
- `records.length > Number.MAX_SAFE_INTEGER` bounds are vacuous (array lengths cannot reach it); a real sanity bound (for example 4096) would read better. Left as the design's latitude.
- Run of `check-verify-case-completion.test.mjs`, Full Verify, independent Critic review, PO acceptance.

## Application

All four production files (review-economy, critic-course-admission, critic-review-lineage-core, critic-review-lineage) are never-liftable kernel paths, so the PO applies the patch under a Guard Maintenance Window. Operator flow: apply-diff, `git add -u` with a path limit, commit as the PO, stamp, install. An independent Critic review stays a parent-owned batch gate.

Proposed commit message: feat(critic): admit a diff round after the first full round without a round or correction-commit count refusing it
