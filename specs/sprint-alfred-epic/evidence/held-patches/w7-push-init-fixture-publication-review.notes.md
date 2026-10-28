# push-init fixture: neutralise the publication review gate (held patch, partial)

Dispatch W7-PUSH-INIT-FIXTURE-PUBLICATION-REVIEW-C1-20261027, candidate 16f5ad897c52519a4d663460c66da587d2dac66b. Model output. Raw logs (untracked): `scratch/agent-out/w7pj/{red,green,patched2}.log`, driver `scratch/agent-out/w7pj/driver.mjs` (spawnSync only; `node --test <file>` in a `git clone --shared` checkout).

## Cause

`plugins/pipeline-core/scripts/push-prepare.mjs` lines 745-755 add the check `critic-bound-verify` when `(deps.requiresPublicationReview ?? requiresPublicationReview)(state, ...)` is true, using `(deps.checkCriticBoundVerify ?? checkCurrentCriticBoundVerify)(dir)`. The helper `prepareDepsAllGreen()` overrode neither seam, so every all-green case failed with `candidate qualification unavailable (CBV-ROOT)`. (The earlier architecture-readiness premise was wrong; `ARCHITECTURE-MAP-MISSING` is stderr of a passing test.)

## Change (3 added lines, test file only)

In `prepareDepsAllGreen()` after `now:` (push-init.test.mjs): one justification comment line, `requiresPublicationReview: () => false`, `checkCriticBoundVerify: () => ({ ok: true })`. No assertion changed, no case skipped or deleted. Because `...overrides` is spread last, a case may still override both seams. No case asserts the critic-bound-verify check itself in this file (cases 1-8 only needed it neutral).

## RED / GREEN

- RED (clone at candidate, `node --test`): 32 tests, 23 pass, 9 fail. Failing names: (1) chains all three steps...; (2) signature preparation keeps the existing signature-required output; (3) reconciliation accepts WSL EPERM only after status zero...; (4) layer 1b is skipped, not failed...; (5) the signature-required outcome never carries a driver-executable action...; (6) dirty working tree stops at push-prepare's own check...; (7) stale verify evidence is reported by the cheap preflight...; (8) an onboarding-set machine-plane anchor resolves the key directory...; (9) real repo -- an explicit candidate distinct from the record-ref lets layer 1b actually pass (NVA-B-PUSHINIT-1 regression).
- GREEN (clone, patched): 32 tests, 31 pass, 1 fail (name 9 only). Names 1-8 are green, including name 6 (its `2 !== 1` shared the same cause).
- clone2 (candidate, then `git apply` of the patch): failing-name set is identical to the clone patched run: only name 9. Baseline set = the 9 names above; patched set = {9}. No new failure.
- Apply check: `git apply --check` of the patch at the candidate in clone2, exit 0 (done before applying). Patch size 1027 bytes, 1 file, +3.

## Remaining red: name 9 (STOP ITEM, needs production code, out of write scope)

Exact failing text: `reconciliationStep.exitCode` is 2, expected 0. Running `node harness/scripts/check-doc-reconciliation.mjs --base 56e91858d96f9d58db75c306424b79c256c1fe74 --candidate 8681046622dc23956b760ba93552793b3d983193` prints `GIT-LS-FILES-ERROR ... git ls-files failed: git exited null`. Cause: `harness/scripts/check-doc-reconciliation.mjs` line 424 `spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8", shell: false })` uses the default 1 MiB `maxBuffer`; the tracked-file listing is now about 1.1 MB (`git ls-files -z` measured 1.1 MB), so spawnSync fails with ENOBUFS and status null. Smallest fix: add `maxBuffer: 1 << 28` to that options object (one line, production file in `harness/scripts/`, not mine to edit; the same pattern may exist in sibling `git` spawns in that script, not checked). Not fixed here; the test itself needs no change. This also likely affects the sibling real-repo case at line 892 only if it asserts exit 0 (it passed in the run).

## Not done

Name 9 left red (above). No Full Verify, no Critic review (parent-owned batch gate), no PO acceptance. Protected-path classification: `plugins/pipeline-core/scripts/push-init.test.mjs` matches none of TP-1..TP-13 (not protected); `harness/scripts/check-doc-reconciliation.mjs` also matches none, so the production fix is editable by a separate slice.

## Proposed commit message

`test(pipeline-core): let the push-init fixture pass the publication review gate`

## Operator flow

Apply the patch (`git apply <patch>`), `git add -u -- plugins/pipeline-core/scripts/push-init.test.mjs`, `git commit --no-verify -F <msgfile> -- <path>`, then stamp and install per the usual host flow. An independent Critic review stays a parent-owned batch gate.
