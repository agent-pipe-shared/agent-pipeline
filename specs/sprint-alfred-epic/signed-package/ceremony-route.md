# Ceremony route for the signed package (SIGN-PROBE research note)

Source-read only; nothing executed against a guard. Items marked UNVERIFIED were not read within the budget.

## 1. Protection kind per path
Edit time = `guard-testpath.mjs` refuses Edit/Write (rules from `loadProtectedTestPathRules`, which merges the shipped
baseline entries, `lib/protected-test-paths.mjs:100-111`); the Bash/PowerShell lane covers redirects, `sed -i`, `cp`, etc.
(`lib/protected-test-paths.mjs:135-141,773-857`). Commit time = pre-commit hook loop over staged paths
(`scripts/pre-commit-hook-install.mjs:802-828`, same rules).
| Path | Rule | Edit time | Commit time |
|---|---|---|---|
| `plugins/pipeline-core/lib/guard/evaluate.mjs` | PB-GUARD-HOOKS (`protected-baseline.json:25`, `lib/guard/[^/]+\.mjs`) | refused | blocked |
| `.../lib/guard/env-dump-lane.mjs` (new) | PB-GUARD-HOOKS | Write refused (path matches) | first appearance in history is exempt (`pre-commit-hook-install.mjs:821-823`) |
| `harness/verify-suites.json` | TP-13 + PB-VERIFY-REGISTRATION (`protected-baseline.json:37`) | refused | blocked |
| `harness/scripts/verify.mjs` | TP-3 (`agent-obligations.md` section 2) | refused | blocked |
| `harness/scripts/pipeline-state.test.mjs` | TP-5 | refused | blocked |
| `plugins/pipeline-core/hooks/hooks.json` | TP-4, and a never-liftable kernel path (`lib/guard-maintenance-window.mjs:127`) | refused | blocked |
| `harness/scripts/pipeline-state.mjs` | no TP-* or PB-* pattern matches it in what I read (PB-SANCTIONED-WRITER names `plugins/pipeline-core/scripts/pipeline-state.mjs`, `protected-baseline.json:43`) | not refused by those rules | not blocked by those rules; GS-* gate-strength paths UNVERIFIED |
README ambiguity: it says `harness/scripts/pipeline-state.mjs`; the protected one is the `plugins/pipeline-core/scripts/` path.
Every row except the last is refused at BOTH edit time and commit time; none is commit-time-only.

## 2. What one human-guard-override authorizes
- Exactly one tool call. A capability matches only on `toolName` + `toolInputSha256 = sha(toolInput)` + denial digests
  (`lib/human-guard-override.mjs:4145,4174-4176`); the request is seeded from the denied call (`:3026-3117`).
  Any drift in repository state also invalidates it (`:4199-4211`).
- Edit/Write of any `plugins/pipeline-core/**` path has no HGO route: eligibility returns `HGO-AUTHOR-ROOT-REQUIRED`
  with `authorCandidate`, so `recordHumanGuardDenial` yields `author-repair-required` (`:2016-2030,3079,3159-3161`).
  This covers evaluate.mjs, env-dump-lane.mjs, hooks.json. `harness/**` edits are standard-eligible (not under `plugins/pipeline-core`).
- Batch capabilities that exist:
  (a) Guard Maintenance Window (ADR-0058): PO-signed, time-boxed, lifts only rule ids `GS-6` and `TP-*`
  (`lib/guard-maintenance-window.mjs:107-113`); honored at edit time (`hooks/guard-testpath.mjs:205-217`) and at commit
  time (`pre-commit-hook-install.mjs:811-817`). It cannot lift PB-* ids and never kernel paths such as hooks.json
  (`guard-maintenance-window.mjs:124-127`). Which rule wins when a path matches both a PB and a TP rule: UNVERIFIED.
  (b) Signed quality package (`lib/signed-quality-package.mjs`; modes verify/apply/authorize-commit at `:48`; materializer
  `scripts/quality-package-materializer.mjs` via `lib/guard/gate-strength-lane.mjs:294`): a detached-proof, whole-package
  patch application; the pre-commit hook skips all protected findings when it verifies (`pre-commit-hook-install.mjs:799,809`);
  commit trailer `Dispatch: quality-package-<sha256> (integration)` (`lib/commit-message-policy.mjs:90,118`).
  Its path scope and policy preconditions were NOT read (UNVERIFIED) - this is the candidate for a signed patch digest.
- For plain HGO there is no batch of paths or signed patch digest: answer "none".
- `git apply` of a patch is refused by the shell lane as unbound patch targets (`lib/protected-test-paths.mjs:810-821`).

## 3. Commit-time route
The pre-commit hook does not look at the `git commit` call. Per staged protected path it admits only if one of: quality
package authorized; GMW covers a TP-*/GS-6 rule on a non-kernel path; a consumed HGO capability exists for that path
(`defaultHasConsumedCapabilityForPath`, `scripts/check-protected-path-integrity.mjs:282`, body UNVERIFIED); first appearance
in history; trust-anchor bootstrap (`pre-commit-hook-install.mjs:799-826`). A `git commit` Bash call is itself
HGO-eligible (`human-guard-override.mjs:2003-2012`), but that override does not by itself satisfy the per-path check,
so one override on one commit does NOT cover a commit holding several protected paths, unless the quality-package route applies.

## 4. Minimum ceremony count, tranche 1
- Plain per-call HGO: at least one ceremony per Edit region per file (plugin-source files cannot be unlocked this way at all),
  plus commit-time consumption per path. Not viable for this tranche.
- "All edits as plain working-tree edits, then ONE override for the single commit" does not work: the edits are refused
  before the commit, and the commit hook checks per path, not per commit call.
- GMW: one signature could cover the TP paths (verify.mjs, verify-suites.json if TP wins over PB, pipeline-state.test.mjs)
  but not evaluate.mjs/env-dump-lane.mjs (PB-GUARD-HOOKS) and not hooks.json.
- Cheapest candidate: ONE signed quality package containing the full tranche-1 patch, applied by the materializer
  (`apply`) and committed via `authorize-commit` (one signature if the package scope admits these paths: UNVERIFIED).
  The applied patch must be a single package-bound diff of exactly the staged paths, committed with the
  `quality-package-<sha256> (integration)` Dispatch trailer; nothing else staged.

## 5. Signed quality package - scope and route (SIGN-PROBE-2; source-read, nothing executed)
Paths are `plugins/pipeline-core/...` unless stated; `lib/sqp` = `lib/signed-quality-package.mjs`.

### 5.1 Path scope
- No allowlist or denylist by protection class. `validatePackage` (`lib/sqp:133-141`) only requires: schema
  `pipeline.signed-quality-package.v1`, a 40-64 hex `baseCommit`, `expectedDigests` keys == the `+++ b/` paths of the diff
  exactly, each a safe repo-relative path (`safeRepositoryPath`, `:97-101`: no absolute, no `..`, no backslash, not under `.git`).
  PB-*, TP-*, GS-* are not consulted at all. `lib/sqp:225,294,348` refuse exactly one path: `project/critical-human-proof.json`.
- Therefore admissible by this module: `lib/guard/evaluate.mjs`, new `lib/guard/env-dump-lane.mjs`, `harness/verify-suites.json`,
  `harness/scripts/verify.mjs`, `scripts/pipeline-state.mjs`, `harness/scripts/pipeline-state.test.mjs`. Precedent: package
  d6d2a8b2 landed `harness/scripts/verify.mjs`, `hooks/guard-lifecycle-ready.mjs` and `protected-baseline.json`
  (PB-GUARD-HOOKS/TP-3 class) in commit 380eb7faa (`specs/sprint-alfred-epic/evidence/qp-d6d2a8b2/README.md:3-4`,
  `build-intent.mjs:14-20`).
- `hooks/hooks.json` (TP-4 + kernel): the pre-commit loop does `if (qualityPackageAuthorized) continue;` BEFORE the kernel
  check (`scripts/pre-commit-hook-install.mjs:809` vs `:811-813`), so by source it is admitted at commit time. No test or
  precedent exercises a package containing hooks.json (the only hooks.json test is the GMW refusal, `pre-commit-hook-install.test.mjs:662`):
  UNVERIFIED in practice. Tranche 1 does not list hooks.json, so this is moot unless added.
- `harness/scripts/pipeline-state.mjs` (point 5): BOTH paths are real tracked files (`git ls-files` returns
  `harness/scripts/pipeline-state.mjs` and `plugins/pipeline-core/scripts/pipeline-state.mjs`). The README name is a real path
  but it is the harness copy; PB-SANCTIONED-WRITER names the plugin one. Which one tranche 1 means must be decided by the author.

### 5.2 Preconditions
- Base binding: `baseCommit` must equal `HEAD` at `apply` (`lib/sqp:353-354`, else `QUALITY-PACKAGE-BASE-DRIFT`) and at
  commit (`stagedPackageMatches`, `:145`); `apply` also needs `git status --porcelain` empty (`:354`). Any later commit
  (including a docs commit) invalidates the package; it must be rebuilt on the new HEAD.
- Verification in an isolated detached worktree under `plugins/tmp` (`:14,355-357`): `git apply --check --whitespace=error`
  (whitespace errors fail), exact changed-path set and per-file sha256 readback (`:363-367`). Then main-tree `apply` (`:369-371`).
- Signer and trust: proof is checked by `verifyPoApprovalProof` against an anchor chosen from the COMMITTED `HEAD` blob of
  `project/critical-human-proof.json` by `proof.keyReference` (`committedTrustPolicy`, `:159-179`); the file must be
  clean/identical in index and worktree. The current policy (v3) pins one anchor, `keyReference: local-po-key`
  (`project/critical-human-proof.json:9-14`), i.e. the PO's existing key - no new key needed. The signed digest is `intentSha256`
  = sha256(canonical{schema, baseCommit, unifiedDiff, expectedDigests}) (`:103-107`).
- No Verify evidence, Critic receipt, or dispatch record is checked by the module. (Process convention only: Critic review of
  the package before signing, `design/working-notes-2026-10/stage-plan-v3-2026-10-04.md:15-19`.) Commit-time: index must be
  EXACTLY the package paths with exact blob sha256 and mode (`:143-157`); nothing else staged.
- Commit message: trailer `Dispatch: quality-package-<intentSha256> (integration)` (`lib/commit-message-policy.mjs:90,118`),
  verified pre-commit by `hooks/guard-git.mjs:1086-1110` (`verifyQualityPackageIntegrationPreCommit`, `lib/sqp:302-309`) and
  post-commit (`:312-331`: single parent == baseCommit, changed-path set, blobs).

### 5.3 Route, step by step (as run for d6d2a8b2, `evidence/qp-d6d2a8b2/README.md:15-19`)
1. Agent: land every unprotected file of the stage as ordinary commits first (package binds HEAD + clean tree).
2. Agent: build the intent. No tracked builder exists ("a tracked builder is an R3 item", README:7); reuse the copy
   `evidence/qp-d6d2a8b2/build-intent.mjs` (needs clean tree, GNU `patch -p1`, retargeted TARGETS/PATCHES), writes the intent
   json and `scratch/<dir>/<name>-request.json` containing `{intentSha256}` (basename must contain `request`). Self-check with
   `check-intent.mjs` (HEAD==baseCommit, digest recomputes, `git apply --check`). Agent-runnable. Critic review of the package: convention.
3. PO (attended external terminal): `node "$PIPELINE_PLUGIN_ROOT/scripts/po-human-approval.mjs" sign-intent --repo-root "$REPO" --directory "$PO_DIR" --request scratch/<dir>/<name>-request.json`
   (`docs/po-human-approval.md:158-162`; absolute `--repo-root`; passphrase prompt). The proof lands at `$PO_DIR/proof-manual.json`
   and is mirrored beside the request in `scratch/` (`:172-`). The proof file must be reachable inside the repo for step 4.
4. Materialize `apply`: `node <plugin>/scripts/quality-package-materializer.mjs <root> <intent.json> <proof.json> <root>/project/critical-human-proof.json apply`
   (exactly 5 args after the script, all absolute canonical, intent/proof/policy regular single-link files inside the root:
   `lib/sqp:43-53`, `scripts/quality-package-materializer.mjs:6-16`). Admitted by the shell lane at `lib/guard/gate-strength-lane.mjs:282-308`
   only for this exact shape (7 words, no `;&|<>$`), but the 2026-09-30 transfer note records the read-only materializer
   command was blocked by the shell guard because an argument names the policy (`docs/0.7-alfred-transfer-2026-09-30.md:48-50`);
   treat step 4 as PO-run in an external terminal (precedent: PO ran `apply`).
5. Agent: `git add` of exactly the package paths (precedent: Elephant did this).
6. Materialize `authorize-commit` (same shape, last arg `authorize-commit`): PO-run; the agent route was refused with
   `GUARD-GATE-STRENGTH-SHELL` (README:17-18). Writes the receipt under the git common dir, `agent-pipeline/signed-quality-packages/commit-authorizations/<sha>.json` (`lib/sqp:189-191,232`).
7. Agent: `git commit -F <msg>` with `Dispatch: quality-package-<sha256> (integration)` and `AI-Assisted: true`. The pre-commit hook then skips protected-path findings (`:799,809`).
PO types: one `sign-intent --request` command, plus the `apply` and `authorize-commit` materializer commands (command shape above; no key paths).
Agent-only: build, check, add, commit. Human-only: the signature; materializer steps are PO-run in practice.

### 5.4 Fit for tranche 1
- One package, if all slice files plus `lib/guard/env-dump-lane.mjs` fit one base commit: the whole set lands in ONE commit
  (staged set must equal the package paths), signed once. It must contain only protected paths that need it? No: it may
  also carry unprotected files, but per stage-plan convention unprotected files go first as ordinary commits to keep the package small.
- Split into several packages only if a later part depends on a HEAD that includes an earlier part; each costs one signature and
  rebuild (HEAD drifts after each commit).
- Goes another way: `project/critical-human-proof.json` (refused by the module); any `.git/` path; `hooks.json` only if
  its commit-time admission is not wanted untested (see 5.1).
- Slice patches in `specs/sprint-alfred-epic/signed-package/` become input exactly as in `build-intent.mjs:51-66`: export HEAD
  versions of targets into `a/`, copy to `b/`, apply patch files with `patch -p1`, `git diff --no-index --src-prefix= --dst-prefix=`
  per path (note the `a/`+`b/` path prefixes in the paths of the rendered diff), digests from the `b/` files, `baseCommit`=HEAD.
- Open: the working tree must be clean at build and `apply`; the repository currently has unrelated dirty/staged files, which
  must be committed or removed first (not verified here).
