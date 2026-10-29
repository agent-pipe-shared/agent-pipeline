# M1: the finalizer baseline red case expects the binding from before PF-93

State: HELD PATCH, test-only, independent of every other held patch (touches one hunk near line 251 of `session-critic-finalizer.test.mjs`; no overlap with the stacked patches). Nothing applied, reviewed or accepted. Written and verified by the Elephant (a two-line expectation fix, no production code).

## Cause
The case `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose` compares the private local dispatch evidence binding with a hand-built object. Since PF-93 the writer (`createLocalDispatchEvidenceBinding`, `check-critic-skip-coverage.mjs`) adds `assurance` (`null`, or `orchestrator-attested`) and derives `snapshotId` over the body including it. The case still expected the old key set and the old digest, so it was red on the unpatched baseline (`assurance: null` extra, different `snapshotId`). It is not an environment effect.

## Change
Expected object gains `assurance: null`; the `snapshotId` input gains `assurance: null`. The production formula is unchanged and the legacy-form cases (`PF-93 (1)` to `(8)`) already cover the old key set.

## Evidence (fresh clone of HEAD 0568a2264 via `verify-held-patch.mjs`)
- Baseline `session-critic-finalizer.test.mjs`: exit 1, the one red case above.
- Patched: 87 tests, 87 pass, 0 fail.
- Apply check on HEAD: exit 0.

## NOT done
No Full Verify, no Critic review, no stack run (with the stack the file holds 89 tests; this hunk is independent, and the earlier stacked run showed exactly this one red case).

## Proposed commit message
test(critic): expect the assurance field in the private dispatch evidence binding case (PF-93)

## Operator flow
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-finalizer-baseline-red-assurance-m1.patch`, `git add -A -- plugins/pipeline-core`, `git commit --no-verify -F scratch/commit-msg-po-apply-finalizer-assurance.txt`.
