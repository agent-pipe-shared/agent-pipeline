# w313 — A combined short-flag cluster is admitted when every flag in it is admitted on its own (candidate 22 follow-up)

Delta on the candidate 22 follow-up chain (clone base 8627df377, two commits: the pinned tests first, then the change). Closest accepted criterion: AC-108 (PRD and Spec unchanged). Built by a Goldfish in a clone; delivered as a held patch. Finding: priority 5 and loop 6 of the Antigravity greenfield report (`grep -rn`, `rg -il` refused although the single flags are admitted; 18 tool calls in one run). PO decision of 2026-11-09: expand a short-flag cluster into its single flags and judge each with the existing per-command rule; the grammar of the guard may change for this.

## What

1. **`hooks/guard-command-grammar.mjs`: one shared helper `expandBooleanShortClusters(args, booleans)`.** A token `-xyz` (letters only, two or more) is replaced by `-x -y -z` only when the token is not itself an admitted flag and EVERY letter is in the caller's own set of boolean single-flags. Anything else (a letter that takes a value, a letter the command does not admit, a digit, a long flag, `-A5`) is passed through untouched, so the caller's existing one-token rules refuse it exactly as before. Tokens after `--` are never expanded. The members then run through the caller's per-flag loop, so a repeated flag (`-nn` in rg) is refused the way `-n -n` is.
2. **Three callers, one rule each, each with its OWN flag set** (nothing is shared except the expansion):
   - `validateRg` (single rg, both pipeline legs, the PowerShell route that reuses the same predicate): expands against `SEARCH_BOOLEAN`, or `FILE_BOOLEAN` for `rg --files` (which has no short flag, so nothing expands).
   - `isSafeExactGrepArgs` (single grep, the grep source leg of the grep and cat pipelines): expands against the grep boolean set (`-n -i -F -E -v -c -H -h -o`).
   - `isValidPipelineGrepArgs` (the grep sink): expands against the sink's narrower set (`-n -i -F -E -v -c`), so `| grep -ic x` is admitted while `| grep -io x` stays refused, exactly like `-i -o`.
3. **Hint for the cluster that stays refused.** `firstUnadmittedFlag` now also tries replacing a letters-only cluster token by its single flags (removing the token cannot show the cause: the value would be left behind), so `rg -nA 5 needle README.md` names `-nA` and `clusterSpellingHint` prints the existing sentence `... give each flag on its own: -n -A`. `clusterSpellingHint` returns null for a command the grammar already admits (it is never a refusal). Hint wording unchanged.
4. **Printed grammar list** (`lib/guard/grammar-denials.mjs`): one added clause in the "listing and context forms" entry: rg and grep take a combined cluster of flags that are each admitted on their own and take no value (e.g. `-in`); a flag with a value, such as `-A` or `-m`, stays separate. Comment in `isSafeExactGrepArgs` that said a clustered flag stays refused now says a cluster holding a context flag (`-nC5`) does.
5. **Tests, in the existing registered suite `lib/read-command-diagnosis.test.mjs`** (written first and run red against the original code before any production edit; the red run failed RCD19, RCD20 and RCD21):
   - RCD19: a 55-row table over rg and grep, each row `[cluster, spelled-out, cluster admitted, spelled-out admitted]`. The spelled-out column is asserted too (baseline unchanged) and no row may admit a cluster whose spelled-out form is refused. Rows cover: boolean clusters (admitted), repeated flag, every value-taking member (`-A -B -C -e -m -t -g -f`; refused although the spelled-out form is admitted), members not admitted on their own (`-u -L -z -h -r -P` for rg; `-r -R -l -P -s -z -e -f` for grep, among them the motivating `grep -rn`), path escape (`../outside.txt`, `~/.ssh/id_rsa`), `--` followed by a cluster-shaped pattern, and the pipeline legs (rg-to-head, rg-to-rg, grep-to-head, grep-to-grep with the narrower sink, cat-to-grep).
   - RCD20: the hint for a value-taking cluster (function and printed refusal), and no hint for an admitted cluster.
   - RCD21: runner reach. The same four commands go through `evaluateLifecycleReadyGuard` with runner `claude`, `codex` and `antigravity`, and through the PowerShell tool; plus a source pin that the Codex and Antigravity pretool guards run the one lifecycle guard.

## Where each route reads the grammar (measured, not assumed)

- Elephant and Claude children (Goldfish, Critic): `lib/guard/evaluate.mjs` calls `isReadOnlyDiagnosticCommand` (`lib/guard/shell-grammar.mjs`), which calls `validateRg` / `isSafeExactGrepArgs` / the pipeline predicates above.
- Codex: `hooks/codex-pretool-guard.mjs` fast-paths with the same `isReadOnlyDiagnosticCommand` and runs `guard-lifecycle-ready.mjs --runner codex` for the rest.
- Antigravity (parent and child route): `hooks/antigravity-pretool-guard.mjs` runs `guard-lifecycle-ready.mjs --runner antigravity` and uses `isSanctionedLifecycleCommand` from the same catalogue.
- PowerShell tool: `lib/guard/powershell-dialect.mjs` hands the argv to `isReadOnlyDiagnosticCommand` as an `rg` string.
- There is no second copy of the rg or grep flag lists on any route; label-only code (`qp4ReadTargetOperands`, `read-scope.mjs` missing-target diagnosis) never admits a command and already reads clusters.

## Why nothing becomes reachable that was not

- A cluster is rewritten only to flags the same command admits on its own, in the same set, through the same loop, with the same operand, path, containment and credential checks after it. The table asserts, for every row, that a cluster is never admitted where its spelled-out form is refused.
- A value-taking flag in a cluster is never expanded, because it is not in the boolean set, so it keeps being refused (the value would otherwise be read as the pattern or a path).

## Not changed (and why)

- `grep -r`/`-R`/`-l`/`-s`/`-z`/`-P` and rg `-u -L -z -h -r -P`: not admitted on their own, so not in a cluster either. The motivating `grep -rn` therefore stays refused (`-r` is recursion, not admitted for grep at all); `rg -il` and `grep -in` are the forms that now work. If the PO wants recursive grep, it is a separate grammar decision, not a cluster question.
- Attached values (`-A5`, `-m5` in rg) and `--flag=value` stay refused as before; the existing hints are unchanged.
- `ls` clusters (`-la`): own rule (`isNamesOnlyLsArgs`), not this slice.
- `templates/prompts/agent-obligations.md` and its generator: nothing in them states that a cluster is refused (the `rg -rn` note is about `-r` meaning replace, still true), so they are untouched.
- The Critic preimage list and every file it covers: not touched. `harness/verify-suites.json`, the case registry and the inventory: outside this patch.
- The existing grep case that lists `grep -nC5` among refused spellings (`grep-max-count-read.test.mjs`) stays unchanged: a cluster holding a context flag is still refused.

## Restated in place (QG-04, nothing weakened)

- RCD17 pinned `rg -ln` as refused. The fixture moved in place to the refusal that must stay (`rg -nA 5`, refused although `rg -n -A 5` is admitted); its assertions about the hint (never for a single or long flag, a pipeline, an unadmitted split or a missing command) are unchanged in kind, with a comment.

## Not proven / open

- Test counts are in the Goldfish report; the full Verify, an independent Critic review and PO acceptance are pending (Coordinator).
- Real `rg` and `grep` binaries were not run: equivalence is proven at the grammar level (the verdict of the guard), not by executing the commands. rg treats `-ln` as `-l -n` and so does GNU grep; that is documented behaviour, not measured here.
- Windows-native `rg.exe`/`grep.exe` pipeline dialect (`windows-readonly-pipeline`) shares the same predicates; it was exercised only through the PowerShell tool case on this machine.
- Other suites that read the grammar were run one at a time and are named in the report; any suite not named there was not run.
