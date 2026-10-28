# W7-PF94-OPERATOR-DOCS-C20B notes (2026-10-28)

Targeted delivery: green. Batch Critic, Full Verify and PO acceptance stay parent-owned and pending.

## Cause
The c20 patch adds four cases PF94 DOCS (a)..(d) to `plugins/pipeline-core/lib/critic-course-admission.test.mjs`. The pinned required-descriptor count of row `critic-course-admission-tests` in VCR01 rises from 213 to 232.

## Changed line (one, in the clone only)
`harness/scripts/check-verify-case-completion.test.mjs` line 170: `"top-level-assertions",213],` becomes `"top-level-assertions",232],`. No assertion weakened; no other row differs; the finalizer test file has no row.

## Evidence (clone = candidate 3dfb42c0e + c20 patch staged; clone2 = same baseline, never edited)
- RED, clone before edit (log `scratch/agent-out/w7co/logs/red.log`): exit 1, tests 32, pass 31, fail 1 (VCR01); diff for the row only: actual 232, expected 213.
- GREEN, clone after edit (`green.log`): exit 0, tests 32, pass 32, fail 0.
- Baseline, clone2 (`base.log`): exit 1, tests 32, pass 31, fail 1 (VCR01).
- Failing-name sets: baseline {VCR01}, patched {} - no other failure in either.
- Driver `patch`: 1444 bytes (git diff --binary of clone worktree against its index, written from Node). Driver `check` (git apply --check in clone2): exit 0.

## Proposed commit message
`test(verify): pin the case-completion count of critic-course-admission-tests after the PF94 DOCS cases (VCR01)`

## Operator flow
This patch applies AFTER the c20 patch (`w7-pf94-operator-docs-c20.patch`). Apply the diff, `git add -u` with a path limit (`harness`), one `--no-verify` commit, then stamp and install. If the c20 test file changes again, re-read the printed actual count of VCR01 and update the number.

## Protected paths
`harness/scripts/check-verify-case-completion.test.mjs` matches none of TP-1..TP-13 (TP-3 is `verify.mjs` only).

## Not done
Full Verify, independent batch Critic review (parent-owned gate), PO acceptance.
