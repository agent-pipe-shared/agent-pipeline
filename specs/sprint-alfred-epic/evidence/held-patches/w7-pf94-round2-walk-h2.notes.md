# W7 PF-94 round 2 walk, slice H2 (notes)

State: held patch `w7-pf94-round2-walk-h2.patch` (10706 bytes), incremental on top of the stacked baseline (candidate 50b4f5a4c plus `scratch/agent-out/compose/bundle.patch`, which includes H1). Apply check in a second clone at the candidate with the stack: exit 0. Checkpoint state: some requested comparisons were not reached (see "Not done").

## Cause (defect 2)

`addCriticReviewLineage` in `feature-package-registration.mjs` built the `courseRequest` with `requestedMode: delta` for round N > 1 but a hard-coded `deltaRequestPath: null`; the course compile (`critic-course-admission.mjs`, `history.length && typeof input.deltaRequestPath === "string" ? requestRead : fail("CCA-DELTA-REQUIRED")`) therefore refused. Confirmed by the baseline run (clone2, ROUND2 (a) RED): `FPR-LINEAGE-COMPILE`, compileCode `CCA-DELTA-REQUIRED`. A separate temporary debug print of the decision was not made; the code line plus the typed refusal in the baseline run are the evidence.

## Fix

`feature-package-registration.mjs`: new constant `DELTA_REQUEST_FILE`; for round > 1 the verb scans the manifest for a `candidate-evidence` entry `critic-delta-request-<64hex>.json` whose record has schema `pipeline.critic-delta-request.v1` and `candidate.commit`/`candidate.base` equal to the packet candidate (the descriptor format written by `prepareRegisteredCriticDeltaRequest`), and passes its path as `deltaRequestPath`. None found: refused `FPR-LINEAGE-COMPILE`, compileCode `CCA-DELTA-REQUIRED`, nothing written.

## Tests (critic-course-admission.test.mjs)

- `PF94 ROUND2 (a)` finished: the debug `console.log` removed; assertions green (round 2 lineage added, reviewRound 2, parent review id equals round 1, non-null correction, candidate commit, manifest entry, next admission). Measured next-admission code: `RE-CONSUMED-PACKAGE-PASS` (the H1 draft value, kept; the round 2 package is consumed and passes).
- `PF94 ROUND2 (b)` added (delta request removed from the working manifest after finalize; refused, code, compileCode, manifest byte-identical, no new lineage file). Note: (b) also passes on the unfixed code (unfixed code refuses with the same code), so it pins the refusal contract and cannot be RED against the baseline; (a) is the RED/GREEN case.
- `(c)` skipped: the H1 one-line fix is already exercised by (a) at the round 2 admit, which fails exactly there when it is reverted per the H1 notes (the revert was not re-run in this slice).
- Import `readdirSync` added to an existing import line.
- VCR01 pin for `critic-course-admission-tests`: 238 -> 259 (measured from the VCR01 failure message; check-verify-case-completion 32 of 32 after).

## Results (measured, logs under scratch/agent-out/w7dk/logs, machine-written)

- clone, whole `critic-course-admission.test.mjs`: 68 tests, 68 pass, 0 fail.
- clone2 (stacked baseline), same file: 67 tests, 66 pass, 1 fail: `CCA056 PF94 ROUND2 (a)` RED by design (CCA-DELTA-REQUIRED). Failing-name set differs only by that case; (b) exists only in the patched clone.
- ROUND2 pattern only: clone 2 of 2 green; clone2 1 of 1 red.
- `harness/scripts/check-verify-case-completion.test.mjs`: clone2/stack before the pin edit VCR01 red (actual 259 vs expected 238); in clone after: 32 of 32.

## Elephant verification (fresh clone of 50b4f5a4c, path rule patches F1 to F4, then H1, then this patch)

- critic-course-admission 68/68, critic-generic-batch 35/35, critic-dispatch-preflight 63/63, check-verify-case-completion 32/32, architecture overview current. session-critic-finalizer 86 of 87 with the one known pre-existing red case (identical on the unpatched baseline).
- Break and restore of the H1 one-line fix, done by the Elephant: with the old comparison restored, both ROUND2 cases fail at `step round 2 course admit (writes the claim) does not refuse` (the CGB-PARENT refusal); with the fix they pass. The file was restored byte for byte. So `(c)` is covered by (a) and (b) failing exactly there.
- `(b)` also passes without the fix of this slice (the unfixed code refuses with the same code); it pins the refusal contract, (a) is the RED/GREEN case.

## Not done

Focused `(c)`; the explicit-route `consumedParent`/`packetDigest` comparison analysis (item 6) was not examined: the explicit route compares the digest it recorded itself and was not part of the consumer failure, so it stays unexamined; the test-first order was not kept for the production edit (the fix was written before the first RED run of the new case; the baseline RED of (a) in clone2 is the RED evidence). Apply together with the H1 patch in one commit: the H1 patch alone carries a red case.

## Proposed commit message

fix(critic): register the lineage of round 2 with its delta request and compare the parent receipt with the course digest

## Operator flow

apply-diff, `git add -u` with a path limit, `--no-verify` commit, stamp, install. No file in the patch matches TP-1..TP-13 (files: `critic-course-admission.test.mjs`, `feature-package-registration.mjs`, `check-verify-case-completion.test.mjs`). An independent Critic review stays a parent-owned batch gate.
