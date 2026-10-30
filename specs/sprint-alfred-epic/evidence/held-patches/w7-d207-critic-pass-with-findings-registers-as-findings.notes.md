# Held patch: w7-d207-critic-pass-with-findings-registers-as-findings

Base: d98087178. Builder: Elephant (PO exception for small held patches). Decision: D207 (PO, 2026-10-30), "the lineage status follows the findings".

## Defect

A consumed Critic round whose receipt is PASS but whose verdict still carries open (minor) findings could not be registered as lineage:
the compiler wrote `verdict.status: "no-findings"` from `receipt.reviewPass`, and the core validator refuses `no-findings` with open
findings (CRL-NO-FINDINGS, CRL-V2-PASS-FINDINGS). A consumer's PASS round with minor findings therefore had no route forward.

## Change

- `lib/critic-review-lineage.mjs`: after the record is compiled, a `no-findings` status with any open finding is recorded as `findings`.
  The receipt's PASS is untouched; Verify and the push gate keep reading the receipt.
- `lib/critic-verify-lifecycle.mjs`: the retained-lineage mirror check derives the expected status the same way (PASS and zero findings ->
  `no-findings`, otherwise `findings`).
- `lib/critic-course-admission.test.mjs`: `pf94DeltaFixture` and `consumedCourseRoundFixture` take an optional `verdict`; new case CCA079
  registers a PASS-with-minor-finding round (status `findings`, open finding retained), then registers a delta request and is admitted
  as delta round 2.

## Evidence (driver logs in scratch/agent-out/w7pass)

- clone: critic-course-admission 79/79, critic-verify-lifecycle 16/16, critic-review-lineage 20/20, review-economy 134/134.
- revert proof: CCA079 red against unpatched production, restored byte-equal true.
- patch: 3 files, apply-check exit 0.

## Downstream sweep

- Course end (`critic-course-admission.mjs` ~632, RE-CONSUMED-PACKAGE-PASS) already required every finding closed; unchanged behaviour.
- review-economy projection reports `findings-open` instead of `converged` for such a head: correct per D207, nothing gates on it.
- No other reader keys on `no-findings` for push or Verify (doc-reader course uses its own status set).

## Stacking

N20 R2 touches the same compiler line region (lineage.mjs ~438) and the lifecycle mirror (~447/451); the N20 clones must carry this patch first.
