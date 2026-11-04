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
