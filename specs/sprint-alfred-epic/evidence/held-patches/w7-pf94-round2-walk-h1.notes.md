# W7 PF-94 round 2 walk, slice H1 (checkpoint 2 notes)

State: CHECKPOINT, case still RED. Held patch `w7-pf94-round2-walk-h1.patch` (stacked on `scratch/agent-out/compose/bundle.patch`; diff of the clone against the stacked baseline, 7028 bytes) contains: the new case `PF94 ROUND2 (a)` in `critic-course-admission.test.mjs` and a one-line production fix in `critic-generic-batch.mjs`. Do not apply as is: the case is RED at the next step.

## Walk result (measured)

1. Delta request registered and committed: ok.
2. Round 2 `preflightCriticDispatch` with the registered delta request path: `packet-ready`, `courseAdmission.round` = 2 (the preflight result has no `mode` field; delta mode is selected by the non-null `deltaRequestPath`): ok.
3. Round 2 `admitSessionCriticReview` (course path, claim write): REFUSED before the fix, ok after it (defect 1).
4. Round 2 `finalizeSessionCriticReview`: ok after the fix.
5. `addCriticReviewLineage` for round 2: REFUSES (defect 2, open).

## Defect 1 (fixed in the patch)

`reserveFeatureCriticReviewUnitOwnership` (critic-generic-batch.mjs, the `CGB-PARENT` check after `consumedParent`) compared the course projection's `parent.receiptSha256` with `parent.parent.receiptSha256`. Measured values for round 1 (printed with a temporary debug line, since removed): course projection `2ad9cf27...994f`, `consumedParent` `c5749c42...b565`. The course side is `sha256Canonical(receipt)` (critic-verify-lifecycle.mjs line 384, recorded in the lineage); `consumedParent` uses the local `packetDigest(receipt)`, a different digest function. Every consumer round 2 on the course path would hit it: message "Generic Critic batch is unavailable or refused." (code `CGB-PARENT`, hidden behind the generic message). Fix: compare against `sha256Canonical(parent.receipt)`. One line changed. No separate regression case yet (the ROUND2 case is the regression; a focused `PF94 ROUND2 (b)` is still to be written). Whether the explicit-route comparison inside `consumedParent` (line 463, `packetDigest`) needs the same alignment was not examined.

## Defect 2 (open)

`addCriticReviewLineage({root, packetId})` for the round 2 packet returns `refused`, code `FPR-LINEAGE-COMPILE`, compileCode `CCA-DELTA-REQUIRED`, although the delta request is registered and committed, and the round 2 preflight, admit and finalize accepted it. Hypothesis: the lineage compile derives the course request in full mode or with the wrong base/candidate/deltaRequestPath (it only gets the packet id), so the course decision asks for a delta request. Look at how `compileCriticReviewLineage` (critic-review-lineage.mjs around line 419) and `feature-package-registration.mjs` build the `courseRequest` for round 2. Could also be a test-state gap (the working tree, the registration commit used). Not confirmed.

## Not done

Fix of defect 2, the remaining assertions (parent review id, correction block, manifest entry, next decision), `PF94 ROUND2 (b)`, break-and-restore, VCR01 pin (238 -> 239 when green), whole-file and suite comparisons in clone and clone2, the apply check in clone2, cleanup (clones remain under `scratch/agent-out/w7dj`).

## Proposed commit message

test(critic): walk round 2 of a Critic course end to end on the real route

## Operator flow (when complete)

apply-diff, `git add -u` with a path limit, `--no-verify` commit, stamp, install. No file in the patch matches TP-1..TP-13. An independent Critic review stays a parent-owned batch gate.
