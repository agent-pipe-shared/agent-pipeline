# D169 Finding A: dispatch record lane directories without POSIX mode bits on native Windows (held patch)

Patch: `d169-dispatch-record-lane-win32-directories.patch` (against HEAD df2e2245e; `git apply --check` exit 0 in a fresh clone of HEAD).

## Cause
`secureDirectory` in `plugins/pipeline-core/lib/guard/dispatch-record-lane.mjs` refused any directory with `(stat.mode & 0o022) !== 0`. Node on Windows reports 0o777 for every directory, so every call raised DRO-PATH. Sibling `physicalCreationFile` already branches on win32. Second suspicion shown by reading: `syncCreationDirectory` opens the directory with `O_DIRECTORY` and fsyncs it; `O_DIRECTORY` is undefined on Windows and a directory cannot be opened/fsynced there. This was shown by reading, not by a native run. The lane does fsync files (lines 389, 397, 414 at HEAD); only the directory fsync is skipped.

## Changed lines (production, dispatch-record-lane.mjs, lines 281-291 at HEAD)
- `secureDirectory(path, platform = process.platform)`, now exported: on win32 keeps isDirectory / isSymbolicLink / realpath checks, skips only the mode-bit and uid verdicts; code stays DRO-PATH. No assessWindowsPrivatePath call.
- `syncCreationDirectory(path, platform = process.platform)`, now exported: after `secureDirectory(path, platform)` returns early on win32 (no open, no fsync).
- All in-file callers are unchanged (no argument), so POSIX behaviour is identical.
- Tests: `plugins/pipeline-core/lib/dispatch-record-liveness.test.mjs`, cases D169-DRO-1..4 appended plus two import lines. DRO-1/3/4 are skipped on a native win32 runner (they need POSIX mode bits); DRO-2 runs everywhere (symlink creation may need privilege on Windows).
- DRO-4 uses a 0o300 directory (traversable, unreadable) to prove the skip: win32 returns, "linux" fails on open with EACCES; that part is skipped when running as root.

## Counts (in the clone, linux/WSL)
- Baseline at HEAD (before edits): liveness 12 + kernel-closure 1 + pins log-stays-empty 31 + pins ownership 11 = 55 tests, 55 pass, 0 fail.
- RED (cases first, unchanged production): dispatch-record-liveness 16 tests, 12 pass, 4 fail (exactly DRO-1..4).
- GREEN: the same four files = 59 tests, 59 pass, 0 fail; pins/dispatch-records-land-under-specs-evidence 15/15.
- Logs: scratch/agent-out/wd169/{base,red,green,pins3}.log (scratch is untracked).

## Pins checked
`lib/guard-maintenance-window-kernel-closure.test.mjs` pins only the lazy imports of dispatch-record-lane.mjs (`./evaluate.mjs`); it stays green. No export-list pin failed, so none was moved.

## Proposed commit message
`fix(guard): judge the dispatch record lane directories without POSIX mode bits on Windows (D169 A)`

## Operator flow
1. `git apply specs/sprint-alfred-epic/evidence/held-patches/d169-dispatch-record-lane-win32-directories.patch`
2. `git add -u -- plugins/pipeline-core/lib/guard/dispatch-record-lane.mjs plugins/pipeline-core/lib/dispatch-record-liveness.test.mjs`
3. `git commit --no-verify` with the message above (guard path; operator ceremony).
4. Stamp, then install the plugin.

## Open items
- Only a native Windows run (the Toolbox consumer) proves the fix; the tests prove the platform branch with the injected `platform` argument on Linux.
- dispatch-record-lane.mjs is a guard path: an independent Critic review stays a parent-owned batch gate; the file is on the protected/catalogue list.
- Existing note: `process.platform` reads elsewhere in the lane (e.g. physicalCreationFile) are untouched.
