# D60 feature path and target c7 (targeted delivery: green)

Candidate f3152ac58cf07caa98c19e8c8cd9e1635f46856f. Patch `w7-d60-feature-path-and-target-c7.patch` is CUMULATIVE: the D61 patch (w7-d61-empty-store-recovery-verbs-c9; touches critic-generic-batch.mjs, critic-verify-lifecycle.mjs, critic-packet-preflight.mjs, session-critic-finalizer.mjs and its test) plus this slice. Apply it INSTEAD of the D61 patch, not in addition. Apply check at the candidate in a second clone: exit 0.

## END 3 (different task, same target): recon hypothesis refuted, pinned
`declarationSource` builds the delivery target (critic-generic-batch.mjs lines 265-266) from `createLocalDispatchEvidenceBinding({taskId: declaration.taskId, ...})`; the target taskId IS the declaration task. A second declaration of another task needs its own delivery record, so its target differs and `retainedUnadoptedPacket` (lines 375-383) does not hold it. RED run (CGB-HELD expected for task B behind a held packet of task A): registration succeeded ("Missing expected exception"). No production change; the case became the pin `D60 c7 pin: a held packet of declaration task A does not hold a second declaration of another task...` (registration succeeds, held packet untouched). Justification for changing the step-1 case: the refusal cannot occur without changing the target formula, which is out of this slice. Whether that semantics is wanted is an Elephant/PO decision.

## END 2 (feature-request admit behind a half-finished claim): real gap, fixed
- Fixture: a real feature course (`featureCourseFixture` in the test, shape of `prepareIndexedFeature` in critic-dispatch-preflight.test.mjs), so `preflight.coordinatorOnly.courseAdmission` is non-null and `genericBatchFor` returns null.
- RED (log red3): first admit fails after the claim (`publishClaimedSessionAdmissionFn` throws); the second admit for the same task and candidate throws `CPP-SESSION-ADMISSION` "Session admission is absent." (not SCF-PREFLIGHT: the preflight does not read the packet store). Source: `admitSessionCriticReview` existing-packet branch (session-critic-finalizer.mjs about lines 422-430) calls `inspectClaimedSessionAdmission` with no completion path for the feature course; `resumeHeldGenericPacket` returns null without `genericBatchRef`.
- Fix (session-critic-finalizer.mjs, that branch only): if `inspectClaimedSessionAdmission` throws `CPP-SESSION-ADMISSION` and the course is a feature course, read the claimed packet; when its candidate commit, `request.taskId` and `sessionBinding.preflightSha256` equal the current ones, publish the admission with the feature reservation's course digests and return `status: "admitted", resumed: true`. Any mismatch rethrows the original error. Generic-batch requests are unchanged.
- GREEN: `D60 c7 (a)` second admit completes (then `already-admitted`); pin `D60 c7 (a) pin` another task on the same packet id keeps `CPP-SESSION-ADMISSION`, then the same task completes. Not pinned: a held packet of a different candidate on the feature path (the existing-packet branch keys on packet id, and the candidate check is in the fix; a dedicated case was not built).

## Counts (printed lines)
- clone, patched: session-critic-finalizer.test.mjs tests 74, pass 73, fail 1; critic-generic-batch.test.mjs tests 33, pass 33, fail 0; critic-dispatch-preflight.test.mjs tests 48, pass 48, fail 0.
- c7 cases alone, patched: tests 3, pass 3, fail 0.
- clone2, unchanged baseline at the candidate (earlier run): session-critic-finalizer.test.mjs tests 61, pass 60, fail 1.
- Failing-name sets identical: {`private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`}. Count difference: D61 cases plus three c7 cases.

## NOT done
Verify; independent Critic review (parent-owned batch gate); native Windows; PO acceptance; a different-candidate case on the feature path.

## Proposed commit message
fix(critic): complete a feature-request admit left claimed without admission and pin the different-task-same-target behaviour (Toolbox D60)

## Operator flow
apply-diff the patch, `git add -u` limited to the five patch paths, `git commit --no-verify`, stamp, install. Protected-path classification observed: none of the five paths matches TP-1..TP-13.
