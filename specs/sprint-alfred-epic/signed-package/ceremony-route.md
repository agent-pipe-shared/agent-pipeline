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
