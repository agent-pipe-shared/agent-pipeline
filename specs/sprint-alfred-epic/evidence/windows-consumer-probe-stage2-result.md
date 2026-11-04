# Windows consumer probe, stage 2: result (installed plugin `0.7.0+claude.20261104062201.95d3e81`)

Source: the native Windows consumer session, 2026-11-04. The consumer's owner approved the stage in that session's own chat; the session stopped at S1 and ran S5.

| Step | Result |
|---|---|
| S0 | original branch `main`; HEAD unchanged; throwaway branch `pipeline-probe/stage2` created |
| S1 plan | `goldfish-host-commit-recover.mjs plan`: `GHCR-NO-SOURCE` (no pending host-commit state), the same `NGHF-PENDING-UNAVAILABLE` stop-failure record as in stage 1 |
| S1 briefing | refused: `DBG-AC-ROW-MISSING`. The generated briefing needs a 3-column acceptance row in the approved Spec that names the item; a probe dispatch has none |
| S2, S3, S4 | not run (no dispatch could be built) |
| S5 | back on `main`, local change in `docs/state.md` kept, throwaway branch deleted, no commit was made on it |

Reading: the live E1 reproduction and the E4 parallel-dispatch check cannot be driven by a synthetic probe in a consumer that has an approved Spec, because the sanctioned briefing route demands an acceptance criterion; binding an unrelated criterion would be a false binding, a hand-written briefing is forbidden, and a Spec change is the owner's decision, not a probe. The measurement therefore has to come from a REAL background dispatch of the consumer's own work. Candidate 19c adds the diagnostic that makes such a dispatch self-explaining (w207: the stop-failure record names why the pending state could not be read; `plan` prints it), so the next real Windows dispatch that fails reports the cause itself.

Not learned in that first run: whether the PreToolUse step writes the pending state on Windows (E1), and what a second parallel dispatch does (E4). A guard refusal observed on the way: a glob over the consumer's tests folder was refused with `GUARD-READ-TARGET` even with an explicit path inside the project root (not investigated here).

## Second run, S0 to S5 complete (same day, the owner released "wrong" acceptance criteria for the probe)

Source: the native Windows consumer session, claude runner. No push, no override, no hook skipping. Plugin sources unchanged (still without 19c).

| Step | Result |
|---|---|
| S0 | `main` at one commit, throwaway branch `pipeline-probe/stage2` created, HEAD unchanged |
| S1 | `gf-probe-1` launched only on the 5th attempt. Refusals in order: `DBG-AC-ROW-MISSING` (binding without `--criterion`; with `--criterion AC-1` it ran), `DISPATCH-MODEL-MISSING` (tool-layer `model` missing), `DBG-GENERATED-BRIEFING-REQUIRED` (a hand-assembled briefing; only `dispatch-briefing.mjs build` output is accepted), then `SDC-AUTHORITY-UNAVAILABLE` with reason `AGY-HOST-BASELINE-DIRTY` for a dirty tracked `docs/state.md` after a guard run of about 247 s (phase `integrated-slice-read` ~245 s, the later phases ~1 s each). Committing that file on the throwaway branch needed a message file (`GIT-03-DISPATCH-MISSING` for `-m` trailers, then `guard-push` refusing a `$'...'` string). Briefing rebuilt after the commit |
| S2 | right after the launch `goldfish-host-commit-recover.mjs plan` was already `GHCR-READY`, source `pending-state`, `stopFailure` null; `session-authority-repair.mjs inspect`: lock held by a live pid, native-goldfish `inFlight` 1 |
| S3 | after the child stopped (161 s, outcome `succeeded`): NO host commit and NO stop-failure record; the plan stayed `GHCR-READY` with the note "the stop left no diagnostic". `recover apply` then committed (`GHCR-COMMITTED`) |
| S4 | two parallel background dispatches: `gf-probe-2` launched, `gf-probe-3` refused `SDC-LOCK-HELD` (reason `registry-lock-held`, repair names `inspect`; no path, no pid, no `WIN-AUTH-OPEN`). `gf-probe-2` (31 s) DID leave a stop-failure record `NGHF-PENDING-UNAVAILABLE` although its pending state was readable by `plan`; `recover apply` committed it. After that `inspect` still counted `inFlight` 2: the settled `gf-probe-1` reservation (`integrated-by-commit`) is counted together with the unsettled `gf-probe-2` |
| S5 | back on `main`; the pipeline had written 91 tracked insertions into the consumer's `slice-queue.json` on the throwaway branch and the branch switch carried them to `main` (discarded with `git restore`); branch deleted with `-D` (the three commits are reflog-only) |

### Reading against the source (WSL side, nothing run on Windows)

- E1 is now measured live. The pending state exists after launch (plan reads it by scan) and the SubagentStop finalizer still reports `NGHF-PENDING-UNAVAILABLE`. The finalizer does not scan, it looks the file up by the key `(session id, tool use id)`, taking the tool use id from the child's own `agent-<id>.meta.json` (`readSubagentStopPending`, `readNativeGoldfishPending`). `readNativeGoldfishPending` has four distinct failures (`NGHS-READ-INPUT`, `NGHS-READ-BINDING`, a missing file, an unreadable private directory) and the shipped finalizer collapses them into one code. The run therefore cannot say which one fired. That is exactly what w207 records (`reason` in the stop-failure record and in `plan`), so the next Windows dispatch after 19c names the cause itself. The first dispatch left no record at all: a record is written only for an unresolvable stop of a MARKED child (contract text in its last message or in its SubagentHandback), and an unmarked or unreadable handback is silent by design (AC-164). Both gaps are consistent with the same lookup failure; neither can be separated without the w207 reason.
- Why `plan` sees the state and the stop does not: `goldfish-host-commit-recover.mjs` lists the pending files and reads them with a plain, unauthenticated read; the finalizer reads through `readPrivate`, which additionally demands a real directory chain without symlinks, `realpath` equal to the git common dir string, and unchanged inode, size, mtime and ctime across the read, and it needs the key `(session id, tool use id)` to match. Open candidates for the Windows failure, none verifiable from here: a `realpath` spelling difference (drive-letter case or short names) against the common dir string that git returns; a tool use id in the child's meta file that differs from the launch's; a time or inode fact that Windows reports differently between the two stats. A fallback that scans for the pending file by dispatch id would cure only the second candidate, and it would widen what a stop may bind, so it is not built blind; w207's `reason` selects the right repair.
- E4: the second parallel start is refused by the single registry lock as designed; the refusal text carries a repair command (`inspect`), so it is not a dead end, but it names neither holder nor age. Not changed in 19c (the lock holder and age are already printed by `inspect`).
- `inFlight` counting a settled reservation after a manual `recover apply` is the existing `heal` route (the `DBG-SETTLED-PENDING-HEAL` warning of the briefing step names it); the consumer correctly did not run it.
- The `AGY-` prefix on a Claude dispatch is the shared host-baseline module's code name (`lib/agy-host-commit-admission.mjs`), not a runner mixup.
- Not explained: the ~245 s `integrated-slice-read` phase (only measured once, in the failing run). It needs a timing capture on a second run; first suspect is a Windows file-system scan, unverified.
- Tracked `slice-queue.json` rows written by dispatches travel with a branch switch; a throwaway branch should be committed or the file restored before leaving it.

Consequence for the plan: E1 and E4 are measured, not fixed. After the owner applies 19c and installs it, the same two-dispatch run must be repeated once; the record for the second dispatch then states the reason.
