# D60 Verify registration c10: targeted delivery green in the clone (Critic, Verify, native, PO acceptance pending)

Candidate 0c50c0158a3acfdeb5a02c6fdd6eb3b0ea39d755. `w7-d60-verify-registration-c10.patch` is CUMULATIVE (c6 patch plus completions), `git diff --binary` against the candidate, written from Node, 9 files, +239 -150. Nothing outside the two evidence files was edited in the repository tree.

## What changed beyond the c6 patch
- `harness/config/verify-case-completion.v1.json`: the c6 row `critic-packet-release-tests` was out of sorted order (REGISTRY-ORDER failure); moved after `critic-packet-governance-tests`.
- `harness/scripts/check-verify-case-completion.test.mjs` (VCR01 pins, QG-04 comment block in the file states the justification):
  - measured sites count of critic-packet-release-tests = 17 (placeholder 5 replaced);
  - 12 stale sites counts restated: audit-pack 33->51, critic-course-admission 60->146, critic-dispatch-preflight 158->169, critic-generic-batch 18->66, design-authoring 12->36, devplan-shell-sanctioned-recovery 23->40, guard-dispatch-budget-checkpoint 140->143, guard-dispatch-model 9->19, phoenix-authority-revision-installed-package 10->21, pin-devplan-lane-admits-the-producer-materialize-step 9->16, session-authority-repair 144->229, stop-fanout 89->94. Classifier sources last changed 2026-10-16, before the last pin edit (2026-10-23), so only suite growth moved them (per-suite growth commits not individually verified);
  - 18 suites registered after the last restatement were never counted: added to newlyCounted with their measured classification and sites (architecture-close-disposition 16, audit-pack-command-admission 30, codex-critic-actual-baseline 31, codex-critic-baseline 4, current-session-artifact-cross-runner 11, current-session-artifact-export 17, g17-publication-observation 31, g23-quoted-pipeline-reads 17, g23-read-help 14, g29-public-handover-admission 3, g6-aggregate-native-boundaries 6, mid-session-hook-refresh 21, pipeline-state-calibration-recovery 69, po-human-approval-signing-handoff 14, public-handover-duty 72, publication-guard-candidate 21, publication-review-requirement 11, windows-authority-readiness 69) and to addedAfterR5;
  - `antigravity-topology-refresh-host-tests` no longer classifies vulnerable; re-added from its registry row as `convertedSinceR8` (and to `convertedSinceR5`), so the pinned 266 / digest and the R5 284 / digest are unchanged;
  - arithmetic: classified = 266 + 100 newlyCounted - 1 converted = 365; registryCount 362 -> 386 (361 + 25 rows incl. the release row). The vulnerableCount assertion now subtracts convertedSinceR8.length.
- Inventory entries hand-edited (no generator exists; `check-product-capability-inventory.mjs` only validates): both product-capability-inventory.json (+2 lines each), `architecture/map/pipeline-core.md` (+1), `architecture/map/overview.html` (132 anchor insertions).

## Results (logs under scratch/agent-out/w7ce/)
- RED before: VCR01 failed (REGISTRY-ORDER; then descriptor pins; then 283 !== 266; then 283 !== 284). Baseline clone2 at the candidate (c6 prerequisite not applied): VCR01 the only red (31 of 32).
- GREEN: `check-verify-case-completion.test.mjs` in the clone: exit 0, tests 32, pass 32, fail 0. `critic-packet-release.test.mjs`: exit 0, tests 5, pass 5.
- `check-product-capability-inventory.test.mjs`: {pass 27, fail 3} vs expected {pass 29, fail 1} in BOTH clone (with the patch) and clone2 (candidate without it): PRE-EXISTING, not caused by this patch.
- Final `git apply --check` of the regenerated patch in clone2: see the report; the earlier version of the patch passed with exit 0.

## NOT done
Driver cleanup of the clones (scratch/agent-out/w7ce/clone, clone2). Verify run, batch Critic (parent-owned), native, PO acceptance. The three pre-existing inventory test failures are not diagnosed by name.

## Proposed commit message
test(verify): complete the critic-packet-release registration with its measured sites count and inventory entries, and restate 12 VCR01 count pins that suites outgrew (Toolbox D60)

## Operator flow
`git apply` the patch, `git add -u` limited to the 9 patch paths, `git commit --no-verify` via the PO ceremony (harness files, `harness/verify-suites.json` TP-13 and the architecture/inventory files are protected or generated), stamp, install. The VCR01 hunk also restates 18 unrelated post-baseline suite counts and one converted identity; review that hunk in the Critic gate.
