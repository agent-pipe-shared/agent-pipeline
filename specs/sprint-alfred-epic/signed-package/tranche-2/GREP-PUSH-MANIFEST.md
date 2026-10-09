# GREP-PUSH-MANIFEST (dispatches GREP-PUSH-T-20261009b, GREP-PUSH-T2-20261009)

Test-only. One block is inserted into the tranche-2 guard-push test post-image. No guard post-image, no live hook, no `lib/` file and no existing case is touched.
Ruling 157 (GREP-PUSH, against the default) exempts the candidate markers `(` `)` `{` `$` and the backtick after the subcommands commit, grep, log, show, diff and status. Ruling 81 named the trigger.

## 1. Post-image digests

| Post-image | sha256 (bytes, lines) | Inserted block (new line range) |
|---|---|---|
| `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-push.test.mjs` | `68def38e9e29c8b7bdf7a75a0b491c5fc17d0f56ade318e2b9d7f34d60904fa5` (132189, 2549; was 125779, 2478) | 71 lines, 2459-2529: the GREP-PUSH-T comment and 27 admitted pins `PGM-A01`-`PGM-A27` plus 22 refused pins `PGM-R01`-`PGM-R22`, inside the existing `trc-classifier` block |

Base (the TR-C-T5 state recorded in `TR-C-MANIFEST.md`): `f6ebe7a92c349650f23500190b141ef7c255a334bc5bda29f6aeb09039210152` (125779, 2478). The new digest was re-measured by this dispatch from the file on disk before the commit.

## 2. Per-pin state

Measured (`evidence/GREP-PUSH-T-20261009/red.txt`, written by `capture-evidence.mjs`; WSL; wrapped exit code 1). Redirect line `GREPPUSHT-REDIRECT-FIRED guard-push.mjs (252 guard-process loads served from the tranche-2 post-image)`, so the run was not against the unmodified live guard.

| Pins | Kind | State | Reason |
|---|---|---|---|
| `PGM-A01`-`PGM-A27` | admitted: a commit, grep, log, show, diff or status carrying a marker `(` `)` `{` `$` or backtick | RED (27 FAIL) | exit 2 (expected 0), "push target is not unambiguous": refused on the marker rule alone |
| `PGM-R01`-`PGM-R22` | refused: a push hidden in `$( )`, backticks or `<( )` in any argument; a push-capable subcommand or alias form carrying a marker | GREEN (22 PASS) | stay refused, as intended. The block builder's counter said 23; the real count is 22 (R01..R22) |
| `PG-CHECKPOINT`, `PG-CHECKPOINT-WORKTREE` | pre-existing | FAIL (known) | exit 2, "signature mode requires a current approval": fail identically in every earlier capture |

Everything else in the capture passes (222 PASS lines in total). The only FAILs are the 27 `PGM-A*` pins and the known checkpoint pair.

PGM-A22 (a nested NON-push git command inside `$( )` on diff): Elephant ruling, kept. Ruling 157 refuses only a nested PUSH; a nested non-push command is admitted. It is the one pin GREP-PUSH-F may contest, because it goes beyond the literal ruling text.

## 3. Method

Command (WSL; the load-hook redirect entries, `register.mjs` and `redirect-hooks.mjs` live under `scratch/dispatch-wip/GREP-PUSH-T/`, git-ignored; the redirect serves the tranche-2 guard post-image):
`wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/GREP-PUSH-T-20261009/red.txt --label red -- node --test scratch/dispatch-wip/GREP-PUSH-T/guard-push.pgm.test.mjs"`.
This dispatch did not re-run the suite.

## 4. The F target (GREP-PUSH-F)

- File: `plugins/pipeline-core/lib/git-cmd.mjs`, function `commandIsGitPush`, the marker rule. The file is kernel-listed (NEVER_LIFTABLE), so GREP-PUSH-F lands as a tranche-2 `lib/` post-image.
- `guard-push` needs no change: it calls `commandIsGitPush` and allows when it returns false.
- Existing pins F must flip or re-aim: `PGC-T38b`, `PGC-T38c`, `PGC-T80a`, `PGC-T80b`, `PGC-T42b`, `PGC-T42c`, `PGC-T82b`, `PGC-T82c`, and the `HEREDOC_PAREN` control `PGC-T5F3a` if heredoc commits are admitted.

## 5. GREP-PUSH-F (dispatch GREP-PUSH-F-20261009): the `lib/git-cmd.mjs` post-image

Status of this section: the post-image is built and probed in-process; the WSL suite captures are `evidence/GREP-PUSH-F-20261009/after-guard-push.txt` and `after-guard-git.txt` (see "Contradiction" below for why the commit was NOT made).

| Post-image | Target | Base blob / base sha256 (bytes, lines) | Post sha256 (bytes, lines) |
|---|---|---|---|
| `specs/sprint-alfred-epic/signed-package/tranche-2/lib/git-cmd.mjs` | `plugins/pipeline-core/lib/git-cmd.mjs` (kernel-listed, NEVER_LIFTABLE: the ceremony copies it, nothing else edits it) | `cda79122b54bc097c10ec78ecda3984eb09851d1` / `e6ae412caba75a418ec940148187962e7ae25d274f705a3ae4df98f0b74cd1c5` (75451, 1334) | `0130bcd6c1645273c6a31eb6e1894b6c6dc9ba83f51383836749f4f2980c7a34` (81374, 1443; +109) |

Four anchored edits, each asserted to match exactly once: (1) `hasFailClosedMarker` gains `export` and keeps its semantics; (2) `commandIsGitPushAt` line `if (hasGitWord(cmd) && hasFailClosedMarker(cmd)) return true;` gains `&& !markerRuleIsInert(cmd, depth)`; (3) the new block (`MARKER_EXEMPT_*` constants, `doubleQuotedSubstitutions`, `markerRuleIsInert`) before the GITCLS-F comment; (4) a header paragraph before the "Without a marker" paragraph.

Export for the Why-line test (TR-C note, Ruling 162): `hasFailClosedMarker(cmd)`, with unchanged live semantics, so "a marker is the cause of this refusal" stays answerable without copying `FAIL_CLOSED_MARKER_RE` and the nested-shell regexes. The exemption is a separate unexported helper consulted only inside `commandIsGitPushAt`.

Rule. The five characters `$` backtick `{` `(` `)` stop being a marker only when the whole text is ONE single-line simple command `git <sub> ...` with `<sub>` literally commit, grep, log, show, diff or status directly after the git word, and every such character sits inside a quoted span. Never exempt: a backslash or line break anywhere (so heredoc commits and BRE backslash patterns keep refusing), an unquoted `; & | < > # $ { } ( )` or backtick, a global option before the subcommand (so `-c alias.x=!...` cannot rename a push), a non-ASCII quote, a nested shell, a here-document receiver. A command substitution inside a double-quoted span (`$( )` or a backtick pair) is exempt only when it is a simple command of plain word characters that `commandIsGitPushAt` itself classifies as not a push (this admits PGM-A22 and refuses PGM-R01-R12); any other `$` form (`${`, `$((`, `$'`) is not modelled and refuses. Only the marker reason is lifted: the here-document receiver, `env -S` and `classifyPush` (three readings) rules still run on the same text.

Measured in-process (a child node serving the post-image under the live module URL; `scratch/dispatch-wip/GREP-PUSH-F/build.mjs`, exit 0): `commandIsGitPush` is `false` for all 27 `PGM-A01`-`A27` and `true` for all 22 `PGM-R01`-`R22`, and `true`/`false` as intended for 24 further commands (chained push after an exempt commit, `${X:=git push ...}$(eval $X)`, `$(X=git;$X push ...)`, `sudo`/`xargs`/`env`/`command`/`git --no-pager`/`git -C .` pushes inside `$( )`, an unquoted `$( )`, a trailing `# git push`, a heredoc commit, a `-c alias` form, an unterminated quote, a backslash BRE pattern, an unbalanced `)` inside double quotes, a nested `bash -c`, and three plain controls).

| Pins | Predicted result against the post-image | Basis |
|---|---|---|
| `PGM-A01`-`PGM-A27` | GREEN (were RED) | in-process probe, 27 of 27 |
| `PGM-R01`-`PGM-R22` | GREEN (stay) | in-process probe, 22 of 22 |
| `PGC-T38b`, `PGC-T38c` | RED (were GREEN) | by construction: `GREP_PAREN` is byte-identical to the `PGM-A08` command, expectation BLOCK versus ALLOW |
| `PGC-T82b`, `PGC-T82c` | RED (were GREEN) | by construction: `TRAILER_PAREN` differs from the `PGM-A03` command only in the dispatch id text |
| `PGC-T80a`, `PGC-T80b`, `PGC-T42b`, `PGC-T42c`, `PGC-T5F3a`, `PGC-T85d` | GREEN (stay) | the BRE form holds a backslash, the heredoc forms hold a line break, T85d holds a nested `bash -lc` |

Contradiction (why F did not commit): the F briefing's DoD wants only the known `PG-CHECKPOINT` pair red and forbids any test edit, while this manifest (section 4) names `PGC-T38b/c` and `PGC-T82b/c` as pins F must flip. No `lib/` rule can make `PGM-A08` ALLOW and `PGC-T38b` BLOCK for the same command string. A test re-aim dispatch (QG-04: not the implementer) must re-aim those four pins in the tranche-2 guard-push test post-image (to the ALLOW expectation, or drop them as duplicates of `PGM-A08` and `PGM-A03`) before or together with the commit of this post-image.

Also flips outside the DoD: the accepted-false-positive pins of `plugins/pipeline-core/lib/git-cmd.test.mjs` (the quoted `git commit -m "$(date)"` candidate around lines 960-967 and any like it). Running that live test file against the post-image exits 1; the failing names were not captured by this dispatch. The live test is outside the F scope and was not edited.

Independent review: pending.
