# D60 Verify registration c6: CHECKPOINT (targeted delivery: blocked; partial patch, budget exhausted)

Candidate bb4df1cdb1b0618e87761630d06b30a595a236ff. Nothing under plugins/, harness/, docs/ or architecture/ was edited in the repository; all edits are in the scratch clone and travel in `w7-d60-verify-registration-c6.patch` (git diff --binary against the candidate, written from Node; `git apply --check` in clone2: exit 0).

## What the patch does (5 files, +35 -2)
- `plugins/pipeline-core/lib/critic-packet-release.test.mjs`: replaces `import test from "node:test"` with the sibling's wrapper (`completionCaseIds` CPR001..CPR005, local `test()` collecting cases) and ends with `registerTestCaseCompletion({ cases, fd: 3, maxBytes: 8192 })`. The 5 test bodies are untouched.
- `harness/verify-suites.json`: entry `critic-packet-release-tests` after `critic-generic-batch-tests` (sibling at 2283-2287).
- `harness/config/verify-case-completion.v1.json`: row `critic-packet-release-tests`, `disposition: required` (sibling at 454-457).
- `harness/config/verify-case-completion-augmentations.v1.json`: `caseCompletion` with caseIds CPR001..CPR005, maxBytes 65536 (sibling at 493-513).
- `harness/scripts/check-verify-case-completion.test.mjs`: pinned tuple `["critic-packet-release-tests", path, "top-level-assertions", 5]` in `newlyCounted`, name added to `addedAfterR5`, `registryCount` 361 -> 362.

## RED / GREEN and counts
- RED (clone, with only the checker-test edits, before the registration): `VCR01 the repository registry covers all arrays and pins ...` fails, exit 1; log `scratch/agent-out/w7ce/red.check-verify-case-completion.test.mjs.log`.
- BASELINE (clone2, unchanged candidate): the SAME single test VCR01 fails, exit 1 (`base.check-verify-case-completion.test.mjs.log`). IMPORTANT FINDING: VCR01 is already red at the candidate because the pinned `newlyCounted` counts are stale versus the live classifier (actual vs pinned: audit-pack 51/33, critic-course-admission 146/60, critic-dispatch-preflight 169/158, critic-generic-batch 66/18, design-authoring 36/12, devplan-shell-sanctioned-recovery 40/23, guard-dispatch-budget-checkpoint 143/140, guard-dispatch-model 19/9, phoenix-authority-revision-installed-package 21/10, pin-devplan-lane-admits-the-producer-materialize-step 16/9, session-authority-repair 229/144, stop-fanout 94/89). Failing-name sets: baseline {VCR01}, red {VCR01}; identical.
- GREEN: NOT reached. The whole-file VCR01 cannot go green without restating those 12 unrelated stale pins, which is outside this slice (no existing pin may change). The release test's true "sites" count is unmeasured; 5 is a placeholder equal to the `test(` call count and is probably wrong (the sibling shows the classifier counts more than `test(` calls). The registration-in-clone run of the checker and the 5-test run of the release file itself were NOT executed (budget).

## NOT done
- Real sites count for the release test (run `classifyVulnerableSuite` over the patched file, replace the 5), the green run of the checker after restating or ignoring the 12 stale pins (a separate PO decision/slice), the run of `critic-packet-release.test.mjs` (5 tests expected).
- Inventory entries: `plugins/pipeline-core/reader-inputs/product-capability-inventory.json` and `docs/product-capability-inventory.json` (verify-phase line ~367 and testEvidence ~1186, mirroring the sibling), `architecture/map/pipeline-core.md` (~247, sibling at 247), `architecture/map/overview.html`. Not examined for a generator (no script search done); regenerate rather than hand-edit if one exists.
- Verify run, batch Critic (parent-owned), native, PO acceptance.

## Proposed commit message
test(verify): register the critic-packet-release test with the full case-completion protocol and the capability inventory (Toolbox D60)

## Operator flow
Apply with `git apply`, `git add -u` limited to the patch paths, `git commit --no-verify` through the PO ceremony (harness files, `harness/verify-suites.json` TP-13, and the architecture/inventory files are protected or generated), then stamp and install. Do not apply as the final registration until the sites count and the inventory/map entries are completed by a follow-up slice.
