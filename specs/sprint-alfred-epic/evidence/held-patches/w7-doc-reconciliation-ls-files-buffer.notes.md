# doc reconciliation: list tracked files without the one MiB buffer limit (held patch)

Dispatch W7-DOC-RECONCILIATION-LS-FILES-BUFFER-C1-20261027, candidate 140c437aef6c5e0dafb39d5bfa0da5eec7e49f39. Model output. Raw logs (untracked): `scratch/agent-out/w7dr/{red,green,base2,pi}.log`, driver `scratch/agent-out/w7dr/driver.mjs` (spawnSync only; plain `node <file>` in `git clone --shared` checkouts, clones deleted at the end).

## Cause (re-verified, recon confirmed)

`harness/scripts/check-doc-reconciliation.mjs` `gitLsFiles` (line 423-428) called `spawnSync("git", ["ls-files"], { cwd, encoding, shell: false })` with Node's default 1 MiB maxBuffer. Measured in the clone at the candidate: `git ls-files` output is 1199748 bytes (> 1048576), so the call fails (status null, ENOBUFS) and the tool reports `GIT-LS-FILES-ERROR ... git exited null`, exit 2.

## Other git calls in the same file (judged, NOT changed)

Lines 327 rev-parse, 339 rev-parse --verify, 350 git show of one ADR file, 362 ls-tree of `docs/adr` only, 401 merge-base, 405 show --name-only of one cited commit, 417 `git diff --name-only base..candidate`, 541 merge-base. All emit tiny output except 417, which scales with the size of the range (a range spanning most of the repository could in principle approach 1 MiB). No evidence of overflow was measured, so only `gitLsFiles` was changed (briefing: change only what the evidence supports). Follow-up candidate: same `maxBuffer` on line 417.

## Change

- `check-doc-reconciliation.mjs`: `gitLsFiles` gets `maxBuffer: 1 << 28` plus a one-line why comment (+2/-1 lines).
- `check-doc-reconciliation.test.mjs`: one new case, "a repository whose `git ls-files` output exceeds 1 MiB is listed completely (no GIT-LS-FILES-ERROR)" (+34 lines, with a justification comment). Fixture: a reconciled temp repo plus 13000 index-only entries of one blob via `git update-index --add --index-info`; asserts the listing exceeds 1 MiB, no `GIT-LS-FILES-ERROR` finding, and `ok === true`. No existing assertion changed, skipped or deleted.

## RED / GREEN

The test file is a plain-node script (own `check()` harness, aborts on the first failing case; no TAP/node:test).
- RED (clone at candidate, new case only, production unchanged): cases 1-21 ok, case 22 (new) fails: `GIT-LS-FILES-ERROR ... git ls-files failed: git exited null`; exit 1.
- GREEN (clone, patched): `1..23`, `# pass 23`, exit 0, including new case 22.
- Baseline (clone2, unchanged candidate, original test file): exit 1, fails at the real-repo case "CLI: exits 0 against the real repository ..." (`status 2, expected 0`), the same cause. Baseline failing set = {real-repo CLI case}; patched failing set = {} (it turns GREEN). No new failure. Baseline cases before it pass.
- push-init (`node --test plugins/pipeline-core/scripts/push-init.test.mjs`, clone, patched): 32 tests, 24 pass, 8 fail. The real-repo case `drivePushInit: real repo -- an explicit candidate distinct from the record-ref lets layer 1b actually pass (NVA-B-PUSHINIT-1 regression)` now PASSES (and the sibling real-repo case passes). The remaining 8 failures are cases 1-8 of the push-init fixture recon (`precondition-unmet`), which need the separate push-init fixture patch (`w7-push-init-fixture-publication-review.patch`), not this one.

## Patch / apply check

Patch `w7-doc-reconciliation-ls-files-buffer.patch`: 3690 bytes, 2 files (+36/-1), `git diff --binary` against the candidate written from Node. `git apply --check` at the candidate in clone2: exit 0.

## Protected-path classification

`harness/scripts/check-doc-reconciliation.mjs` and `harness/scripts/check-doc-reconciliation.test.mjs` match none of TP-1..TP-13 (agent-obligations section 2). Not protected.

## Not done

No Full Verify, no independent Critic review (parent-owned batch gate), no PO acceptance. Line 417 `git diff --name-only` left at the default buffer (above). No change to the repository tree beyond the notes and patch files.

## Proposed commit message

`fix(harness): lift the one MiB buffer limit of the doc reconciliation file listing`

## Operator flow

`git apply <patch>`, `git add -u -- harness/scripts/check-doc-reconciliation.mjs harness/scripts/check-doc-reconciliation.test.mjs`, `git commit --no-verify -F <msgfile> -- <those paths>`, then stamp and install per the usual host flow.
