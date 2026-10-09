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

Independent review: pending.
