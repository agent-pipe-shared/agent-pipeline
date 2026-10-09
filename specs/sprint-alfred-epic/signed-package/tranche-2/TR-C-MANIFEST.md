# TR-C manifest: push and git classifier scoping pins (dispatch TR-C-T-20261009)

Two tranche-2 post-images that REPLACE committed contract tests (TP-5 and TP-1). Each is the committed live file plus ONE
inserted block of new cases (nothing existing is edited or removed, except the two declared fixture-literal substitutions in the guard-push post-image, see "Declared substitution"). The ceremony copies each post-image over its target
unchanged. Everything below is repo-relative. Digests are over the committed LF bytes.

Contract: `specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md` section 2 rows T38, T42, T51, T80, T82, T85
(slice TR-C, section 5 row 6), read together with Ruling 81 (GREP-PUSH, a PO decision: option B of the fail-closed marker
rule is KEPT, relief is procedural) and Ruling 80 (contract tests land as tranche post-images). Section 6 decision 1
(T42, keep PG-HD1's allow) applies at its default.

## Post-images

### 1. guard-push.test.mjs (TP-5)

- Target path: `plugins/pipeline-core/hooks/guard-push.test.mjs`
- Post-image: `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-push.test.mjs`
- Base blob: `17d4313347a0f869031a450a70db0aba279b2abe` (live file at the dispatch; 2385 lines). Post-image: 2456 lines (71 inserted: the 70-line block plus one blank separator).
- sha256: `6c6b153faba1da5032536a7f4b3241cd229c0fefa4a699b8b5b7a6c7127023a1` (123784 bytes; after the declared substitution of TR-C-T3, TR-C-T4 amendment)
- Insertion: one block (18 cases, ids `PGC-*`) directly before the `// ---- Cleanup` comment. No import changes.
- WSL command (run on the scratch copy, see Evidence): `wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-C-T-20261009/red.txt --label red -- node --test scratch/dispatch-wip/TR-C-T/guard-push.test.mjs scratch/dispatch-wip/TR-C-T/guard-git.test.mjs"`
- Ceremony command after placement: `wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node --test plugins/pipeline-core/hooks/guard-push.test.mjs"`

### 2. guard-git.test.mjs (TP-1)

- Target path: `plugins/pipeline-core/hooks/guard-git.test.mjs`
- Post-image: `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-git.test.mjs`
- Base blob: `f73d0b44abb17380ec82b8242f25e93b4057e38d` (live file at the dispatch; 1561 lines). Post-image: 1607 lines (46 inserted: the 45-line block plus one blank separator).
- sha256: `05e6d7a23f618323d408709fefc0c541ed572a12c8c46a1f9e8409d531589fdc`
- Insertion: one block (6 cases, ids `GG22-T51a` to `GG22-T51f`) directly before the `// ---- Summary` comment, reusing the
  file's own `gg22PathspecDebtFixture`. No import changes.
- WSL command: the same combined command as above; ceremony command after placement:
  `wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node --test plugins/pipeline-core/hooks/guard-git.test.mjs"`

Install: copy each post-image to its target path unchanged, after confirming `git hash-object <target>` prints the base blob.

## Evidence (machine-written captures)

- Baseline of the UNMODIFIED live files, taken first: `evidence/TR-C-T-20261009/baseline.txt` (guard-git 247/247; guard-push
  177/179, the two failures being `PG-CHECKPOINT` and `PG-CHECKPOINT-WORKTREE`, exit 2 "signature mode requires a current
  approval", present before this change and untouched by it).
- The new pins: `evidence/TR-C-T-20261009/red.txt` (wrapped exit code 1, from the failures listed below). Result: guard-git
  250/253, guard-push 190/197. Every pre-existing case has its baseline result: 247 + 177 passes before, 247 + 177 passes in
  the run (250 - 3 and 190 - 13 new greens), and the only pre-existing failures are the same two PG-CHECKPOINT cases.
- The run used scratch copies under `scratch/dispatch-wip/TR-C-T/`. They differ from the post-images ONLY in the 5 (push) or 3
  (git) `../lib/` import lines and the one `GUARD` url line (`build.mjs final` re-derives the scratch copy and refuses unless it
  equals the file that ran, then writes the post-images). The post-images themselves were written by that Node script, not by
  the Write tool.

## Per-pin state (before the F slice)

RED means the pin fails today for the stated reason and turns green when the TR-C F slice lands. GREEN means it passes today
and must keep passing.

Needles for the refusal-text pins (the contract the F slice must satisfy): `git commit -F` and `use rg`, both literal,
case-sensitive substrings of stderr. They are literals on purpose: the bare letters `rg` also occur inside the word `target`
in today's text, so a looser needle would pass vacuously. Today's text is "BLOCKED (guard-push, plugin pipeline-core): push
target is not unambiguous." plus a Reason line, which contains neither.

### guard-push (fixture: an active push gate with verify evidence, so a refusal is observable)

| Pin | Row | State | Reason |
|---|---|---|---|
| PGC-T38a plain `git grep -n needle -- README.md` allowed | T38 | GREEN | no marker, not a push candidate |
| PGC-T38b `git grep -n "(alpha|beta)" ...` still refused | T38 | GREEN | `(` marker; Ruling 81 option B accepted false positive |
| PGC-T38c refusal text names the relief shapes | T38 | RED | text lacks `git commit -F` and `use rg` |
| PGC-T80a `git grep -n -e "\(alpha\|beta\)" ...` (quoted BRE alternation) still refused | T80 | GREEN | `(` and backslash markers; Ruling 81 keeps option B (supersedes the design's "route git grep to the read classifier") |
| PGC-T80b refusal text names the relief shapes | T80 | RED | same text gap |
| PGC-T42a heredoc commit message with no marker allowed | T42 | GREEN | PG-HD1's allow is consistent; no flip (decision 1 default) |
| PGC-T42b heredoc commit message holding `(goldfish)` still refused | T42 | GREEN | `(` marker; accepted false positive |
| PGC-T42c refusal text names the relief shapes | T42 | RED | same text gap |
| PGC-T42d `git commit -F scratch/commit-msg/slice.txt -- docs/a.md` allowed | T42 | GREEN | the relief shape carries no marker |
| PGC-T82a printed `git commit -m ... --trailer ...` allowed when the trailer values hold no marker | T82 | GREEN | Ruling 81 probe: not a candidate |
| PGC-T82b the same form with `Dispatch: ... (goldfish)` still refused | T82 | GREEN | `(` marker; accepted false positive |
| PGC-T82c refusal text names the relief shapes | T82 | RED | same text gap |
| PGC-T85a `git --version` allowed | T85 | RED | refused today with "push target is not unambiguous": fail-closed check 2 (a `git` word followed by an option the global-option whitelist does not know) routes it to the push gate; not a marker, so Ruling 81 does not keep it |
| PGC-T85b `git version` allowed | T85 | GREEN | subcommand, not an option |
| PGC-T85c `git -C . status --short` allowed | T85 | GREEN | recognised global option before a non-push verb |
| PGC-T85d `wsl.exe -e bash -lc "cd /mnt/d/repo; git status"` still refused | T85 | GREEN | nested `bash -lc` marker; named accepted false positive in `lib/git-cmd.mjs` |
| PGC-T85e `wsl.exe -e bash -lc "git push origin main"` refused | T85 (I5) | GREEN | a real push stays fail-closed |
| PGC-T85f `git --no-pager push origin main:refs/heads/feature-test` refused | T85 (I5) | GREEN | a real push after a global option stays fail-closed |

guard-push totals: 18 new pins, 13 GREEN and 5 RED (T38c, T80b, T42c, T82c, T85a).

### guard-git (fixture: `gg22PathspecDebtFixture`, status-flip debt plus an unrelated staged source file)

| Pin | Row | State | Reason |
|---|---|---|---|
| GG22-T51a pathspec ledger commit with two `--trailer` values allowed | T51 | RED | exit 2 today: `--trailer` and its value are in no safe list, so the pathspec is not provably exclusive and the full-index check blocks on the unrelated staged file |
| GG22-T51b the `--trailer=<value>` spelling allowed | T51 | RED | same cause |
| GG22-T51c `--trailer` with a source-path pathspec still blocked (GG-22, names `backlog/items/demo.md`) | T51 | GREEN | the addition widens nothing |
| GG22-T51d `-i` beside `--trailer` still blocked (GG-22) | T51 | GREEN | `-i` still widens to the staged index |
| GG22-T51e `--no-verify` beside `--trailer` blocked (exit code only) | T51 (I3) | GREEN | hook bypass stays impossible |
| GG22-T51f the same command reports `GG-17` | T51 (I3) | RED | exit 2 matches but stderr has no `GG-17`: another rule answers first. Hypothesis, not measured: GG-22's full-index block fires before the bypass rule; it should turn green once T51a/b land |

guard-git totals: 6 new pins, 3 GREEN and 3 RED.

## Declared substitution (TR-C-T3, recorded by TR-C-T4)

- Where: `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-push.test.mjs`, lines 123 and 130, inside `configureAnonymousPublicPush`. The same two lines were substituted in the scratch copy.
- Scan category: `email`.
- New literal: `pipeline-fixture@example.invalid` (replacing the configured commit e-mail, which is deliberately not written here).
- Reason: the pre-commit private-identifier scan refuses the configured commit e-mail on a newly added path (toil T104). Nothing in the file compares that value with the repository's identity (checked in TR-C-T3).
- Verification capture: `evidence/TR-C-T3-20261009/guard-push.txt`, `190/197 cases passed`, with the same 7 failing case names as the reference `evidence/TR-C-T-20261009/red.txt` (PG-CHECKPOINT, PG-CHECKPOINT-WORKTREE, PGC-T38c, PGC-T80b, PGC-T42c, PGC-T82c, PGC-T85a).
- Consequence: the post-image's prefix is no longer byte-identical to the live file at exactly those two lines. The ceremony still copies the post-image over its target unchanged; the live target takes the neutral literal at those two lines.

## Readings and gaps the F slice and the PO should see

1. Split reading of Ruling 81. Rows whose refused shape holds an option-B marker (`(`, `)`, `{`, `$`, backtick, nested `-c` shell)
   are pinned as "keeps refusing" plus a text pin, as briefed. T85a (`git --version`) is the one push-side row that is not a
   marker case and is pinned as a plain contract (RED).
2. T82 as written in the design ("admit the printed form") cannot be pinned for the form the obligations actually print,
   `--trailer "Dispatch: <ID> (goldfish)"`: its parenthesis is an option-B marker, so under Ruling 81 it stays refused
   (PGC-T82b). Only a trailer without a marker is admitted (PGC-T82a). The design's fallback (the producer emits
   `-F scratch/commit-msg/<id>.txt`) is the route that works; that is a producer change outside TR-C.
3. T80 as written ("route git grep to the read classifier before any push check; pin never handled by guard-push") is not
   pinned: Ruling 81 chose to keep the refusal, so PGC-T80a pins it and PGC-T80b pins the relief text.
4. I3: `-n` and `-c` are not pinned. `-n` is already in the GG-22 safe list (`PATHSPEC_EXCLUSIVE_SAFE_FLAGS`), so "never added" is
   untrue for that list, and which guard rule catches `-n` was not verified. `--no-verify` is pinned (T51e, T51f).
5. Same-tranche obligation: none known beyond the refusal-text change in `hooks/guard-push.mjs` (Ruling 81) and the
   `--trailer` additions in `hooks/guard-git.mjs` and `lib/` that the F slice owns. If `verify-suites` pins a case count for
   either file it needs the matching refresh (not checked here).

## TR-C-T5 (dispatch TR-C-T5-20261009): pins for the TR-C Critic's minors F1, F3 and F4

Test-only. Both test post-images above gain ONE more inserted block each; no guard post-image, no live file, no existing case is touched.
The sha256 and line counts in sections 1 and 2 describe the state before this section; the values below SUPERSEDE them for the
ceremony copy (the base blobs and the install check `git hash-object <target>` are unchanged, the live files did not move).

| Post-image | sha256 (bytes, lines) | Inserted block (new line range) |
|---|---|---|
| `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-git.test.mjs` | `8838587afbec84775bf929a73fd8d81cf6e339cbd7845bbce7d56cb0b985dfd5` (84514, 1648; was 81846, 1607) | 41 lines, 1592-1632: the `TR-C-T5` comment and 5 cases `GG22-T5F1a`-`GG22-T5F1c`, `GG22-T5F4a`, `GG22-T5F4b`, directly before `// ---- Summary` |
| `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-push.test.mjs` | `f6ebe7a92c349650f23500190b141ef7c255a334bc5bda29f6aeb09039210152` (125779, 2478; was 123784, 2456) | 22 lines, 2437-2458: the `TR-C-T5` comment and 5 cases `PGC-T5F3a`-`PGC-T5F3c`, `PGC-T5F4a`, `PGC-T5F4b`, inside the existing `trc-classifier` block (so its `dir`, `REFUSAL` and `HEREDOC_PAREN` are reused) |

### Per-pin state (against the guard post-images of TR-C-F, `dda3322d...` and `115ccc72...`, via the load-hook redirect)

| Pin | Finding | State | Reason |
|---|---|---|---|
| GG22-T5F1a `-m "chore: reconcile ledger" --trailer --trailer -i -- <ledger>` blocks (GG-22) | F1 | RED | exit 0 (expected 2): the second `--trailer` is the first one's value, yet the look-behind skip at post-image `guard-git.mjs:1308` still treats the following `-i` as a value, so the pathspec stays "exclusive" while git reads `-i` as `--include` |
| GG22-T5F1b `-m "chore: reconcile ledger" -m -m -i -- <ledger>` blocks (GG-22) | F1 | RED | exit 0 (expected 2): the same skip, reached through `PATHSPEC_VALUE_CONSUMING_FLAGS`; this is the pre-existing spelling the Critic named |
| GG22-T5F1c an ordinary second `-m "second paragraph"` pathspec ledger commit is allowed | F1 control | GREEN | the F1 fix must not over-block ordinary multi-paragraph messages |
| GG22-T5F4a `git --help` allowed | F4 | GREEN by design | `--help` is in `GIT_GLOBAL_OPT_FLAG` (edit 3 of TR-C-F); the behaviour existed and had no pin |
| GG22-T5F4b `git --help reset --hard HEAD~1` blocked | F4 | GREEN by design | the collapse makes the dangerous subcommand more visible, as `TR-C-F-MANIFEST.md` reading 1 declares |
| PGC-T5F3a a shell-bundle refusal (`HEREDOC_PAREN`) keeps the `Why:` line | F3 control | GREEN | bundle reason, marker is the cause |
| PGC-T5F3b `git push --tags origin` refusal has no `Why:` line | F3 | RED | `stderr unexpectedly contains "Why:"`: the line is emitted on every `!pushBinding.ok` refusal; the pin also requires `Reason: push option cannot be bound to exactly one source commit` |
| PGC-T5F3c `git push origin` refusal has no `Why:` line | F3 | RED | same cause; also requires `Reason: push must name exactly one remote and one explicit source refspec` |
| PGC-T5F4a `git --help` allowed, stderr empty | F4 | GREEN by design | as T5F4a above, on the push gate |
| PGC-T5F4b `git --help push origin main:refs/heads/feature-test` refused | F4 | GREEN by design | a real push after `--help` still collapses to a push candidate |

Totals (`evidence/TR-C-T5-20261009/red.txt`, 37133 bytes; the command exit code was 1; `node --test` duration 630379 ms): guard-git 256/258 (the 2 failures are
T5F1a and T5F1b); guard-push 198/202 (T5F3b and T5F3c, plus `PG-CHECKPOINT` and `PG-CHECKPOINT-WORKTREE`, which fail the same way in every earlier
capture: exit 2, "signature mode requires a current approval"). Every earlier case has its TR-C-F result (guard-git 253 passes before, 253 of the
256 now; guard-push 195 passes before, 195 of the 198 now). Both redirect lines are in the capture: `TRCT5-REDIRECT-FIRED guard-git.mjs (243 guard-process
loads ...)` and `TRCT5-REDIRECT-FIRED guard-push.mjs (203 guard-process loads ...)`, so the run was not against the unmodified live guards.

### Method and named deviations

- Command (WSL, run in the background and awaited, because the combined run exceeds the 600000 ms foreground ceiling):
  `wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-C-T5-20261009/red.txt --label red -- node --test scratch/dispatch-wip/TR-C-T5/guard-push.trc.test.mjs scratch/dispatch-wip/TR-C-T5/guard-git.trc.test.mjs"`.
  The load-hook redirect is the one of `TR-C-F-MANIFEST.md` (entries, `register.mjs`, `redirect-hooks.mjs` under `scratch/dispatch-wip/TR-C-T5/`, git-ignored), except that
  the hook serves the tranche-2 guard post-images directly from their tranche path instead of from a scratch copy. The runnable bodies differ from the post-images only
  in the `../lib/` import lines (5 push, 3 git) and the one `GUARD` url line.
- Briefed spelling NOT pinned: `git commit -m x -m -i -- <ledger>`. Measured with a throwaway repository: `git commit -m "chore: probe" -m -i -- f.txt` commits the message body `-i`, so
  git takes `-i` as the second `-m`'s value and no `--include` exists; admitting that spelling is correct. The pinned F1 spellings are the ones where `-i` really is a flag
  (`-m <subject> -m -m -i`, the Critic's `-m -m -i`, and `--trailer --trailer -i`). The briefed bare subject `x` is replaced by a conventional subject: the commit-subject rule
  (GIT-01, reasoned, not measured) answers first for `x`, which would make a block pin pass for the wrong rule.
- The F4 pins are GREEN by construction (the behaviour exists and was unpinned), so the goal's "RED pins" framing holds for F1 and F3 only.
- Not changed: `TR-C-F-MANIFEST.md` (forbidden) still records the pre-T5 test digests (`6c6b153f...`, `05e6d7a2...`), now stale for the ceremony copy; section 1 and 2 lines above and the absolute path
  on line 21 (the Critic's F5) are left as they were. Update (TR-C-F2-20261009): line 21 now reads `<repo-root-in-wsl>`, and `TR-C-F-MANIFEST.md` records these TR-C-T5 test digests.
- Independent review: pending.
