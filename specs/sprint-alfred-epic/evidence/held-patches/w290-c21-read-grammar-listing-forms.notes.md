# w290 — the read grammar admits the listing and context forms workers reach for first (candidate 21, live findings 12 and 16)

Delta on the candidate 21 chain (clone base a5edaa1ad). Closest accepted criterion: AC-108 (PRD and Spec unchanged). Built by a Goldfish in a clone that carries the chain; delivered as a held patch.

## Why

Three greenfield runs on 20j lost two or three calls per implementation worker to GUARD-READ-COMMAND-UNSUPPORTED or GUARD-READ-TARGET on harmless reads inside the project: `rg --files src tests docs/contracts` (Codex), `grep -n -C 5 <word> <file>` (Antigravity, twice each), `ls -R src tests docs/contracts` (Claude) and the native Glob calls `{pattern: "**/*", path: <root>/src}` and `{pattern: "tests/**/*", path: <root>}` (Claude).

## What was measured first (the briefing's premise held for two of the four forms only)

- `rg --files <dirs>` and `ls -R <dirs>` over EXISTING plain directories are already admitted at the clone base, by the Bash grammar and by the full guard verdict (the Bash, Codex and Antigravity routes share it). They were not the cause.
- The same two commands ARE refused (GUARD-READ-COMMAND-UNSUPPORTED) when one listed directory does not exist yet, which is the normal state of a greenfield project (`docs/contracts` before the contract is written): `ls` was not in the set of commands whose missing in-root operand is diagnosed as an existence probe (G20-67), and for `rg --files` the first operand was skipped as the search pattern, so a missing first directory stayed refused. This is the reproduced, evidenced cause; the live transcripts themselves were not read.
- `grep -n -C 5 <word> <file>` and the native Glob forms are genuinely refused: grep had no context flags, and `qp4InRootWildcardListing` refused a `**` segment.

## What it changes (all under plugins/pipeline-core/)

- `lib/guard/shell-grammar.mjs` (`isSafeExactGrepArgs`): grep -A, -B, -C with one 1..3 digit value each, separate (`-C 5`) or attached (`-C5`), one use per letter. The same predicate is the grep-to-grep / grep-to-head pipeline source, so those get it too; the pipeline SINK predicate is untouched.
- `lib/guard/read-scope.mjs`: (a) `ls` joins QP4_MISSING_DIAGNOSED and `rg --files` no longer skips its first operand as a pattern, so a listing whose only fault is a missing in-root directory is admitted like the one-file existence probes (secret-named, hidden-segment, outside-root and credential-tree operands keep refusing because the stand-in test is the grammar itself); (b) `qp4InRootWildcardListing` admits a trailing `**/*` after a wildcard-free literal prefix (`**/*` with path a subdirectory, `tests/**/*` with path the root), judged by the same whole-tree secret screen and hidden-directory walk (entry and depth bounds) as `<dir>/*`; the recursive form additionally refuses the project root itself explicitly; (c) the GUARD-READ-TARGET Glob text names `<directory>/**/*`.
- `lib/guard/grammar-denials.mjs`: one new ADMITTED_GRAMMAR_SHAPES row (example `rg --files docs`) that names the listing and context forms.
- Tests: `grep-max-count-read.test.mjs` (grep context), `hooks/guard-lifecycle-ready.test.mjs` (two C21 cases: Glob recursive listing and the missing-directory listing), `lib/powershell-bash-guard-parity.test.mjs` (disposition row for the new shape, a C21 case that the printed grammar names the forms and that PowerShell judges them as before, and one existing case restated in place under QG-04, see below).

## Deliberately not changed

- `ls` flag allowlist: NOT applied. Today `ls` falls through to the generic read rule and admits any flag over approved operands (`ls -la`, `ls -lah`, `ls -Rl`, `ls --color=always` are admitted). The briefed allowlist (-l -a -R -1 -h) would NARROW that guardrail, not widen it, and could turn existing admissions refused. The new shape row names the flags the findings used; the narrowing is left for a decision.
- rg attached context values (`rg -C5`): left refused. `rg -A/-B/-C N` in the separate spelling is already admitted, and the existing case RCD14 (`read-command-diagnosis.test.mjs`) pins that `rg -n -A8 ...` is refused with the separate-spelling hint (w157). Admitting it needs `validateRg` in `hooks/guard-command-grammar.mjs` plus a restatement of RCD13/RCD14; grep got both spellings, rg keeps the hint. One-line follow-up if wanted.
- No new rg or grep flag, no `--pre`, no `-f`, no `--exec`-like option, no redirect, no long context spelling (`--context`), no clustered `-nC5`.
- The credential screen, the outside-root handling and every path-scope function are untouched.
- PowerShell: unchanged. It admits a read-only rg like Bash (so the new row's `rg --files docs` example is admitted there) and refuses grep and ls (not PowerShell commands); asserted.
- The denial text has no absolute byte bound to stay under (the 2048-byte bound in `greenfield-machine-output-and-skill-budget.test.mjs` covers the override guidance only); the new grammar row is 334 bytes (the printed list is now 2754 bytes). The Glob refusal sentence grew by 177 bytes (measured by a scratch script, not a gate).

## QG-04 restatement (one existing case)

`powershell-bash-guard-parity.test.mjs`, "a native read of a project directory that is not a protected root ...": it refused `Glob {pattern: "**/*", path: <root>/project}` and read the refusal text. That exact form is the one the briefing admits. Restated in place with a comment: the refusal text is now read from the same listing over the project root (still refused), and the subdirectory form is asserted admitted. No assertion was dropped.

## Test-first record and checks

- RED against the clone base (before the first production edit): `grep-max-count-read.test.mjs` 1 of 2 failed (grep -n -C 5 refused); `guard-lifecycle-ready.test.mjs --name "C21 "` 2 of 2 failed (Glob `**/*` refused, `ls -R ... missing-dir` refused); `powershell-bash-guard-parity.test.mjs --name "C21 "` 1 of 1 failed (grammar text did not name rg --files).
- GREEN, one suite at a time in the clone (`test-in.mjs`): grep-max-count-read 2/2; powershell-bash-guard-parity 7/7; read-command-diagnosis 18/18; g23-quoted-pipeline-reads 5/5; diagnostic-toil-cross-runner 12/12; guard-lifecycle-ready (first full run before the example fix) 433 tests, 429 pass, 1 fail, 3 skipped, the one failure being DoD 5; after the fix `--name "NVA-I-GRAMMAR DoD 5|C21 "` 3/3. w290 check test 2/2.
- Case changes after step 1, with the criterion tie: (1) the grammar row example is `grep -n -C 5 needle probe.txt`, not `rg --files docs`: two other suites run every printed example against a fixture that only has `probe.txt` (no `docs/`), and the raw grammar has no existence-probe lane. (2) The parity needles are the printed spellings (`-A N`, `"ls" with -l -a -R -1 -h`). (3) In the missing-directory case, `ls vault/missing` is pinned ADMITTED (a names-only `ls vault` is admitted at the base, so the existence probe of a missing child follows the same rule and reads nothing) and `ls -R vault/missing` stays refused (the recursive screen fails on the credential file).
- Codex and Antigravity reach the new admission: both run `guard-lifecycle-ready` for any command the raw grammar does not already admit, which is where the existence-probe branch lives.
- GMWKC01: no new import was added to any guard module (`resolve`, `realpathSync`, `join` were already imported in read-scope.mjs).
- NOT yet run: read-blocks-and-misleading-denial-texts-across-runners, the two pins that import the shapes table (advertised-git-to-head, agent-obligations-says-no-and-and), and a clean full re-run of guard-lifecycle-ready after the example fix.

## Not proven

- Whether the live transcripts' refusals were the missing-directory cause (reproduced in a fixture, not read from the transcripts) or a whole-tree credential-screen refusal on a real tree (unchanged by design).
- Listings of very large trees: the hidden-directory walk refuses above 5000 entries, so `**/*` over a huge directory stays refused (fail closed).
- No Full Verify, no Critic review (batch gates, not this item's).
