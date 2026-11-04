# w167 (D3): a signed reconcile commits its own files, and the close steps before the ceremony leave a clean tree

Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Apply order (required)

The patch is the delta from the repository state PLUS held patch w166 (it edits the same files). It does NOT apply to the real HEAD until w166 is applied first; an `apply --check` against the real checkout alone exits 1, which is expected. Checked against the w166-applied clone: exit 0.

## What

1. `lib/pipeline-owned-files.mjs`: the feature package's own files (`specs/<feature>/result.md` and `lifecycle.json`) count as the Pipeline's own dirty files, but only when the caller supplies the repository root and the bytes are exactly what State binds (the Result with the digest `continuity.authority.result` carries; the manifest only when it is a `pipeline.feature-package.v1` manifest of the feature State is closing). Any other edit of those paths stays foreign. New `cleanTreeRemedy` never returns null for a dirty tree: the one `commit-pipeline-owned.mjs` command, or, when other files are dirty, `git status --short` plus the order to follow.
2. `scripts/po-approval-request.mjs` (`observeCleanCandidate`) uses `cleanTreeRemedy`; `scripts/commit-pipeline-owned.mjs` classifies with the root, so the result file the result bootstrap leaves is committed by the sanctioned route before the signature step.
3. `lib/human-guard-override.mjs`: `armReconcileCommitCapability`. It deposits ONE capability in the existing override journal (capabilities directory, HMAC, audit ledger entry "authorized"), shaped to the pre-commit hook's own commit-scope consumption (toolName Bash, `git commit`, `pipelineCommitScope = { schema, head, indexTree, protectedPaths }`, the hook's denial text). Head and index tree bind HEAD and the exact staged paths and bytes, so any other path, changed byte, HEAD move or tree change finds another tool-input digest and is not admitted; the hook's existing consume marks it consumed on first use; the window is one hour (the signing command's own expiry); an expired window is refused by the existing stale-window check (HGO-EXPIRED). The hook source is untouched.
4. `scripts/pipeline-state.mjs` (`feature-package-reconcile`): a read-only precheck BEFORE the proof is consumed refuses a foreign staged path (HGO-RC-FOREIGN-STAGED, zero mutation, heal `git restore --staged -- <paths>`); after the write the lock is released and the capability is armed for the manifest and the Result bytes it ratifies, staging exactly those paths; the receipt carries `commitCapability` with a `nextAction`. Refusals after the write exit 3 with the typed code and heal (`HGO-RC-BYTES` names the re-plan command). With no protected path in the commit, or an unborn HEAD, nothing is armed or staged (`not-needed`, exit 0).
5. New suite `scripts/d3-signed-reconcile-commit.test.mjs` (9 cases) registered in `harness/verify-suites.json`.

## Why

Five signatures instead of two in the Antigravity and Codex greenfield runs: the clean-tree check refused after the earlier close steps, and the pre-commit hook asked for a second signature for the files the first signature already bound.

## Not changed

- `feature-package-plan` and the reconcile plan were already read-only; nothing to move to the control directory (a pinned case shows the tree is unchanged after the plan).
- The pre-commit hook, `protected-baseline.mjs` and `guard-human-override.mjs` need no change; `scratch/` mirror files of `po-human-approval.mjs` (untracked in hosted projects) are not touched; the pinned Critic preimage JSON is untouched; derived files (inventory baseline) need the refresh of the apply script.
- `commit-pipeline-owned.mjs` commits with the `Dispatch: stage-0 (elephant)` trailer; whether authorship verification accepts it for a result or manifest commit is not decided here.

## Not proven

- The real installed pre-commit hook end to end (the consume call is mirrored in the suite from the hook's code, not run through a generated hook).
- Gate-strength paths that also match a protected rule are not predicted (a different rule id means no match; the hook then falls back to its own signing course).
- Existing suites of the changed files were run only partly (see the report).
