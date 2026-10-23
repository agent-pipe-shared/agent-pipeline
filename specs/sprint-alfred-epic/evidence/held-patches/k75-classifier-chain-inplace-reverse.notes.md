# K75-A2-THREE-CLASSIFIER-DEFECTS notes

Ruleset 0.7.0+claude.20261022204428.79cda46; model Sonnet 5.5; clone `scratch/clones/k75` (reverted to clean HEAD after export). Nothing committed.

## Protection evidence
- `plugins/pipeline-core/lib/protected-test-paths.mjs` is in `NEVER_LIFTABLE_KERNEL_PATHS` (`plugins/pipeline-core/lib/guard-maintenance-window.mjs`, line 213) -> kernel, PO/operator commit only.
- The two pin files (`lib/pins/git-stash-list-classified-as-working-tree-write.test.mjs`, `lib/pins/hgo-patch-preflight-before-signature.test.mjs`) match no protected pattern, but they are green only with the kernel change -> exported as a diff, not committed.
- `lib/protected-test-paths.test.mjs` matches the protected-baseline test pattern; it was NOT edited (no change needed, 40/40 before and after).

## Deliverables (main checkout, both pass `git apply --check`)
- `scratch/agent-out/k75-protected.diff`: `lib/protected-test-paths.mjs` only.
- `scratch/agent-out/k75-unprotected.diff`: the two pin files (todo markers removed; 2 new negative-control tests added; no assertion changed or removed).

## What changed (protected-test-paths.mjs)
1. `readOnlyGitApplyCheckArguments`: admits one `--reverse` directly before or directly after `--check`. Also used by `lib/guard/shell-grammar.mjs` (read-only preflight lane), so that lane now also admits the same two spellings. Plain `git apply P`, `--reverse P`, duplicated `--reverse`, `--reverse --whitespace=.. --check`, `--index` etc. still refuse.
2. In-place detection regex `/^-[a-z]*i(?:[a-z]*|[^a-z].*)$/u` (was `[a-z]*` only): glued suffix `-i.bak` for perl/ruby (sed already worked).
3. New helper `isClosedStashReader` (extracted verbatim from the parsed lane) and `gitChainWriteTargets`: in the unparsed-command fallback, the raw text is split at `&&`, `||`, `;`, `|`, `&`, newline; each segment starting with `git` gets the parsed lane's verdict (GIT_WRITE_VERBS, index-only exemption, closed stash readers only when verb index is 0). A chain whose only writer is a git verb returns just those verb targets (lane `git-working-tree-write`, classification `conservative-possible-write`), not every raw path token.

## RED -> GREEN
Todo test blocks: 4, not 5 (stash chain x1 covering 3 chains + 1 more chain, perl x1, ruby x1, HGO x1 covering 2 spellings).
- stash pin: base 87 tests / 84 pass / 3 todo -> after 88 / 88 / 0 todo (+1 new negative-control test).
- hgo pin: base 13 / 12 / 1 todo -> after 14 / 14 / 0 (+1 new negative-control test).
Other classifier suites (identical before/after): protected-test-paths.test 40/40; guard/git-stash-readonly.test 34/34; escaped-and-powershell-redirects 35/35; script-mediated-writes 14/14; shell-classifier-faults-on-heredoc 7/7; scratch-must-remain-writable 12/12; quoted-redirect 17/17; protected-baseline 12/12; guard-maintenance-window-kernel-closure 1/1; guard-devplan-policy 6/6; hooks: guard-testpath 21/21; guard-testpath-override 1/1; guard-devplan 1/1; guard-lifecycle-ready 392 tests / 389 pass / 3 skipped (both runs).
- `hooks/guard-apply-patch.test.mjs`: RED BEFORE and AFTER, identical (1 test, 2 inner cases, ~245 s each time; "lifecycle guard invoked per patched path with explicit codex runner" and "empty V3 onboarding root reaches the native Codex apply-patch chain"). Unrelated to this change (pre-existing, possibly load/timeout); not fixed. Logs: `scratch/agent-out/k75-base-hooks-guard-apply-patch.test.mjs.log`, `k75-after-hooks-...`.
- `check-consumer-safe-paths.test.mjs`: 9/9 pass.

## Negative controls (all still blocked, pinned)
Mutating stash chains (`list && pop`, `pop && list`, `list && drop`, `list && list && push`, `list || pop`, `list; drop`, `status && stash push`, `-C . stash list && stash pop`, `show && clear`); `git apply P`; `git apply --reverse P`; check+reverse chained with a real apply.

## Risk / open items
- Behaviour change beyond the three defects: any `&&`/`;`/`||` chain containing a git write verb with a pathspec (e.g. `git status && git checkout src/app.js`) now yields a git-working-tree-write target, where it was previously admitted. This is the intended direction (same verdict as the lone command) but is wider than the stash case; the Critic should look at it. Splitting ignores quoting (over-split only adds candidates).
- Pre-existing gap, unchanged: a bare `git stash` (push) yields no operand, so neither the parsed lane nor the chain fallback names a target for it.
- The shell-grammar read-only lane (`lib/guard/shell-grammar.mjs`, protected) now admits `--check --reverse` as read-only; it is exercised by guard-lifecycle-ready tests (green) but has no dedicated case for the new spelling.

## Proposed commit message (operator commit, one commit for both diffs)
```
fix(guard): classify stash chains, perl/ruby -i.bak and git apply --check --reverse

- unparsed-command fallback names git working-tree write targets per chain segment
- in-place detection accepts a glued suffix (-i.bak) for perl and ruby
- readOnlyGitApplyCheckArguments admits --reverse beside --check
- pins: drop todo markers of the five RED cases, add negative controls

AI-Assisted: true
Dispatch: K75-A2-THREE-CLASSIFIER-DEFECTS (goldfish)
```
(Body line "five RED cases": the actual count is 4 test blocks / 6 command spellings; adjust wording if preferred.)
