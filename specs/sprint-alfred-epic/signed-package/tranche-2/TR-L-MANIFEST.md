# TR-L-MANIFEST: tranche-2 post-images for the T84 protection pins (TR-L-T-20261009)

Contract: `specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md` section 2 row T84 and section 5 row 9 (TR-L: TP-2, TP-7, signed).
Route: Ruling 80 in `specs/sprint-alfred-epic/plans/0.7-execution-order.md` (hook contract-test post-images land as tranche-2 members, placed by the signed ceremony).
Nothing under `plugins/` was touched. The two files below are complete replacements of their live targets.

## Post-images

| Target path (replaced by the signed ceremony) | Post-image path | sha256 of the post-image |
|---|---|---|
| `plugins/pipeline-core/hooks/guard-testpath.test.mjs` (TP-2) | `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-testpath.test.mjs` | `2753b664ae50a42696d7815b61278e9176b0d17b5a632f3a964735eec8a20951` |
| `plugins/pipeline-core/hooks/guard-testpath-override.test.mjs` (TP-7) | `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-testpath-override.test.mjs` | `234cf45ccadf61f2ae36b7dfe0dc5d0ef1034111c4a6de264b04725802b07d3c` |

Each post-image equals its live target plus additions, with two intentional edits in the first file: the temp-dir cleanup list gained `T84_DIR`, and the last entry of the `names` array gained its trailing comma.
Checked by `diff` against the live files: no other line of the live files is removed or changed.
Each post-image also equals the scratch copy that was run (`scratch/dispatch-wip/TR-L-T/`) except for the import paths and the `GUARD`/`HOOKS` lines, which differ because the scratch copy sits outside `plugins/pipeline-core/hooks/`.

## How they were run

Both runs: WSL, foreground, from the repository root (`<repo-root-in-WSL>`), through the evidence wrapper.

```
node plugins/pipeline-core/scripts/capture-evidence.mjs --out <file> --label <label> -- node --test --test-reporter=spec <files>
```

| Run | Files | Evidence | Wrapped exit code |
|---|---|---|---|
| baseline (unmodified live files) | the two live `plugins/pipeline-core/hooks/guard-testpath*.test.mjs` | `evidence/TR-L-T-20261009/baseline.txt` | 0 |
| scratch copies of the post-images | `scratch/dispatch-wip/TR-L-T/guard-testpath.test.mjs`, `scratch/dispatch-wip/TR-L-T/guard-testpath-override.test.mjs` | `evidence/TR-L-T-20261009/red.txt` | 1 (the two RED pins below) |

Pre-existing cases keep their results: baseline `guard-testpath.test.mjs` TPC001-TPC018 pass 18 of 18 and `guard-testpath-override.test.mjs` OT01-OT19 pass 19 of 19; the scratch run shows the same 18 and 19 `PASS` lines again.
The override suite is a single script, so a RED pin turns the whole file into one failing node:test entry and exit code 1. Judge the old cases by their own `PASS` lines, not by that exit code.

## Per-pin state (as run)

| Pin | File | State | Reason |
|---|---|---|---|
| TP19 (T84: two hunks, the revert of a hunk, a Write of the committed bytes get one decision) | `guard-testpath.test.mjs` | GREEN | The write lane decides from the path alone. `Rule ID: PB-GUARD-HOOKS` is returned for `lib/guard/sanctioned-args-onboarding.mjs` in a real-git, enrolled fixture. Invariant the TR-L change must keep (I4). |
| TP20 (T84: same decision clean, dirty, staged, staged and edited again) | `guard-testpath.test.mjs` | GREEN | Nothing in the write lane reads index or working-tree state. Same invariant. |
| TP21 (T84: same decision for relative, dot-relative and backslash spellings) | `guard-testpath.test.mjs` | GREEN | Same invariant. |
| OT20 (T84: a capability spent on one hunk leaves other hunks and the revert under the same refusal, with a route offered again) | `guard-testpath-override.test.mjs` | GREEN | The one-time capability is bound to the exact tool input (OT11/OT12 already say so for the path); this adds that the sibling hunks get the identical decision lines and a fresh route. Invariant, never weaker. |
| OT21 (T84: `git restore -- <file>` that yields committed bytes is admitted by the shell lane) | `guard-testpath-override.test.mjs` | RED | `protectedTestPathShellHit` returns a hit: `lane=git-working-tree-write`, `rule=TP-3`. `restore` is in `GIT_WRITE_VERBS` and the `--` branch extracts the pathspec, so every restore of a protected path is refused. This is the behaviour T84 asks to change. |
| OT22 (T84: restore from `HEAD~1` in three spellings, `git checkout HEAD~1 --`, `git rm --`, `cp` onto the path all stay refused; an unprotected restore is admitted) | `guard-testpath-override.test.mjs` | GREEN | Never-weaker half of "bound to HEAD bytes, never an arbitrary ref". Must stay GREEN after TR-L. |
| OT23 (T84: `git restore --source=HEAD --staged --worktree -- <file>` of a staged-and-modified file is admitted) | `guard-testpath-override.test.mjs` | RED | Same hit as OT21 (`git-working-tree-write`, `TP-3`). |

Every new case title contains `T84`. In OT21 and OT23 the real git command is run in the temporary fixture before the assertion, and the pin checks that it yields HEAD's bytes, so the pin describes a command that really restores the committed bytes.

## Assumptions the design text does not fix (named in the post-image headers, not invented)

1. Pinned as admitted: a plain `git restore -- <file>` whose index equals HEAD (OT21), and the explicit `git restore --source=HEAD --staged --worktree -- <file>` (OT23).
2. Not pinned either way: a plain `git restore -- <file>` while the index differs from HEAD (it restores the index bytes, not committed bytes), `git checkout -- <file>`, `--staged` or `--worktree` alone, `--source=<sha of HEAD>`, several pathspecs at once.
3. "Admitted" for the shell lane means `protectedTestPathShellHit({ command, rules, root })` returns `null`. A TR-L implementation that moves the decision elsewhere (a new exported function, another lane) needs these two pins re-pointed; nothing else changes.
4. Not reproduced: the mechanism by which the toil log (L88) saw one hunk admitted and the next hunk and both reverts refused. The write lane reads no index or working-tree state, so TP19-TP21 are consistency invariants rather than a reproduction. The only per-call state is a spent one-time capability, which OT20 pins.

## Placement

Signed ceremony only (TP-2 and TP-7 are signed). After placement, `node --test` of the two live files under WSL should show OT21 and OT23 RED until the TR-L implementation lands, and every other case green.
