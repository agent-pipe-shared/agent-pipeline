# D165 S6A recon: dead-owner registry lock after a background Agent dispatch (INTERIM, blocked on budget)

Slice W6-D165-S6A-LOCKRECON-20261026. Candidate 87dbd1fa52fd4878cf723971720304b349c6b0ca. Research only; no tracked file other
than this note changed. Work ran in a scratch `git clone --shared` detached at the candidate; driver files were under
`scratch/agent-out/w6-s6a/` (setup.mjs, call.mjs, repro.mjs; all git and node calls via spawnSync, no shell redirect).

Status: the root cause is NOT confirmed. The tool budget ended before the reproduction reached the lock code. What is
established and what is missing are separated below.

## 1. Baseline at HEAD (step 1)

Run once in the clone with `node --test <file>` through spawnSync. The driver's count filter matched no line (the reporter
prints `ℹ tests N`, not the `# tests` TAP form), so printed counts were NOT captured; only exit codes are evidence.

| Suite | Exit |
|---|---|
| lib/session-authority-lock-wait.test.mjs | 0 (green) |
| hooks/guard-dispatch.test.mjs | 1 (RED at HEAD; failing case names not captured) |
| lib/native-goldfish-host-state-fanout.test.mjs | 0 (green) |
| lib/model-family-host-store.test.mjs | not finished when the budget ended |
| lib/guard-maintenance-window-kernel-closure.test.mjs | not finished when the budget ended |

Open: which guard-dispatch cases are red and whether they relate to the lock. Re-run with `--test-reporter=tap` or
`spec` and keep stdout to see names and counts.

## 2. Reproduction (step 2)

Fixture: the lib/session-authority-lock-wait.test.mjs fixture (git repo, governance enrolment, prepareApprovedItemCourseFixture,
initializeSessionAuthorityRegistry). `call.mjs` ran `prepareNativeGoldfishHostState({root, runner:"claude", input,
subagentStopCompletionRegistered:true})` in a child process (tool_name Agent, run_in_background true, v1 briefing with the
real HEAD commit and tree) and exited; the parent then read `registry.lock` and probed the owner pid with `kill(pid,0)`.

Observed (both consecutive calls, no repair between):

- after init: lock absent, no retired directories.
- call 1: `{"ok":false,"code":"SQ-DELIVERY-COURSE-ABSENT", ...}`; lock absent afterwards.
- call 2: identical result; lock absent afterwards.

Meaning: this fixture is an approved feature, so `resolveGovernedItemQueue` reports the queue as required (native-goldfish-host-state.mjs
~207-208, via prepareNativeGoldfishHostStateOnce) and the call is refused BEFORE `publishNativeAuthorityState` (~251) and so before
`withSessionAuthorityBoundary` (~721). The run therefore never entered the code path that could leave a lock. It shows neither
the defect nor its absence. Also seen: parseNativeGoldfishBriefing (native-goldfish-host-return.mjs:87) demands
`itemDelivery` for v3, so a faithful reproduction needs a governed item queue row for the slice, written by the governed course
writer `prepareGovernedItemQueue` (called at ~204 when the binding carries itemDelivery) followed by a v3 briefing whose
`itemDelivery` matches it; the three existing tests that use a v3 prompt are lib/native-goldfish-host-state.test.mjs,
native-goldfish-host-finalizer.test.mjs and native-goldfish-host-finalizer-regression.test.mjs and hold the working fixture to copy.

Step 3 (PostToolUse background launch, NGHF-PENDING-UNAVAILABLE): not reached.

## 3. Code-path facts read this session (file:line, candidate 87dbd1fa5)

- session-authority-registry.mjs:286-309 `acquireRegistryLock`: retires a dead-owner lock inside its loop (302) up to
  `retired>=2`; the typed refusal at 299 fires when `retired>=2`, `races>=64`, or the open error is not EEXIST on non-Windows.
  Note: on Linux a first open failure of any other kind (EACCES, ENOENT of the parent) goes straight to SDC-LOCK-HELD
  `registry-lock-held` without observing the lock; that is a second way to see the same code with no live holder.
- session-authority-registry.mjs:331 `withSessionAuthorityBoundary`: the `finally` runs `fail('SDC-LOCK-HELD',
  'registry-lock-ownership-changed')` if the lock bytes changed, then `fail('SDC-LOCK-HELD',
  'domain-transition-partial-effect-retained')` when `data.retainDomainTransition===true`, and ONLY THEN `unlinkSync(abs)`.
  Both throws precede the unlink, so either one leaves the lock file behind. Because the owning process then exits, the file
  names a dead pid: this matches the defect (a dead-owner lock after an otherwise successful dispatch).
- session-authority-registry.mjs:105-108 `retainNativePublication` sets the flag; its only caller is the Windows branch
  nativePublish (109-122, catch at 121) and ~1342 sets it in the catch of the domain transition. On Linux (this WSL host) the
  Windows branch does not run, so line 1342 is the remaining setter candidate; line 1342 is reached only when a domain
  transition throws.
- native-goldfish-host-state.mjs:721-781: the boundary callback in publishNativeAuthorityState runs reserve (775),
  writeExclusive (777-778) and advance (779). Any throw inside, for example the item-delivery checks at 723-763, propagates
  through the `finally`; with the flag unset the lock is unlinked, so a plain refusal does not strand the lock. Only the two
  `fail` branches above strand it.
- guard-dispatch.mjs:1018-1052: a failed `prepareNativeGoldfishHostState` becomes BLOCKED for an item-governed dispatch (1037)
  and `process.exit(2)`; the error's `code` and `reason` are carried by native-goldfish-host-state.mjs:252. Nothing in this path
  calls a lock-release or retry wrapper, so a stranded lock is never retired by the failing call itself.
- Test coverage: K12-3 (lock-wait.test.mjs:83-90) proves a dead-owner lock at boundary ENTRY is retired. No existing case
  covers a lock left by the `finally` of an earlier successful boundary run.

## 4. Root cause

Not confirmed. Strongest remaining hypothesis (H1): some step inside the dispatch boundary sets
`retainDomainTransition` (line ~1342, the catch of executeSourceOwnedSessionAuthorityDomainTransition, reached through
reserveSessionAuthorityMember or advanceSessionAuthorityMember at native-goldfish-host-state.mjs:775/779), or alters the lock
bytes (`registry-lock-ownership-changed`), so the `finally` at registry.mjs:331 throws before `unlinkSync`. Competing
hypothesis (H2): the lock is not stranded by the guard call but by the SubagentStop or PostToolUse host-commit route (step 3
route), which takes the boundary in a separate hook process.
What would settle it: one reproduction that reaches `withSessionAuthorityBoundary` through a v3 item-delivery fixture
(copy from native-goldfish-host-state.test.mjs), then reads registry.lock and the thrown error's `reason` after the child exits;
`reason === 'domain-transition-partial-effect-retained'` confirms H1 and points at line 1342; an empty-lock result moves the
search to the SubagentStop/PostToolUse route (H2) and to step 3.

## 5. Proposed fix slice (design only, nothing built)

Files: plugins/pipeline-core/lib/session-authority-registry.mjs (the `finally` of withSessionAuthorityBoundary; kernel
file, so the kernel route and its protected-path rules apply: NOT a plain Goldfish edit), and
plugins/pipeline-core/lib/session-authority-lock-wait.test.mjs (cases).
Direction: in the `finally`, release the lock in every case where this process still owns it (unlink first, then report the
retained-transition fault), so a typed fault never leaves a lock; keep the fault itself. RED cases to write first:
1. a dead-owner lock at boundary entry is retired (K12-3 already covers it; keep it);
2. a live-owner lock past the bound still gives SDC-LOCK-HELD naming the holder (K12-2 covers it; keep it);
3. the allow route (a successful boundary run, then an induced `retainDomainTransition`) leaves no registry.lock;
4. two consecutive admissions both succeed (second call after the first, no repair).
Estimated tool calls: about 25 (reproduction fixture 8, RED cases 6, fix 4, kernel verify 7).

## 6. Not reached

Full baseline counts, step 2 on a governed-item fixture, step 3, and confirmation of H1/H2. Cleanup: the scratch clone and
driver under `scratch/agent-out/w6-s6a/` were left in place (untracked and ignored) for the continuation.
