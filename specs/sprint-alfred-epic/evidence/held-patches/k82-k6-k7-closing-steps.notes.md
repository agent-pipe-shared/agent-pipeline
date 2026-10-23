# K82-K6-K7-CLOSING-STEPS notes (clone scratch/clones/k82, HEAD of feat/sprint-alfred)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending. No clone commit was made (no unprotected change needed).

## Part 1 (K7): case ids, one run per suite alone (runner scratch/k82-run.mjs, private TMPDIR outside repos)
Command shape: `node scratch/k82-run.mjs <label> <test file>`; all exit 0, 0 fail, 0 skipped.
- native-goldfish-host-return-tests: lib/native-goldfish-host-return.test.mjs, 6 tests. Verified add: NGHR06.
- antigravity-topology-refresh-host-tests: lib/antigravity-topology-refresh-host.test.mjs, 15 tests, ids RC05C001-015 in names. Effective policy lives in the AUGMENTATION file (RC05C001-013, previousPolicySha256 bound to the inline policy). Verified add: RC05C014, RC05C015 (C012, C013 already in the augmentation).
- project-uninstall-tests: lib/project-uninstall.test.mjs, 20 tests (51 s). Verified add: UC02C008-UC02C020 (13 ids).
- model-family-runtime-host-tests: lib/model-family-runtime-host.test.mjs, 5 tests. Verified add: MFH005.
- design-course-session-tests: scripts/design-course-session.test.mjs, 9 tests. Verified add: K3C007, K3C008, K3C009.
- run-parallel-tests: scripts/run-parallel.test.mjs, 5 tests, exit 0 (re-created from the K79 C16 patch; no caseCompletion block, same as the patch).
Ids not verified: none.

DEVIATION (important): the briefing put RC05C012-015 into harness/verify-suites.json. That is red. Editing the inline antigravity policy changes its digest and `check-verify-case-completion.mjs` fails with `AUG-PREIMAGE ... previous-policy digest does not match` (cascade: 212 REQUIRED-VERIFY-POLICY lines, exit 2). So the antigravity change is made in `harness/config/verify-case-completion-augmentations.v1.json` (RC05C001-013 -> 015; inline policy untouched, preimage digest stays valid). That file is in NEVER_LIFTABLE_KERNEL_PATHS (guard-maintenance-window.mjs line 640), so it is a protected/operator diff too.

Deliverables (MAIN checkout, all `git apply --check` clean from the main checkout):
- `scratch/agent-out/k82-c16-cumulative.diff`: harness/verify-suites.json only. NGHR06, UC02C008-020, MFH005, K3C007-009 plus the run-parallel-tests entry. Supersedes `k79-c16-verify-suites-run-parallel.patch`. Also `git apply --check` clean together with `k79-c15-verify-caseids-and-k1r.patch` (different file).
- `scratch/agent-out/k82-augmentation-rc05.diff`: augmentations file, RC05C014 and RC05C015.
Measurements with both applied in the clone (script-relative, so it measured the clone): `node scratch/clones/k82/harness/scripts/check-verify-case-completion.mjs` exit 0 ("356 entries, 342 conservatively classified suites", same as main HEAD); `check-verify-case-completion-augmentation-policy.test.mjs` 8/8 pass.
Registration checker: main HEAD `node harness/scripts/check-verify-suite-registration.mjs` = 1084 registered, 0 unregistered. In the clone with the run-parallel entry: exit 2, `UNCATEGORIZED-VERIFY-SURFACE "run-parallel-tests"`: add `verify-phase:harness/scripts/verify.mjs:run-parallel-tests` to one capability in docs/product-capability-inventory.json. That is the K79 optional `k79-c16b-inventory-surface.diff`; it MUST be applied together with the run-parallel registration (not measured by me; protected). Not run: check-verify-case-completion.test.mjs, verify-case-completion-augmentation.test.mjs.
Clone edits reverted afterwards (Edit tool); clone tracked tree clean.

## Part 2 (K6 confirmation), no edit
- `node scratch/k82-run.mjs dav plugins/pipeline-core/scripts/dispatch-authorship-verify.test.mjs`: exit 0, 65 tests, 65 pass.
- `node scratch/k82-run.mjs ccp plugins/pipeline-core/scripts/codex-critic-packet-host.test.mjs`: exit 0, custom reporter "PASS CCH01-CCH04, 4/4 checks passed". Recon expectation (v3 `log: []` fixture red) is stale; no fixture repair, no commit.

## Part 3 (PO list row 19): HELD, not committed
- Before: `codex-isolated-critic-protected-preimage.test.mjs` exit 1 on check 3 (checks 1, 2 ok), six paths mismatched. After the data edit (six digests, taken from the test's printed actual values): exit 0, ok 1-4.
- Diff: `scratch/agent-out/k82-preimage-repin.diff` (plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json, 6 lines), `git apply --check` clean. Clone edit reverted.
- Commits since last re-pin `c26de7987` (what the re-pin blesses):
  - harness/review-protocol.md: fa4365b7d, d7926f82c (ADR-0014 batched Critic text)
  - agents/critic.md: e454442ca, 061e208f5, d02409a8a, 7f37cc916, 109cd3f6b (budget maxTurns 50, base cap 30), f95fc6998
  - scripts/codex-critic-host.mjs: 2532a96fe (git null-device constant)
  - skills/critic-review/SKILL.md: db930a359, fe18f5627, d02409a8a, fa4365b7d, d7926f82c
  - roles/critic.md: e454442ca, d02409a8a, fa4365b7d, d7926f82c, f95fc6998
  - templates/prompts/critic-review.md: e454442ca, d02409a8a, fa4365b7d, d7926f82c, cf658960c, eac46002b, 1cff4a1db, b90402938, 109cd3f6b, f993aedde, f95fc6998

## Proposed commit messages (operator commits; trailers exactly the two lines)
1. `test(verify): register the run-parallel suite and complete five case-id lists` -- body: NGHR06, UC02C008-020, MFH005, K3C007-009 added after each suite ran green alone; run-parallel-tests registered. Paths: harness/verify-suites.json (plus docs/product-capability-inventory.json via k79-c16b).
2. `test(verify): complete the antigravity refresh host case-id augmentation` -- body: RC05C014, RC05C015; inline policy untouched so the previous-policy digest stays valid. Path: harness/config/verify-case-completion-augmentations.v1.json.
3. `chore(critic): re-pin the isolated Critic protected preimage` -- body: re-pin to the current Critic-contract bytes after PO review of the commit ranges above. Path: plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json.
Each ends with:
AI-Assisted: true
Dispatch: K82-K6-K7-CLOSING-STEPS (goldfish)
