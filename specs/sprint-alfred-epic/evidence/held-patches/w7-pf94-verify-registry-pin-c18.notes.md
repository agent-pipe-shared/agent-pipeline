# W7 PF-94 c18: VCR01 pin of critic-course-admission-tests (146 -> 213)

Slice W7-PF94-VERIFY-REGISTRY-PIN-C18-C1-20261027. Candidate 5e5bde6a20a74ee5f6af6ddf71b9e1ca6b8946cf. Held patch, INCREMENT over the committed bundle `w7-pf94-course-continuation-bundle-2026-10-28.patch`. Nothing committed by the Goldfish. Targeted delivery: green.

## Cause
The bundle adds test cases to `plugins/pipeline-core/lib/critic-course-admission.test.mjs`, so the required-descriptor count of that row is now 213. VCR01 in `harness/scripts/check-verify-case-completion.test.mjs` pins 146.

## Changed line (only one)
`["critic-course-admission-tests","plugins/pipeline-core/lib/critic-course-admission.test.mjs","top-level-assertions",146],` -> same row with `213`. No assertion weakened, no other row touched.

## Counts (clone = candidate + bundle staged as baseline; clone2 = the same baseline, never edited)
- RED, clone before edit (log red): tests 32, pass 31, fail 1 = VCR01; printed diff: actual 213 vs expected 146 for the row above, all other rows identical.
- GREEN, clone after edit (log green): tests 32, pass 32, fail 0.
- Baseline, clone2 (log base2): tests 32, pass 31, fail 1 = VCR01 (red there, so the increment is what turns it green).
- Failing-name sets: baseline {VCR01}; patched {}. No other pre-existing failure.
- Apply check (`git apply --check` in clone2): exit 0. Patch 1444 bytes, written from Node (`git diff --binary` of clone worktree against its index).

## Not done
Full Verify, native Windows gates, independent Critic review (parent-owned batch gate), PO acceptance. No new test case was added: the existing VCR01 is the red/green case.

## Proposed commit message
test(verify): pin the case-completion count of critic-course-admission-tests after the PF-94 cases (VCR01)

## Operator flow
Apply AFTER the bundle patch (`git apply` the bundle, then this patch), `git add -u` with a path limit to `harness/scripts/check-verify-case-completion.test.mjs`, `--no-verify` commit, stamp, install. If the bundled `critic-course-admission.test.mjs` changes again, re-read the pinned number from the VCR01 actual-versus-expected diff before applying.

## Protected-path classification
The only changed file `harness/scripts/check-verify-case-completion.test.mjs` matches none of TP-1..TP-13 (agent-obligations §2); edited in the scratch clone only. `harness/verify-suites.json` (TP-13) untouched.
