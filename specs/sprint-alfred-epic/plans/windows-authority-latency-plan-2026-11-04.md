# Windows authority latency: analysis and plan for three directions (2026-11-04)

Status: PLAN ONLY. Nothing here is built. PO decision 2026-11-04: analyse and plan the three directions now; build after the Windows measurement (authority trace) is in.

## 1. Problem

A background Goldfish dispatch on native Windows spends minutes in the PreToolUse admission (`guard-dispatch`). Measured by the Windows consumer session:

| Run | Observation |
|---|---|
| Stage 2, first dispatch attempt | phase `integrated-slice-read` reached at about 245 s; the later phases take about 1 s each |
| Stage 2 repeat, probe 4 (after probes 1 to 3 had left reservations) | PreToolUse hook 3 of 4 still running after more than 8 min |

The time before the first checkpoint grows with the number of earlier dispatches. Linux does not show it.

## 2. Cause read in the source (NOT yet measured on Windows)

1. `stateRead` (`lib/session-authority-registry.mjs`) reads the catalogue, every producer record, every member, every member release and every target certificate, then runs `registryClosure`.
2. `registryClosure` walks the whole registry folder (bound 4096 entries) and calls `owned(...)` on every directory and file, and `readRecord` on every file the index does not list.
3. On win32 every `owned(...)` is one `inspect` and every record read is one `read` of `lib/windows-owned-authority-backend.mjs`, and each of those is one `powershell -NoProfile -Command` process (`invokeNative`, timeout 15 s). A cold PowerShell start is the cost, not the work inside it.
4. `prescanAdmissionFacts`, the registry boundary and the later in-boundary reads each call `stateRead`.
5. A process-local memo of read-only observations exists (`authorityMemo`, keyed on the object's lstat identity, 512 entries). It is cold in every hook process, and a registry above 512 files evicts its own entries.
6. Each dispatch adds a member (and a release when it integrates). Members and releases are history and are never removed, so the file count grows with every dispatch, including probe dispatches that only `recover apply` landed.

Expected shape: spawns per admission is about 2 x (files + directories) in the first process that reads the registry. This matches the growth from 245 s to over 8 min between the runs.

## 2a. What the second Windows run adds (same day, installed 19c)

- Probes 4 and 5 left NO pending host-commit state and no reservation, although the dispatch was admitted; the stop recorded `NGHS-PENDING-MISSING: ENOENT ... lstat` (the w207 reason). No `WARNING (guard-dispatch): native host-commit preparation failed` was shown.
- The registry lock of a dead pid stayed for more than ten minutes, across a runner restart, and blocked `dispatch-briefing build` (`DBG-RULESET-LOCK-HELD`).
- All five probes used the generated pointer prompt; a Linux case (GD75b) shows an admitted pointer prompt leaves the same pending state as the inline briefing. The pointer is ruled out.
- `guard-dispatch` is registered with `timeout: 330` (hooks.json) and its internal admission budget is 300 s, checked only at the named phase checkpoints, none of which lies before the registry reads. The consumer saw the hook run for more than 8 minutes.

Reading (a suspicion until the trace is in): the host ended the hook at its timeout while it held the registry lock and before it wrote the pending state. A timed-out PreToolUse hook is not a block, so the launch went on with no admission result: no pending state, no reservation, no warning (an ended process prints nothing), and a lock owned by a dead process. This explains the E1 failure and the dead lock with one cause, and it explains why it got worse with every dispatch.

## 2b. Direction 0 (new): the guard must refuse before the host ends it

Independent of how fast the checks become, an admission that cannot finish must end as a typed refusal with its lock released, never as a timeout.

What: a deadline for the native authority calls. `lib/windows-owned-authority-backend.mjs` gets a settable deadline (set once by `guard-dispatch` to its hook entry plus the 300 s budget, and cleared afterwards); `invokeNative` refuses a further spawn after it with a typed code (for example `WIN-AUTH-DEADLINE`). The exception unwinds through `withSessionAuthorityBoundary`, whose `finally` already removes the lock; `guard-dispatch` prints `BLOCKED (guard-dispatch): GUARD-DISPATCH-SLOW` with the repair text (retry; the number of reservations to settle; the latency plan's route). A deadline check is also added at the start of each registry file read loop in `stateRead` so a pure-file loop cannot run past it.

Why first: it is small, needs no Windows measurement to be right, turns a silent unguarded launch into a visible refusal, and stops the dead locks.

Risk: it is a new refusal in the authority path; the code and the repair text must be mapped in `describeWindowsAuthorityRefusal` and the refusal table; a lock already held by a dead owner must still be retired by the next admission. Critic review required.

Tests: a spawn seam that advances a fake clock past the deadline yields the typed refusal, the lock file is gone, and no pending state is written; below the deadline nothing changes.

Order: Direction 0 first, then the measurement decides 1 and 3, and 2a runs alongside.

## 2c. The first real trace (Windows, installed 19c, authority trace on)

- An ALLOWED Bash or PowerShell call costs about 0.4 s in `guard-lifecycle-ready` with no native observation. `guard-worktree-isolation` and `guard-dispatch-budget` cost 0.2 to 1.3 s with none.
- Bootstrap-type calls cost about 7.5 s (5 native observations, about 2 s in them, about 5 s unexplained).
- ONE `guard-lifecycle-ready` process ended with exit code 2 (a refusal) after 144 s wall time: 220 native observations (131.6 s; `read` 52, `read-source` 52, `inspect` 58, `ancestor` 20, `ancestor-above-root` 12, `publish` 7, `remove` 4, `create-directory` 1), 238 custody inspections (5.2 s), 4273 memo hits against 194 misses. The same process held the registry lock (`pipeline.session-authority-legacy-lock.v2`) while it ran: `inspect` of the consumer showed it as the live lock holder and then met a `registry.lock` that had vanished between listing and `lstat` (ENOENT). The Goldfish child that made the refused call took 193.8 s instead of 41 to 53 s.
- No trace line for `guard-dispatch.mjs` exists although a dispatch was launched. The writer runs at process exit, so that hook either never exited normally or does not install the trace. Open.

Reading from the source: a refused call goes through `recordHumanGuardDenial` (lib/human-guard-override.mjs). Only `GUARD-READ-COMMAND-UNSUPPORTED` and `GUARD-READ-TARGET-MISSING` take the cheap pure return (`classifyNonLiftableGuardDenials`). Every other refusal resolves the repository topology and its git observation, may journal a copy-only command offer, and plans a route, all under the legacy authority lock; on Windows each of the several hundred checks it makes is a PowerShell start. The outcome for a shape or grammar refusal is nearly always "no human override route is offered", so the cost buys nothing, and it blocks every other hook that needs the registry for its whole duration. This one mechanism explains the 144 s, the lock held by a live process, the `registry.lock` ENOENT race, the second parallel launch refused (E4) and the children that run minutes instead of seconds.

## 2d. Direction 5 (new, first in the order): the refusal path must be cheap and must not hold the registry lock

What: in `recordHumanGuardDenial`, a denial whose `eligibility()` result is not eligible (the `HGO-NONOVERRIDABLE-*` family, which includes the grammar and shape refusals) and that carries neither a guard-push denial nor typed retry actions returns the route that the read-only companion `previewHumanGuardRecovery` already computes (`recoveryRoute(..., { repository: null })`) BEFORE `topology`, `repositoryObservation` and the journaling. Only a route whose status is `external-operator-required` continues to the journaled offer as today. The legacy authority lock is not taken for the cheap return.

Why it is safe to try: the cheap companion exists and is the same route function; the change moves an already pure result in front of side effects. The test that proves it: for every non-eligible fixture the result of the cheap return equals the result of the old path (same status, code and reason text), and no request is appended and no lock file is created.

Risk: `lib/human-guard-override.mjs` is a protected guard module (operator commits it); an `external-operator-required` route still pays today's cost, so the second step is to measure whether its journaling needs the full custody scan at all. Critic review required.

Order: Direction 5 and Direction 0 first (together they remove the unguarded launch and the long lock), then the measurement of what remains decides Directions 1 and 3.

## 2e. Measurement 1 of a normal dispatch (Windows, installed 19c, empty registry, 2026-11-04)

One ordinary dispatch (`gf-probe-7`, pointer prompt, a single-file task, no refusal) after `session-authority-repair.mjs move-aside` had emptied the registry. The transcript record: `hook_cancelled`, `PreToolUse:Agent`, `durationMs 330105`, `timedOut true`, `timeoutMs 330000`; the Agent call then returned "Async agent launched successfully" and the Goldfish ran for 156 s and succeeded, so the dispatch ran unguarded. Reading:

- **The 330 s are not stale registry members.** The registry was empty (two pending files of earlier probes remained outside it). The cost is inside the `guard-dispatch` process itself.
- **The other three PreToolUse Agent hooks are cheap.** `worktree-isolation`, `dispatch-budget` and `lifecycle-ready` each ran in 0.2 to 8 s (at most 5 native observations). Only `guard-dispatch` is slow.
- **No trace line exists for `guard-dispatch`.** It is ended by the host and never reaches the exit writer; the trace therefore cannot say where the time went. This is the measurement gap, not evidence about the cause.
- **What lies before the first phase mark of 19c.** Everything up to `integrated-slice-read` ran unmarked and, in 19c and 19d as first built, outside any deadline: the queue and integration-readiness reads, two `git rev-parse`, the baseline capture, the repository inspection, the registry migration/presence check, and, because the registry was empty, `initializeSessionAuthorityRegistry` (the first governed dispatch creates the registry), the pre-boundary prescan and the lock wait. Process module loading is also outside `HOOK_ENTRY_MS` in 19c.
- **A second problem seen in the same run.** The stale reservations of probes 1 and 2 could not be removed: `slice-queue.mjs cancel` says `SQ-NOT-FOUND` (the queue rows were discarded), `routine-repair.mjs run heal` defers every settled pending state while a bound member counts as armed or running, and only `move-aside` helped, which leaves the pending files behind. A cycle of three repairs that each need another one to have run first (open defect, not yet fixed, to be taken after the latency work).

## 2f. What 19d adds because of measurement 1 (w211)

1. The deadline now covers the whole preparation, not only the registry publish, and starts at the process start (`performance.timeOrigin`), so module loading counts.
2. New phase marks before the old first one: `prepare-start`, `queue-resolve`, `integration-readiness`, `candidate-git`, `agy-baseline`, `publish-start`, `repository-inspect`, `registry-migrate`, `registry-init`, `owner`, `prescan`, `lock-wait`, `lock-held`; the hook adds `hook-entry`, `dispatch-checks-done`, `prepare-attempt`, `prepare-done`.
3. With `PIPELINE_AUTHORITY_TRACE=1` each mark appends a `pipeline.hook-authority-progress.v1` line (phase, epoch ms, process ms, native observation count and ms) to the trace file at once, so a hook the host ends leaves the phases it reached. Without the trace nothing is written.

The next Windows run of a normal dispatch on 19d therefore shows which phase the 330 s belong to (or refuses with `GUARD-DISPATCH-SLOW` before the host ends the hook). Directions 1 and 3 are decided on that line, not on the registry size.

## 2g. Measurement 2 (Windows, installed 19d, 2026-11-05): the cost is the NUMBER of native starts, and what 19e does about it

Two dispatches (A after a move-aside, B on the registry A left) and the progress marks of 19d. Facts, from the peer's reading of the trace file:

- The guard-dispatch hook is ended by the host at 330 s in both runs, no `GUARD-DISPATCH-SLOW` before (the admission deadline did not fire; its default is above the host limit's reach for this path, see open item below). 320 and 290 native PowerShell starts, 0.94 to 1.2 s each: 90 percent of the wall clock.
- The hook makes the SAME cycle three times: take the registry lock (`inspect` x2, `publish`), read the whole state (`read`, `read-source` of the 23 distinct installed source files, `inspect` of every record), read the domain-owner namespaces (`ancestor`, `read`, `read-source`), remove the lock. One cycle is 85 to 100 starts. The cycle after a move-aside (A) adds the registry initialisation once (publish per member, create-directory).
- The native backend memoizes read-only observations by the observed object's identity, so within one cycle the 31 source reads of `participant()` shrink to the 23 distinct files, but EVERY native write (the lock create and remove included) cleared the whole memo, so each cycle started cold. The third cycle even showed 46 `read-source`.
- The expensive refusals were Bash `GUARD-PARSE-UNSUPPORTED` (composed shell commands), not the missing-file read (that read costs 0.9 s, 0 starts): 122 s (not overridable) and 253 s (eligible). 112 starts happen BEFORE the first `hgo-start` mark with identical counts in two runs: the consumption attempt that `denial-route.mjs` makes first enters `hgoConsumptionBoundary` (lock, whole registry, domain-owner reads, unlock) and finds an empty `capabilities` directory.

What 19e builds from it (all held, nothing measured on Windows yet):

| patch | change | expected effect |
| --- | --- | --- |
| w215 | `participant()` keeps the digest of each installed source file per process, keyed by the file's identity | the 23 distinct source reads happen once per process, not once per cycle |
| w218 | a native write drops only the memo entries of the written object, its directory and what is below it | the reads that follow the lock create and remove stay memoized across cycles; each hit is still identity-checked |
| w219 | `consumeHumanGuardOverride` answers `absent` from a plain directory read when no capability file exists | a refused command without a capability no longer takes any registry work: about 110 starts and two minutes gone for that case |

Estimate (reasoning from the counts, not a promise): the first cycle stays near 75 to 100 starts; the second and third drop to about 15 each (lock, records that really changed, directories whose identity changed). That is about 130 starts, about 130 s, below the 330 s the host allows. The first cycle is the remaining cost; shrinking it further needs batching (Direction 1) or sharing between processes (Direction 3).

The deadline DID fire (w220, from the marks): in B the 295 s mark falls between the marks 1179 and 1180, the lock is removed right after it, and a new lock cycle that only reads starts 4.2 s later (A: 9.3 s later) and never reaches `candidate-git`. `prepareNativeGoldfishHostState` cleared the deadline in its `finally` and only then ran `rollbackGovernedItemQueue`, which enters the registry boundary (a whole cycle) with no deadline; the host ended the hook in it, so the refusal was never printed. B's "46 read-source" are two cycles (23 + 23), not one. w220 makes the preparation stop at 245 s and runs the rollback under the full 295 s window, and reports an unrestorable queue row in the refusal. Not proven by a mark that names the rollback (the peer's reading: consistent, alternatives not ruled out).

Open from this measurement: (1) the joint Windows proof of w215, w218, w219 and w220 (needs the PO's apply, a stamp and the refreshed Windows copy); (2) the three cycles themselves (a design change: one boundary for the whole admission); (3) some trace lines are lost when several hook processes append at once (13 of 112 marks missing in one process), so counts must be read from the counters, not from line counts; (4) the eligible refusal still publishes its request under the lock (`hgo-publish-wait` to `hgo-publish-held`, 93 starts) and only w215/w218 reduce that.

## 2h. Full Verify of the 19e chain (Linux, 2026-11-05)

Three Full Verify runs on clean single-remote clones of the chain (`--mode candidate --no-reuse`, 1176 steps):

| Run | Reds | Cause and fix |
|---|---|---|
| 1 | 7 | three case-completion declaration mismatches and the registry pin (w222), a stale PowerShell parity row for a plain `rg` (w222), the ENOTDIR regression of w219 (w221), and a two-remote clone that made security-scan ambiguous (environment: one remote in the clone) |
| 2 | 1 | `codex-pretool-guard-tests` cases 8 and 15: the 8 s adapter spawn timeout of the test is shorter than an adapter start under load; green alone (w223, 30 s, below the 45 s hook timeout, no assertion change) |
| 3 | 0 | commit `cb3dbfe94`, clean tree, exact binding, 1176 steps all exit 0, top-level exit 0, wall 6020 s |

This is Linux evidence only. It says nothing about the Windows latency: the estimates in 2g stay reasoning until the peer measures a stamped build.

## 2i. Measurement 3 (Windows, installed 19e `0.7.0+claude.20261105060619.eb4e31a`, 2026-11-05)

Raw counters from the joint session (peer trace, pids 3412 and 11712):

| Case | Result |
|---|---|
| Refused Bash command (`GUARD-REDIRECT-UNAPPROVED`, redirect to a scratch file) | 102.4 s, 189 native starts; `hgo-start` only at 83.9 s, then 8.5 s publish wait. The cost is the consumption attempt before the denial is recorded |
| Allowed compound command, ordinary Read/Bash hooks | no natives, 0.5 to 1.0 s |
| Dispatch A (probe) | no longer killed at 330 s: typed block `SDC-AUTHORITY-UNAVAILABLE` / `item-delivery-scope-collision` at about 102 s, 133 starts in 106.6 s; 61.5 s pass before `prepare-start` (one whole lock cycle, 103 starts) |

Cause of the first row (confirmed by the peer's count of the capabilities directory: exactly one file, `status` consumed): w219 answered `absent` before the registry boundary only for a capabilities directory with no `*.json` file at all, but a used capability stays on disk as `consumed`. The shortcut never fired on any machine that had run a ceremony (this Linux clone holds dozens). w224 decides `absent` from plain reads: no readable file is an armed capability for the call's tool (the consumption itself skips such files before any lock). Held as 19f, applied by the PO, stamped `0.7.0+claude.20261105062725.c2c3292`; not yet measured on Windows.

Dispatch A: the estimate "about 130 starts" holds (133), the time does not (106 s at about 0.5 s per start); the deadline marks (245 s, 295 s) were never reached, so w220 is still unproven in its real case. The 61.5 s before `prepare-start` and the seven lock cycles of the whole hook (`registry:305` x7, `315` x7, `349` x7) are the three-cycle design item; it is the next lever after w224.

Repair cycle found in the same session (a defect of the w213 repair text, not built yet): after the peer restored the queue file (`git restore`) the slice `gf-probe-1` had no queue row but its native pending state remained. `inspect` names `slice-queue cancel gf-probe-1 --started`; that answers `SQ-NOT-FOUND` and names `routine-repair run heal` and then `move-aside`; `heal` answers `healed` but defers (`settledPending.deferred`, a member is armed); `move-aside` is refused `RR-OUTSIDE-LIST` because an open item reservation is not on its closed list. So the loop has no runnable end. `move-aside` moves only the registry aside; the pending file in `run/native-goldfish-host-commit` stays, so whether it would release the reservation is unverified. The sound fix needs the settlement of an orphaned reservation on the caller's word (`--started`), for example re-creating the missing row as a cancelled one from the pending state's delivery contract, or a recorded orphan settlement read by `settledItemSlices`; it touches the queue schema or the native namespace, so it is a designed change with a native-state fixture test, not a text edit. Workaround until then: probe slices with a write scope disjoint from the orphan's.

Design read (2026-11-05, nothing built): the single settlement definition is `settledItemSlices` (integrated by a native record or by commit evidence, or a `cancelled` row of the governed queue), read by every native and AGY collision check, so the release must end in one of those. Two ways: (a) `cancelUnstartedGovernedItemSlice` with `--started` and no row re-creates the missing row as `cancelled` (class, reason, `writeScope` and `delivery` taken from the pending state: `delivery.itemId/sliceId/writeScope`, `binding.itemDelivery` with `criterionLocator` and `checks`, `binding.candidateCommit`; the item queue row schema also needs `approvalSha256` and a tier from the queue defaults) and then runs the ordinary started cancel; it reuses the one definition and leaves a visible, tracked trace, but `prepareGovernedItemQueue` (the existing row builder) needs an eligible current plan approval, which the re-creation must not require; (b) a recorded orphan settlement read by `settledItemSlices`, which needs a new file kind in the native namespace (`native-managed-authority-support.mjs` lists the admitted names closed). Recommendation: (a), with the row built from the pending state only and never from the current approval, and a test on the NGHS37 fixture (row removed, cancel `--started` releases, the next dispatch with an overlapping scope is admitted). Protected files likely touched: `native-goldfish-host-state.mjs`.

## 2j. Measurement 4 (Windows, installed 19f `0.7.0+claude.20261105062725.c2c3292`, 2026-11-05) and what 19g does about it

Raw counters from the joint session:

| Case | 19e | 19f |
|---|---|---|
| Refused command with no override route (`GUARD-PARSE-UNSUPPORTED`, grammar) | about 122 s | 2.3 s, 1 native start, text printed |
| Refused command with an override route (redirect, `GUARD-REDIRECT-UNAPPROVED`) | 102.4 s, 189 starts | 96.3 s, 179 starts; `hgo-start` now at 1.1 s (w224 works), then `hgo-publish-wait` to `hgo-publish-held` 82.9 s: the request and its audit row are published as an authority-recorded write inside one registry lock cycle |
| Dispatch A (probe, scope disjoint from the orphan) | typed block at 102 s | 124.0 s, 159 starts, no block, agent started (its Goldfish then failed on a DNS error of that machine) |
| Dispatch B | not run | 123.1 s, 166 starts, agent started, Goldfish succeeded in 46.7 s |
| Deadline marks (245 s, 295 s) | not reached | not reached (w220 still unproven in its real case) |

One registry lock cycle costs 130 to 180 native starts (about 0.5 s each): per hook process 23 `read-source` of the installed sources, 27 to 38 `read`, 19 to 36 `inspect`, about 15 `ancestor`, 6 to 17 `publish`. `dispatch-checks-done` comes at 65.7 s in both dispatches (one cycle), the preparation takes the next 58 s. The process-local memo (w215, w218) cannot help across the several processes of one dispatch.

New defects found: (1) `SubagentStop` host commit failed `NGHF-PENDING-UNAVAILABLE` / `NGHS-PENDING-MISSING: registry-lock-held` (the pending state existed; the read answered missing at the first held lock); recovered by hand with `goldfish-host-commit-recover`. (2) `dispatch-briefing build` refused `DBG-RULESET-LOCK-HELD` for a lock whose owner had been dead for 37230 s and named wait and release-lock, not heal. (3) The orphan reservations `gf-probe-1`, `gf-probe-2` (no queue row) stay (w225). (4) The pipeline writes `specs/onboarding-*/slice-queue.json` (tracked) during a dispatch, so a branch switch is blocked until it is committed; the peer's attempt to commit it was refused by its auto-mode classifier and is left to the PO (known open item: the tracked queue across branches).

19g (the PO's last candidate of this work), held as `po-apply-0.7-candidate19g.sh`: w225 (a started cancel re-creates the missing row as cancelled), w226 (read-only native observations persist across hook processes in a bounded private file, valid for the identical object identity only; reasoning, not measured: a warm process saves the 23 `read-source` and most `inspect` and `ancestor` starts, a cold first process saves nothing), w227 (the stop waits up to 90 s for the registry lock), w228 (dead-lock refusal names heal). Not built: collapsing the lock cycles of one hook into one boundary, batching several observations into one PowerShell start (Direction 1), moving the request publication of an eligible refusal out of the registry lock (it is an authority-recorded write by design).

## 3. Measurement needed first

The opt-in authority trace already counts native spawns (`nativeAuthorityStats`: count, ms, maxMs, byOperation, memo hits and misses). The Windows session starts the runner from a shell with `PIPELINE_AUTHORITY_TRACE=1` and `PIPELINE_AUTHORITY_TRACE_FILE` set (PO yes in that chat), runs ONE dispatch, and reports the `pipeline.hook-authority-trace.v1` lines, the number of reservations (`session-authority-repair.mjs inspect`), and the per-phase times. Decision rule:

- `read` plus `inspect` dominate the count and ms: direction 1 is the fix.
- Many hook processes each pay the full cost: add direction 3.
- The count is small but each spawn is slow (about seconds): the cost is per process start (antivirus, execution policy); then batching (direction 1) is still the only lever, and a persistent helper would be the next design.

## 4. Direction 1: batch the native observations (prefetch into the existing memo)

What: add one read-only operation to the native helper that takes a list of paths and returns, per path, the same record the single `inspect` and `read` return. At the start of `stateRead` on win32 the registry folder is listed with plain `readdirSync` (no process), and ONE spawn warms `authorityMemo` for every file (the `read` form with the registry record size limit) and every directory (the `inspect` form). All existing callers stay as they are and become memo hits.

Why this shape: the callers, the facts format (`nativeFacts`, `nativeFactsSha256`) and every check stay unchanged; only the number of processes changes. A warm entry is valid only while the lstat identity still matches, exactly as today.

Where: `lib/windows-owned-authority-native.ps1` (a new operation; its pinned `HELPER_SHA256` in `lib/windows-owned-authority-backend.mjs` is re-pinned), `lib/windows-owned-authority-backend.mjs` (a `prefetchWindowsOwnedAuthority` export that fills the memo through the same validation as `invoke`), `lib/session-authority-registry.mjs` (one call at the top of `stateRead` and in `registryClosure`). Raise `MEMO_MAX` to the registry bound or make eviction not drop the working set.

Risk: the helper is custody-pinned and sits in the authority path; a batch operation must apply the identical per-path checks (owner, DACL, link count, no reparse point, size limit) and fail the whole batch on the first violation with the failing path (w168 failed-path envelope). Needs the independent Critic review. Check at build time whether the three files are in the kernel never-liftable list and the guard split map (w190, w192 added modules there), because then the operator commits them.

Tests: a spawn-counting seam (`setWindowsOwnedAuthorityBackendTestSeam` already injects `spawn`): registry with N files costs at most 2 spawns per `stateRead`; a tampered file in the batch is refused with the same code and path as the single call; memo identity drift forces a re-read; a result for a path that was not requested is refused.

Expected gain: from about 2 x F spawns to 2 (or 1 with a combined operation) per cold process.

## 5. Direction 2: settle completed members, and bound what is read

Two different things were called "fewer entries":

a. Correctness: after a manual `goldfish-host-commit-recover.mjs apply` the reservation is settled (`integrated-by-commit`) but the member is still counted as in flight (Windows run: `inFlight` 2 with one settled). `heal` then reports drift with something in flight and the briefing keeps warning `DBG-SETTLED-PENDING-HEAL`. Fix: after the commit proof, `apply` (and the typed orchestrator commit helper of w170) retires the settled pending state the way `settled-pending-aside` does and releases the member through the sanctioned release route. This removes the false in-flight count and the repeated manual `heal`; it does not remove files from the registry, so by itself it is not a speed fix.

b. Speed: history must not be read on every admission. Members and releases are referenced by target certificates (`memberRefs`, `releaseRefs`), so they cannot simply be deleted. Options: an archive step that moves a closed member, its release and the certificates that only reference closed members into a sealed archive folder outside `registryClosure`'s walk, with a digest chain kept in the catalogue. This changes the audit trail and the registry closure contract: it needs an ADR and PO decision, so it is NOT part of the first build.

Where (a): `scripts/goldfish-host-commit-recover.mjs` (apply), `scripts/orchestrator-commit-record.mjs` (w170), `lib/routine-repair.mjs` (reuse the settled rule, do not copy it).

Tests: apply on a settled dispatch leaves `inFlight` 0 and `heal` with nothing deferred; a replayed apply is idempotent; an unsettled dispatch is never retired.

## 6. Direction 3: share verified observations between the hook processes of one dispatch

What: the four PreToolUse Agent hooks and the finalizer are separate Node processes, so the process-local memo never helps across them. Persist the memo entries (key, lstat identity, value) in a file under the private run folder and load it at start, valid only while the lstat identity of each object still matches (device, inode, mode, link count, size, mtime, ctime, birthtime).

Why it is safe enough: the identity includes the NTFS change time, which a DACL or owner change updates, so a changed object misses. The file itself is written with the existing owned-private writer and read with the owned read, so it has the trust level of the registry files it describes. It must be bound to the helper digest and to the plugin version, and carry a short time bound (for example 60 s) so a stale entry cannot outlive one admission window.

Risk: it caches a security verdict on disk; any bug in the identity check turns into a false pass. Therefore last in order, only if the trace shows several processes each paying the full cost after direction 1, and only with the Critic review.

Tests: a second process with a valid file reports zero spawns; a modified object, a different helper digest, an expired file and a corrupt file each fall back to a real observation.

## 7. Order and size

| Order | Direction | Size | Who builds | Review |
|---|---|---|---|---|
| 1 | 1, prefetch batch | medium (helper script, backend, registry call site, tests) | pipeline Goldfish (deep tier) with a briefing; the Elephant integrates | Critic required (authority path, re-pinned helper) |
| 2 | 2a, settle after apply | small | Elephant | normal verify |
| 3 | 3, shared cache | medium | only if the trace asks for it | Critic required |
| later | 2b, archive of closed members | large | ADR and PO decision first | Critic required |

Direction 2a can start before the measurement because it is correct on its own and needs no Windows proof beyond `inspect`. Directions 1 and 3 wait for the trace.

## 8. Not covered

- The roughly 1 s per later phase and the git reads (`git log --grep` over the candidate history, 30 s timeout) are small next to this and are left alone.
- The `AGY-` code prefix and the ~245 s that were measured once are explained by this plan only as far as the source shows; the trace decides.
- Linux timing is untouched; every change is on the win32 branch or behind it.
