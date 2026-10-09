# TR-C-F manifest: tranche-2 post-images for the push relief text and the GG-22 `--trailer` scoping, plus the `git --version` admission (class G)

Dispatch: TR-C-F-20261009, the fix half of slice TR-C. It turns the 8 RED pins of
`TR-C-MANIFEST.md` GREEN without editing either test post-image, and keeps the 16 GREEN pins and every pre-existing case at their
baseline. Requirement: `specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md` section 2 rows T38, T42, T51, T80, T82, T85
(section 5 row 6), read with Ruling 81 (GREP-PUSH, a PO decision: option B of the fail-closed marker rule is KEPT, the relief is
procedural text). No marker rule is widened. Independent review: pending.

## Targets (two post-images, one in-place file)

`hooks/*` is protected guard code, so the two guard changes are delivered as post-images at the mirrored paths and are never written
to the live path by an agent. No earlier tranche-2 post-image of either file existed, so each post-image is the live file plus the
edit below. Digests are over the LF bytes (both live files are LF).

| Install target | Post-image | Live pre-image sha256 (bytes) | Live pre-image git blob id (`git hash-object`) | Post-image sha256 (bytes) |
|---|---|---|---|---|
| `plugins/pipeline-core/hooks/guard-push.mjs` | `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-push.mjs` | `dae247a0fee62b2eda87935f1863e0f7516f7ade61e11239bffc8f83e8ae8ace` (147847; 2676 lines) | `c37d8cc9c5fdeb79d9e77e38d4afc7301bebea49` | `dda3322df765e0e4315645dfac8506e62eeaf993b4b5ec829cb2e14adce2f2de` (148345; 2679 lines) |
| `plugins/pipeline-core/hooks/guard-git.mjs` | `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-git.mjs` | `c19f36a057f5c6710300c77593f5e92950295401f7fcc9fc006650d62a79ed44` (89017; 1490 lines) | `363a46a27a92482b57830f10f2d62abda09c40ac` | `115ccc729bdb2a7d90f0f2ec270b53eb4e73f76f2d4875365db7fb76b1a397dd` (89198; 1491 lines) |

The post-image digests in this table are the TR-C-F ones. The TR-C-F2 section at the end supersedes them for the ceremony copy; the pre-image blob ids stay the stale-base check.

In place, committed with the post-images (it is outside `hooks/` and `lib/guard/`): `plugins/pipeline-core/lib/git-cmd.mjs`. The
`git --version` whitelist (the global-option list behind fail-closed check #2 of `commandIsGitPush`) lives there, not in either hook.

The two test post-images are untouched by this slice. Their digests are the TR-C-T5 post-images (`TR-C-MANIFEST.md`, TR-C-T5 section):
`hooks/guard-push.test.mjs` sha256 `f6ebe7a92c349650f23500190b141ef7c255a334bc5bda29f6aeb09039210152` (125779 bytes), `hooks/guard-git.test.mjs` sha256
`8838587afbec84775bf929a73fd8d81cf6e339cbd7845bbce7d56cb0b985dfd5` (84514 bytes). The TR-C-F run itself used the earlier pre-T5 test post-images (`6c6b153f...`, `05e6d7a2...`),
which its build script asserted before using them.

## The edits (each anchor matched exactly once; nothing else differs from the pre-image)

Pre-image line numbers.

| # | File and place | Edit |
|---|---|---|
| 1 | `guard-push.mjs`, the `!pushBinding.ok` refusal (1798) | keeps the first line and the `Reason:` line byte-identical; adds one comment line and two message lines: a `Why:` line naming the markers (`(` `)` `{` `$` backtick, nested shell `-c`) and an `Instead:` line naming the two relief shapes ``git commit -F scratch/commit-msg/<slice>.txt -- <paths>`` and `use rg -n <pattern> <file>` instead of `git grep`. The literal, case-sensitive needles of the pins are `git commit -F` and `use rg` |
| 2 | `guard-git.mjs`, GG-22 safe lists (1301-1302) | adds `"--trailer"` to `PATHSPEC_EXCLUSIVE_SAFE_VALUE_FLAGS` and `"--trailer="` to `PATHSPEC_EXCLUSIVE_SAFE_VALUE_PREFIXES`, with a one-line comment. The existing loop then skips the flag and its value token (the `--trailer <value>` spelling) or the whole token (`--trailer=<value>`) |
| 3 | `lib/git-cmd.mjs`, `GIT_GLOBAL_OPT_FLAG` (384-387) | adds `--version` and `--help` to the recognised global flags, with a four-line comment. `git --version` then collapses to a bare git word and fail-closed check #2 no longer routes it to the push gate |

Readings behind the edits (reasoning, not measured unless stated):

- Edit 3 is not a change to the marker rule: `--version` carries none of the markers. A real push after the flag still collapses to
  `git push ...` and stays a candidate (PGC-T85e and PGC-T85f stayed GREEN in the run). `--exec-path` without a value needed no change:
  `GIT_GLOBAL_OPT_EQ_ONLY_ARG` already recognises it with an optional `=value`.
- Edit 2 adds `--trailer` only to the value-taking safe list. It is NOT added to `PATHSPEC_VALUE_CONSUMING_FLAGS` (the separator
  finder), so a literal `--` given as a trailer value would be read as the pathspec separator; that direction is a false block, never a
  widening.
- T82 as written in the design (admit the printed form) stays unfixable under Ruling 81 for the form with `(goldfish)`: its parenthesis
  is an option-B marker (PGC-T82b keeps refusing). The text change (edit 1) is the whole relief for it.

## Verification command (WSL, foreground, wrapped exit 1 as expected)

```
wsl.exe -e bash -lc "cd <repo-root-under-/mnt>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-C-F-20261009/green.txt --label green -- node --test scratch/dispatch-wip/TR-C-F/guard-push.trc.test.mjs scratch/dispatch-wip/TR-C-F/guard-git.trc.test.mjs"
```

Artifacts (machine-written by `capture-evidence.mjs`, not part of this commit): `evidence/TR-C-F-20261009/baseline.txt` (the TR-C-T
runnable copies against the unmodified live guards), `evidence/TR-C-F-20261009/green.txt` (497 lines, sha256
`e123008b1b4de52c421719fe856ff1560df35387f678da7ae65d877e8fcb0a66`), and the native captures of the in-place file's own test,
`evidence/TR-C-F-20261009/git-cmd-before.txt` and `git-cmd-after.txt` (`node --test plugins/pipeline-core/lib/git-cmd.test.mjs`,
both wrapped exit code 0, taken before and after edit 3; the baseline WSL run was taken before edit 3 as well).

Totals:

| Capture | guard-git | guard-push |
|---|---|---|
| baseline (live guards) | 250/253 | 190/197 |
| green (post-images through the hook) | 253/253 | 195/197 |

The only failures in the green run are `PG-CHECKPOINT` and `PG-CHECKPOINT-WORKTREE` (exit 2, "signature mode requires a current
approval", present in every earlier capture and untouched by this change). `node --test` summary: 2 files, 1 pass, 1 fail (the
guard-push file, on those two cases), duration 797036 ms. The 5 newly green guard-push cases and the 3 newly green guard-git cases are
exactly the 8 RED pins; the passing count rose by 5 and 3 and nothing else changed state.

### How the post-images were exercised (a named method deviation, same shape as TR-B-F)

A relocated copy of one guard file would leave the live guard in the call path, because the guard modules are imported by their live
URLs. The two entry files `scratch/dispatch-wip/TR-C-F/guard-push.trc.test.mjs` and `guard-git.trc.test.mjs` (the files the command
names) append `--import=register.mjs` to `NODE_OPTIONS` before loading the test body. Both tests spawn `node <GUARD>` as a child with
`env: { ...process.env }`, so every guard child registers the scratch load hook (`redirect-hooks.mjs`), which serves the post-image
bytes under the live module URL. The post-images therefore behave as if installed (same relative imports, the live `lib/` including the
edited `git-cmd.mjs`, one module instance per child) and no live hook file is written. The hook is silent on stderr (six ALLOW pins
assert an empty stderr) and records each served load in a sidecar file; each entry prints one line from its exit handler. Both lines
are in `green.txt`: `TRCF-REDIRECT-FIRED guard-git.mjs (238 guard-process loads ...)` and `TRCF-REDIRECT-FIRED guard-push.mjs (198 guard-process
loads ...)`, so the run is not a run against the unmodified guard.

The test bodies `guard-push.trc.body.mjs` (sha256 `0a93c78ff40b9689bf9f2fe9d3b384683a1a4cb2d85b0642560c710f78353b06`) and
`guard-git.trc.body.mjs` (sha256 `fa6b7711275086cafca13397f5aa924167274163a0f4f532aa0a3073aff5048c`) are generated from the committed
test post-images by the TR-C-T rebasing (lib imports and the `GUARD` url only) and are byte-identical to TR-C-T's runnable copies, so
the baseline and the green run executed the same test bytes. The scratch entries, hook, build script and wait helper are git-ignored
and not part of this commit.

## Per-pin state (after the F slice)

| Pin | Before | After | Cause of the change |
|---|---|---|---|
| PGC-T38c, PGC-T80b, PGC-T42c, PGC-T82c (refusal text) | RED | GREEN | edit 1 |
| PGC-T85a (`git --version` allowed) | RED | GREEN | edit 3 |
| GG22-T51a, GG22-T51b (`--trailer` spellings allowed) | RED | GREEN | edit 2 |
| GG22-T51f (`GG-17` reported for `--no-verify` beside `--trailer`) | RED | GREEN | edit 2: once the pathspec fast path admits the trailers, GG-22 no longer answers first and GG-17 does. No rule was reordered |
| the 16 formerly GREEN pins (incl. PGC-T38b, T80a, T42b, T82b, T85d, T85e, T85f, GG22-T51c, T51d, T51e) | GREEN | GREEN | unchanged; the marker refusals keep refusing |
| every pre-existing case | baseline | baseline | the same two `PG-CHECKPOINT*` failures only |

## Readings and gaps the Critic and the PO should see

1. Not verified: the other two callers of `normalizeGlobalGitOptions`, `hooks/git-dangerous-policy.mjs` and
   `hooks/codex-pretool-guard.test.mjs`, now see `git --version` and `git --help` as a bare git word. The run covered the whole
   guard-git and guard-push test files and the native `git-cmd.test.mjs`; the other two were not run. A collapse can only make a following
   dangerous subcommand more visible (`git --help reset --hard` reads as `git reset --hard`), not less, but that is reasoning.
2. `--help` was added next to `--version` because the briefing named it when it sits in the same list; no pin covers it.
3. If `verify-suites` pins a case count for either guard test file or for `git-cmd.test.mjs`, it needs the matching refresh (not
   checked here); the install of the two post-images is the ceremony's step, with the base-blob check `git hash-object <target>`
   against the pre-image git blob ids in the Targets table.

## TR-C-F2 (dispatch TR-C-F2-20261009): the TR-C Critic's minors F1, F2, F3, F5 and the model line

Guard-only follow-up to TR-C-F. It answers the TR-C minors of `specs/sprint-alfred-epic/evidence/critic-tr-c-and-win-harden-opus-partial-2026-10-09.md`
and turns the four RED pins of TR-C-T5 (`TR-C-MANIFEST.md`, TR-C-T5 section) GREEN without editing either test post-image. No live `hooks/` or
`lib/` file and not the tranche README is touched. Independent review: pending.

### The edits (each anchor matched exactly once; nothing else differs from the TR-C-F post-images)

| # | File and place | Edit |
|---|---|---|
| 1 | `guard-git.mjs`, the GG-22 look-behind loop (post-image lines 1309-1317) | F1. A token that was itself skipped as the value of a value-taking flag is a value, never a flag: `consumedAsValue` records the skip and the look-behind does not apply to the token after it. `-m <s> -m -m -i` and `--trailer --trailer -i` therefore keep `-i` as `--include`, the pathspec stops being "exclusive", and GG-22 answers. Ordinary `-m a -m b` and `--trailer v --trailer w` commits are unchanged |
| 2 | `guard-push.mjs`, before the `!pushBinding.ok` refusal (post-image lines 1804-1822) | F3 / Ruling 159. The `Why:` line is emitted only when the command carries a marker the line itself names (`(` `)` `{` `$` backtick, a nested shell with `-c`). The test is on the command text, not on `pushBinding.reason`, so a marker-caused refusal keeps the line whichever reason fires first. The two nested-shell patterns are copied byte for byte from `lib/git-cmd.mjs` (`NESTED_POSIX_SHELL_RE`, `NESTED_WINDOWS_SHELL_RE`) |

Manifest edits of this slice: F2 (the Targets table records the git blob ids of both guard pre-images; the ceremony base check now compares like with like),
the implementor model/effort line of line 3 dropped, the stale test digests of the paragraph under the table refreshed to the TR-C-T5 post-images, and
`TR-C-MANIFEST.md` line 21 (F5) now reads `<repo-root-in-wsl>` instead of a host path.

### Post-image digests (supersede the Targets table; LF bytes)

| Post-image | TR-C-F sha256 (bytes) | TR-C-F2 sha256 (bytes; lines) |
|---|---|---|
| `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-push.mjs` | `dda3322df765e0e4315645dfac8506e62eeaf993b4b5ec829cb2e14adce2f2de` (148345) | `9686bbec296411e480a72bc4f0ae49600e452b413370f88ecc8319b3b5dfee49` (149849; 2697) |
| `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-git.mjs` | `115ccc729bdb2a7d90f0f2ec270b53eb4e73f76f2d4875365db7fb76b1a397dd` (89198) | `a57566f883aa48dd4566e6ea377f14cef4c45e92e0b95a41c08770571e4b863e` (89845; 1500) |

Install targets and base blobs are unchanged (`plugins/pipeline-core/hooks/guard-push.mjs` blob `c37d8cc9c5fdeb79d9e77e38d4afc7301bebea49`, `plugins/pipeline-core/hooks/guard-git.mjs` blob `363a46a27a92482b57830f10f2d62abda09c40ac`).

### Evidence (machine-written by `capture-evidence.mjs`, not part of this commit)

- `evidence/TR-C-F2-20261009/green.txt`, wrapped exit code 1. Command (WSL, run in the background and awaited): `wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-C-F2-20261009/green.txt --label green -- node --test scratch/dispatch-wip/TR-C-T5/guard-push.trc.test.mjs scratch/dispatch-wip/TR-C-T5/guard-git.trc.test.mjs"`.
  The load-hook redirect of TR-C-T5 serves the tranche-2 guard post-images directly (the entries print `TRCT5-REDIRECT-FIRED`): guard-git.mjs (243 loads), guard-push.mjs (203 loads).
- Result: guard-git 258/258, guard-push 200/202. The only failing cases are `PG-CHECKPOINT` and `PG-CHECKPOINT-WORKTREE` (exit 2, "signature mode requires a current approval"), failing the same way in every earlier capture.

| Pin | TR-C-T5 | TR-C-F2 |
|---|---|---|
| GG22-T5F1a, GG22-T5F1b | RED | GREEN (edit 1) |
| PGC-T5F3b, PGC-T5F3c | RED | GREEN (edit 2) |
| GG22-T5F1c, GG22-T5F4a/b, PGC-T5F3a, PGC-T5F4a/b | GREEN | GREEN |
| every other case | TR-C-T5 result | unchanged (258/258 and 200/202, the two `PG-CHECKPOINT*` failures only) |

### Readings for the Critic and the PO

1. The Why test repeats a subset of the marker rule. `hasFailClosedMarker` in `lib/git-cmd.mjs` is not exported and `lib/` is outside this slice, so `guard-push.mjs` carries its own test for exactly the markers its Why line names. A refusal caused only by a backslash outside a path token, a typographic quote or a here-document handed to a shell therefore carries no Why line (the line would not name its cause either). Exporting `hasFailClosedMarker` and calling it from the guard is the drift-free form; that is a `lib/` change for a later slice.
2. The `Instead:` line is still emitted on every `!pushBinding.ok` refusal; only the `Why:` line is marker-keyed, as briefed.
3. Edit 1 leaves the separator finder alone: a `--` that follows a consumed `-m`/`--trailer` value is still read as message content, which can only keep the conservative full-index check, never widen the fast path.
