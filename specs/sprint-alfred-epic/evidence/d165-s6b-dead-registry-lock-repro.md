# D165 S6B: governed-item reproduction of the dead-owner registry lock (NOT reproduced)

Slice W6-D165-S6B-LOCKREPRO-20261026. Candidate 409479433378e974fda981583930457ba98a817d. Research only; this note is the only
tracked change. Continues `d165-s6-dead-registry-lock-recon.md` (S6a), whose code-path facts are not repeated.

Verdict in one line: on a governed-item v3 fixture, the PreToolUse admission (`prepareNativeGoldfishHostState`) never left a
registry lock, in a normally exiting child or in one ending with `process.exit(0)`. The defect is not reproduced and the
root cause stays unconfirmed. H1 is refuted for this route; H2 is not settled (a fixture limit, see below).

## Fixture steps (all in a `git clone --shared --no-checkout` of the repository, detached at the candidate)

All git and node calls via spawnSync, no symlinked tree, no shell redirect. The driver (scratch only, deleted) copied the NGHS12
fixture of `lib/native-goldfish-host-state.test.mjs` (~341-351):

1. `git init`, identity config, one empty commit; governance enrolment through `createGovernanceScopeController`
   (`planDecision` enroll, `applyDecision` activate).
2. `prepareApprovedItemCourseFixture({root})` (approved plan, phase implementation, slice-queue course for `specs/unit`).
3. `initializeSessionAuthorityRegistry({repository}, createSessionAuthorityParticipantPorts({repository}))`.
4. A v3 briefing (`pipeline.native-goldfish-host-briefing.v3`, model sonnet, effort medium) whose `itemDelivery` names slice
   `ITEM-AC-1`, item `AC-1`, the fixture's criterionLocator and one check; the prompt carries
   `<!-- pipeline-native-goldfish-host-commit:v3`, `Slice:` and `Write scope:` lines. Tool input: `tool_name: "Agent"`,
   `run_in_background: true` (scenario D: `false`), subagent `pipeline-core:goldfish-implementor`.
5. Per scenario a FRESH child node process calls `prepareNativeGoldfishHostState({root, runner:"claude", input,
   subagentStopCompletionRegistered:true})`, prints its result and ends naturally (A) or via `process.exit(0)` after the
   write (B). The parent then reads registry.lock (found by walking the git common dir), the owner pid, and `kill(pid,0)`.
6. Then the PostToolUse route (step 3 of the briefing) in a second child: `finalizeNativeGoldfishHostReturn` with
   `hook_event_name: "PostToolUse"`, `tool_response.status: "async_launched"`, same tool_use_id.
7. Then a second admission in a third child (new tool_use_id, no repair), then a bare `withSessionAuthorityBoundary` probe child.

Fixture deviation, stated plainly: without the controlled-method runtime the call is refused
`SDC-AUTHORITY-UNAVAILABLE / item-course-requester-unavailable` (the queue-row writer needs a requester; lock absent). The
children therefore wrap the call in `createControlledMethodRuntimeFixture(...).run(...)` exactly as NGHS12 does. The live hook
may reach the requester differently; that difference is unmeasured here.

## Observations

| # | Scenario | Step | Result | Lock | Owner alive | Drift | Code |
|---|---|---|---|---|---|---|---|
| 1 | A bg, natural exit | after init | - | absent | - | none seen | - |
| 2 | A | call1 admission | ok | absent | - | none seen | NGHS-STORED |
| 3 | A | PostToolUse async_launched | threw | absent | - | none seen | SDC-REQUESTER-UNAVAILABLE |
| 4 | A | call2 admission | threw | absent | - | none seen | SDC-REQUESTER-UNAVAILABLE |
| 5 | A | bare boundary probe | entered | absent | - | none seen | - |
| 6 | B bg, process.exit(0) | call1 admission | ok | absent | - | none seen | NGHS-STORED |
| 7 | B | PostToolUse async_launched | threw | absent | - | none seen | SDC-REQUESTER-UNAVAILABLE |
| 8 | B | call2 admission | threw | absent | - | none seen | SDC-REQUESTER-UNAVAILABLE |
| 9 | B | bare boundary probe | entered | absent | - | none seen | - |
| 10 | C bg, forced transition throw (clone-only seam) | call1 | ok | absent | - | none seen | NGHS-STORED |
| 11 | C | call2 / probe | threw / entered | absent | - | none seen | SDC-REQUESTER-UNAVAILABLE / - |
| 12 | D foreground | call1 / call2 / probe | ok / threw / entered | absent | - | none seen | NGHS-STORED / SDC-REQUESTER-UNAVAILABLE / - |

"Drift none seen" means only that no lock or drift symptom surfaced in these calls; the human-guard-override producer
drift (command-offers / `human-guard-override:namespace-drift`) was not measured directly (no heal or inspect run).

Reading rows 3, 4, 7, 8: `SDC-REQUESTER-UNAVAILABLE / requester prerequisite` in a SECOND child is most likely a fixture
artifact (the single-use controlled-method runtime fixture was created again over the same fixtureRoot in every child), not
the live defect. The lock was absent after every one, and the bare boundary probe in a fresh child always entered, so no
second admission was ever refused `SDC-LOCK-HELD`. This was not investigated further (budget).

## Hypothesis verdicts

- H1 (retainDomainTransition or an altered lock makes the `finally` throw before `unlinkSync`): REFUTED for the admission
  route. The clone-only seam `if(process.env.S6B_FORCE)throw` placed after `ticket.updates=[];` in the domain-transition
  body (session-authority-registry.mjs:1330, setter catch at :1342) changed nothing in scenario C: call1 still returned
  NGHS-STORED and no lock was left. So the domain-transition body is not executed by `prepareNativeGoldfishHostState`; the
  `retainDomainTransition` flag at :1342 and the throw at :331 cannot be what strands the lock on this route. The Windows
  setter (:105-122) does not run on this Linux host.
- H2 (lock stranded by the PostToolUse or SubagentStop host-commit route): NOT SETTLED. The PostToolUse launch-result call
  (native-goldfish-host-finalizer.mjs:237-252, NGHF-PENDING-UNAVAILABLE at :250) was driven, but the fixture runtime refused
  it before it reached that branch (rows 3, 7). SubagentStop completion (finalizer :254 route) needs a real child return
  and was not driven.

## Root cause

Not confirmed. Strongest remaining hypothesis: the stranding is not in the PreToolUse admission at all. It happens in a
hook process that dies (is killed or hits the hook timeout) while INSIDE the boundary, between `acquireRegistryLock`
(registry.mjs:286-309) and the `finally` at :331, for example during the SubagentStop or PostToolUse completion in a
separate hook process, or during the final-state write after the child returns. A killed process cannot run the `finally`,
which gives exactly the observed shape: a lock naming an exited pid. The variant "lock absent but producer drift
(namespace-drift)" fits a process killed AFTER the unlink but mid-publication. These need a live Agent dispatch to
observe (the real hook process lifetime and its stop signal), which a scratch child cannot imitate.
What would settle it, cheaply and without a live paid dispatch: a child that calls `withSessionAuthorityBoundary` and is
killed with SIGKILL inside the callback (kill from the parent after a ready line), then a second admission. Expect a stale
lock retired by the dead-owner path (K12-3) and a green second admission; if the second admission is refused, the retirement
path is the bug (registry.mjs:300-302, `retired>=2` and the non-EEXIST branch at :299). Also needed: a hook-timeout read for
guard-dispatch and the SubagentStop hook in hooks.json (a read-only check not done here).

## Final fix slice design (conditional on the check above)

Do NOT edit `finally` for H1: it was refuted for this route.
1. Settle first (one small Goldfish, no kernel edit): add the SIGKILL-in-boundary case to
   `lib/session-authority-lock-wait.test.mjs` and run it.
2. If the dead-owner lock is retired and admission is green: the lock is not the live failure; instead measure the
   hook timeout and which hook holds the boundary when the child returns, and fix by shortening or releasing before a
   long wait.
3. If admission is refused: fix `acquireRegistryLock` (kernel file, kernel route and protected-path rules apply).
Four RED cases, written first against current code: (a) a lock whose owner was SIGKILLed inside the boundary is retired
by the next admission; (b) a successful boundary run with `retainDomainTransition` induced still leaves no registry.lock
(unlink before the typed fault); (c) two consecutive admissions after a boundary-killed process both succeed with no repair;
(d) a first open error other than EEXIST on Linux observes the lock before reporting `registry-lock-held` (S6a note on :299).

## Not reached

Direct measurement of producer drift, the live hook process lifetime, the SubagentStop completion route, baseline suite
counts, and any reproduction that needs a live Agent dispatch. The scratch clone and driver were deleted.
