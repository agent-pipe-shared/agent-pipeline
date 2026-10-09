# TR-C manifest: push and git classifier scoping pins (dispatch TR-C-T-20261009)

Two tranche-2 post-images that REPLACE committed contract tests (TP-5 and TP-1). Each is the committed live file plus ONE
inserted block of new cases (nothing existing is edited or removed). The ceremony copies each post-image over its target
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
- sha256: `842c74ad3d29a5191abd66d657a4db610d7420bf69e7056d86db42be9fa5777d`
- Insertion: one block (18 cases, ids `PGC-*`) directly before the `// ---- Cleanup` comment. No import changes.
- WSL command (run on the scratch copy, see Evidence): `wsl.exe -e bash -lc "cd /mnt/d/Dev/agent-pipeline-share; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-C-T-20261009/red.txt --label red -- node --test scratch/dispatch-wip/TR-C-T/guard-push.test.mjs scratch/dispatch-wip/TR-C-T/guard-git.test.mjs"`
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
