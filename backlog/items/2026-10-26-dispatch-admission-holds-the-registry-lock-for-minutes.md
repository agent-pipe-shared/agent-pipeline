---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-admission-holds-the-registry-lock-for-minutes
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P0
release: 0.7.0
sprint: alfred
source: "Elephant session 2026-10-26: three consecutive background Agent dispatches hung in the PreToolUse hooks (3 of 4 finished, over five minutes) and were interrupted by the PO; each interrupt left a dead registry lock; measured with a CPU profile of guard-dispatch.mjs"
done_when: manual
---

# Dispatch admission holds the session-authority lock for minutes and gives no sign of life

## Evidence (measured, not inferred)

- `guard-dispatch.mjs` is registered with a 120 s budget (`hooks/hooks.json`). Run standalone with the real C4 briefing
  and a host tool-use id it took 148.7 s; the two other runs without a tool-use id stopped at 6.5 s with
  `DBB-PARENT-TOOL-USE-ID-MISSING`, which is why a payload without that id hides the problem.
- CPU profile (147 s inclusive in the hook): `prepareNativeGoldfishHostState` 140.8 s, of which
  `publishNativeAuthorityState` 138 s inside `withSessionAuthorityBoundary` / `withCustodyTopologyScope`
  (`lib/session-authority-registry.mjs:331`, `lib/worktree-lifecycle.mjs:2202`), that is WHILE THE REGISTRY LOCK IS HELD:
  - `mintNativeConcurrentAuthority` → `captureSourceOwnedNativeHostCommitBaseline` 51 s,
  - `readNativeIntegratedSlices` → `readSettledItemSliceIds` 34 s,
  - self time is `spawnSync` 57 s (git), `FastBuffer`/`lstat` 28 s, hashing and `canonical` (human-guard-override,
    po-approval-proof) about 17 s.
- The work is linear in dispatch history: 94 queue rows, 22 native in-flight records, 70 stale
  `evidence/dispatch-record-*.json` records without an owner claim, one git call per slice and member. It grew with every
  dispatch of the day and crossed the 120 s hook budget; the hook is then killed while it holds the lock, which is the
  dead registry lock every dispatch leaves behind (21 directories in `.git/agent-pipeline/session-authority-abandoned`
  today).
- The hook prints nothing while it works, so the host shows "running PreToolUse hooks 3/4" for minutes and the PO
  cannot tell a slow hook from a dead one.
- Independent second cause of the same refusal: the three tracked, stamped `plugin.json` files that differ from HEAD make
  the host baseline `AGY-HOST-BASELINE-DIRTY`, reported only after the 148 s as `SDC-AUTHORITY-UNAVAILABLE`.
  The dirty paths are named, but late.

## Fan-out measurement, 2026-10-27 (why the PO sees only 1-2 parallel tasks)

- Two background `Agent` calls sent in ONE message: the first was admitted, the second was refused by `guard-dispatch`
  with `SDC-LOCK-HELD` / `registry-lock-held`. The hooks of the two calls run against the same registry lock, the
  waiter gives up after `SESSION_AUTHORITY_LOCK_WAIT_MS` (1500 ms, pinned at most 3000 ms by
  `lib/session-authority-lock-wait.test.mjs`), and the holder needs seconds, so concurrent dispatch loses by design.
- A registry-touching read alone costs seconds with today's history: `session-authority-repair.mjs inspect` 3.3 s
  (read refused while another Pipeline process was live), `heal` 6.9-7.0 s, with 25 native in-flight reservations and 25
  queue rows (`scratch/wave3/measure-lock.mjs`). The hold time is the cause, not a stale lock; `heal` before each
  dispatch only hides the live-holder case.
- A second refusal class seen in the same session: `DBG-GENERATED-DIGEST-MISMATCH` when a long generated briefing is
  re-typed by the Elephant instead of passed from the file (see `2026-10-26-briefing-dispatch-needs-hand-retyping.md`).
  It makes every briefing transfer a gamble and defeats a fan-out of several dispatches.
- Consequence for the fix order: Wanted 1 and 2 (no scan under the lock, cost independent of settled history; held patch
  D177 covers the settled-history part) must land before any fan-out can be reliable; raising the 1.5 s wait instead
  would contradict the 10 s hook-budget reasoning pinned in `session-authority-lock-wait.test.mjs`. Add to Acceptance:
  two `Agent` calls in one message are both admitted.

## Fan-out measurement 2, 2026-10-27 (after D177 was applied and installed in the 17-patch stamp)

- Two background `Agent` calls in ONE message, right after `heal` (registry readable, 25 native reservations, all settled):
  the first was refused by the new typed `GUARD-DISPATCH-SLOW`: phase `integrated-slice-read` at 10.6 s, `collision-check` at
  56.5 s, `mint` at 101.2 s, over the 100 s budget. The second was refused `SDC-LOCK-HELD` (`registry-lock-held`) while the
  first still held the lock. So D177 turned a silent kill into a typed, visible refusal, but admission itself still takes about
  100 s: no fan-out, and not even a single dispatch, is admitted in time.
- Phase cost: `collision-check` about 46 s and `mint` about 45 s dominate, `integrated-slice-read` about 11 s.
- The same call prints about 70 `GUARD-DISPATCH-SECOND-WRITER-UNJUDGED` and `GUARD-DISPATCH-SCOPE-UNKNOWN` entries: open
  `evidence/dispatch-record-*.json` records (git-ignored, 2026-10-09 era, `no-owner-claim`) whose write scope cannot be read.
  Hypothesis, NOT yet measured: the `collision-check` cost scales with those unreadable records (Wanted 6, retire route). Next
  measurement: time `collision-check` with the stale set excluded in a scratch clone.
- Acceptance stays: two `Agent` calls in one message are both admitted, each in well under 30 s.

## D182 result and what stays open (2026-10-27)

- Root cause found by a CPU profile of the admission with D177 installed (110 s, 92 s of it inside the registry lock):
  `inspectSourceOwnedSessionAuthorityMemberRecord` reads and reconciles the WHOLE registry per member (about 0.8 s each with 25
  members). `computeNativeIntegratedSlices` (once per (skipCancelled, only) shape, so twice per admission, memo keys differ),
  `readNativeReleasedItemReservations` and `nativeConcurrentPlan` each walked every member: four full passes, about 85 s.
  D177's memo cannot hit across shapes and does not touch the per-member read.
- D182 (Elephant exception by PO decision 2026-10-27, commit `e41348d1c`): a batch `inspectSourceOwnedSessionAuthorityMemberRecords`
  reads the registry once; `inspectNativeMemberRecords` memoises that pass per admission and member set. Measured with the repo
  copy of the hook: integrated-slice-read 49 s to about 5 s, collision-check 48 s to about 2.5 s, whole admission 110 s to about
  20 s (until the baseline phase). Not yet verified on the installed copy, not yet re-measured as a fan-out of two.
- Still open and deliberately NOT part of D182:
  1. The registry is append-only: released member rows are never compacted, so the single pass grows linearly with every
     dispatch (about 0.8 s today plus 25 rows to parse). Compaction of settled members is a core-registry decision (audit
     semantics, protected path) and needs its own slice and Critic review. Right place: a `compact` verb of
     `session-authority-repair.mjs` that archives released members older than the candidate into a sealed archive record,
     called from the bootstrap housekeeping step (Wanted 7) and from `heal`, never from the admission hook.
  2. The registry lock is still held for the whole remaining admission (about 20 s), so two Agent calls in one message still
     serialize on `SDC-LOCK-HELD` after 1.5 s. Wanted 1 (no scan inside the lock) is the fix for fan-out; D182 only makes the
     serialized path fast.
  3. `GUARD-DISPATCH-SECOND-WRITER-UNJUDGED` still lists about 70 stale `evidence/dispatch-record-*.json` records on every call
     (Wanted 6 retire route); measured cost is small (0.3 s plus 4 s for the scope overlap), but the output is noise.

## Wanted

1. No git or file-tree scan inside the registry lock: compute the integration and baseline facts first, then take the lock
   only for the compare-and-publish (or memoise per queue row keyed by candidate commit).
2. The cost must not grow with settled history: settled/cancelled slices (49 of 94) and `integrated-by-commit`
   reservations should be skipped by a cheap check, not re-proven every dispatch.
3. A visible budget: print a one-line stderr heartbeat every 10 s and fail with a typed `GUARD-DISPATCH-SLOW` before the
   hook budget (naming the phase and elapsed time) instead of being killed holding the lock.
4. Run the dirty-baseline check FIRST (one `git diff --name-only HEAD`), so a refusal that costs nothing is not delivered
   after minutes.
5. Release the lock on SIGTERM/hook timeout, or make the abandoned lock self-reclaimable without `heal`.
6. A stale open `dispatch-record-*.json` set (70 records, no owner claim) needs a sanctioned retire route; the
   second-writer warning currently prints all of them on every dispatch.

7. Housekeeping must run on its own, not on a PO request. Three layers:
   1. **At the source.** A slice that finishes, is cancelled or stops releases its reservation and its dispatch record in
      the same transaction; the admission process releases the registry lock on SIGTERM and on budget exhaustion
      (see Wanted 5).
   2. **At session start.** A `housekeeping` step in the bootstrap (bounded, time-boxed, non-blocking) archives settled
      reservations and dead locks, prunes `.git/agent-pipeline/session-authority-abandoned` entries older than 7 days,
      and offers a sanctioned retire route for stale `evidence/dispatch-record-*.json` records without an owner claim
      (Wanted 6).
   3. **On a timer.** Cleanup of `scratch/` content older than 14 days that no open slice references, and of hook state
      directories (about 170 MB today), run from the same housekeeping step with a per-run budget so it never delays the
      first prompt.

   Every layer reports what it removed in one line and never touches a path an open slice, a pending PO command or a
   protected path refers to.

## Acceptance

- Admission of one Goldfish dispatch finishes in well under 30 s with the current history (94 rows, 22 in-flight), measured
  with `scratch`-free reproduction: `guard-dispatch.mjs` run with a payload that carries a tool-use id.
- After 100 consecutive dispatches (with settle and cancel mixed in) admission still finishes in under 30 s, without a
  manual `heal`.
- A hook killed at its budget leaves no registry lock.
- A dirty tracked path is reported within one second.
- The diagnostics used to measure this (`time-agent-hooks.mjs`, `prof-top.mjs`) are promoted from `scratch/wave3` to
  `scripts/` with a usage header and listed in `docs/operating-tools.md`.
