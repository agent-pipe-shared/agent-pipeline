# W11 D231 owning-route CLI: step (1) finding, STOP before any production code

Slice: W11-CONTINUITY-CLOSE-OWNER-ROUTE-CLI-D231-20261101
Candidate: c70a7c4e476ca17861f061feca11104aafc7163d (read in the prepared clone `scratch/agent-out/w32own/clone`, `git status` clean at start)
Outcome: `checkpoint` (STOP at the briefed step-(1) stop condition). No production file changed, no test written, no patch produced.
The `.patch` slice file is intentionally absent: the clone carries no change.

## Result in one paragraph

A CLI started from a Claude, Codex or Antigravity shell cannot obtain a production requester identity today, and the `onboarding-continuity`
member cannot be armed from such a process, because the route that issues a requester to a shell-started process for this purpose is not
shipped. Every shipped issuer of a requester handle is origin-pinned to something a plain shell does not hold. The only way to make D231
work is a NEW issuer in `lib/session-requester-bridge.mjs`. That is a new root of authority (a gate design change), not "the same gates",
and it reverses the stated rule in the bind writer ("never from a plain terminal"). It is therefore reported as a proposal with the exact
pieces named, not built. No relaxed gate, no fixture requester in a shipped path, no force flag.

## Fact check of the briefing line references (all against the candidate)

| Briefing reference | Confirmed at |
|---|---|
| `scripts/pipeline-state.mjs` companion routing ~13967-13983 | 13967 (`STATE_COMPANION_ENTRIES.has(sub)`), 13968-13969 (no catalogue: `runStateSource`, direct route), 13979-13983 (`prepareStateCompanion`) |
| `STATE_COMPANION_ENTRIES` ~14474 | 14474 |
| `prepareStateCompanion` ~14550 | 14550; refusal text `companion-owning-lifecycle-context-required` at 14556 |
| `readSourceOwnedOnboardingContinuityCompanionContext` ~10337 | 10337 (returns the `AsyncLocalStorage` store of `continuityCompanionContextScope`, null outside) |
| `executeCompanionOperation` ~9852 | 9852 (port method), implementation `continuityExecuteCompanionOperation` at 10641, scope entry `runOwnedContinuityCompanionState` at 10738 |
| fixture `bindRouteOwner` ~272, `ownedCli` ~311 in `scripts/design-approval-route.e2e.test.mjs` | 272 and 311 |
| `pipeline-state-result-bootstrap.test.mjs` controlled-method walk | 423-510 (creates `createControlledMethodRuntimeFixture`, binds, runs the entries through `runtime.run(() => port.executeCompanionOperation(...))`) |

One correction to the item text: the item says the member is "bound to a requester session". More precisely the member is bound to the
requester's descriptor tuple `{sessionId, descriptorSha256, ownerNonceSha256}` read back through a live `withSourceOwnedAuthorityContext`
scope (`continuityAuthorityCurrent`, onboarding-continuity 9713-9727), and the operation and execution handles are process-local
WeakMap capabilities (`continuityAuthorityOperations`, `continuityAuthorityExecutions`). A second process can never reuse a member armed by
another process; each CLI process would have to bind, run exactly its entry, and release inside its own lifetime.

## Finding of step (1): who can obtain a requester, who can arm the member

The member is armed by `port.prepareOperation({requesterHandle, entry: "bind"})` (onboarding-continuity 9826) -> `reserveSessionAuthorityMember`
(registry) -> `port.executeOperation` (9883). Both `prepareOperation` and `executeOperation` call `continuityAuthorityCurrent`, which accepts only
`readSourceOwnedAuthorityContext` (bridge 205): a live scope entered by `withSourceOwnedAuthorityContext` (bridge 197) around a requester handle.
It never consults the hook-observed session owner. The only code path that binds without a caller-built port is the bind writer
`bindOnboardingSessionCleanup` (onboarding-continuity 9967); its refusal text says a session-cleanup binding "is created only inside a
session-power-controlled invocation, never from a plain terminal".

Every requester handle in the tree comes from one of these issuers (`session-requester-bridge.mjs`):

1. `createControlledMethodRuntimeFixture` (686). Self-attests the current process: it needs only a repository and a free session id, mints a
   descriptor and a binding for `process.pid`, assurance `controlled-unit-method`. This is a test seam by name and by assurance label.
   Shipped code already uses it only behind a fixture constructor (`lib/guard/dispatch-record-lane.mjs` 435-449,
   `createControlledDispatchRecordCreationFixture`, "Controlled METHOD constructor"). Calling it from a shipped CLI would let any shell mint
   an owner for State writes. That is the bypass the briefing forbids. Not used.
2. `createManagedCodexRequesterRuntime` (787). Needs an `invocationHandle` that only `managedRequesterOwner.isOwnedManagedCodexInvocationContext`
   accepts, i.e. the private context of a managed Codex journal (`lib/codex-host-process-supervisor.mjs` 152). A shell does not hold it.
3. `readRequesterTransport` (629). A child process that reads fd 4 from a parent that already holds a requester (the session-power controller,
   `scripts/session-power-controller.mjs` 175). The parent is spawned by `scripts/session-power.mjs` `launchLinuxController` (160-171), which first
   requires `inspectSourceOwnedCurrentAuthorityContext` to be already bound (163-166). The chain is circular: its root is one of the other issuers.
   A Bash tool call of a host session is not a descendant that holds fd 4.
4. `createSourceOwnedApprovedControllerRequesterRuntime` (1600). The only issuer a shell-started process can reach. It is pinned to
   `scripts/owning-verification-controller.mjs` (`approvedControllerProgram` 1587-1597: module path equality, cwd equals the root, exactly six
   arguments `--root --suite --task-source`, process argv equality through `osvProgram`) and to an approved course
   (`approvedControllerCourse` 1555-1585: `observeSessionCleanupState` must be `neutral`, `mode === "active"`, no orphan binding, `planApproved`,
   `activeFeature`, lifecycle status `approved` or `implementing`, `sessionCleanup === null`). The close route runs in a feature that has a
   started close lifecycle and a `closeTransition`, so this course predicate is expected not to admit it (not measured, no code run). In any case the
   issuer is hard-wired to the verification controller module; it cannot be reused for another script without editing it.
5. `claude-hook-session-owner.mjs`. The only shell-adjacent identity: it maps a Claude hook `session_id` to a descriptor. Its own header states it is
   "hook-observed session identity, NOT an authenticated requester" and that the in-process requester "only exists inside a controller process
   that launched the worker". It is consumed only by governed item admission and is not an input of `continuityAuthorityCurrent`.

Conclusion for step (1): no shipped issuer gives a shell-started CLI a requester handle for the close route, and the member cannot be armed
without one. The briefing's stop condition applies exactly: "the member can only be armed through a route that is itself not shipped".
Building the missing issuer is not a mechanical wiring; it decides who may become owner of State writes.

## Concrete proposal (which module would have to expose what)

Mirror the one precedent, the approved-controller issuer, as a second fixed production entry. All of it is protected kernel code and needs a
PO decision on the points under "Decisions required" first.

1. `lib/session-requester-bridge.mjs`: new export, e.g. `createSourceOwnedContinuityOwnerRouteRequesterRuntime({ rootDir })`, shaped like 1600-1636:
   - fixed program pin: module path of the new script (`scripts/continuity-owner-route.mjs`), cwd equals the root, exact argv shape
     `--root <root> --entry <name> -- <entry argv...>`, process argv equality through `osvProgram` (and the native Windows observer branch), replay map
     like `approvedControllerRuntimes`;
   - a course predicate for the close route (a bridge-side function like `approvedControllerCourse`) that reads the real selected State through
     `observeSessionCleanupState` and admits only the Continuity close-route phases (active feature with Continuity, `sessionCleanup === null`, no orphan
     binding, the named entry legal in that phase);
   - the descriptor is a fresh `controller-<random>` session like the approved controller, which means the owner is the CLI invocation itself, not
     the host session (attribution to the Claude session is not carried; say so in the skill);
   - `run(callback)` through `withSourceOwnedAuthorityContext`, `dispose()` that never releases a registry member.
2. `scripts/continuity-owner-route.mjs` (new kernel path, closed allowlist of the companion entries the close route uses): inside `runtime.run`,
   `bindOnboardingSessionCleanup` (it already routes through `port.prepareOperation` + `reserveSessionAuthorityMember` + `executeOperation`,
   onboarding-continuity 9967-9990), then `port.executeCompanionOperation({operationHandle, executionHandle, expectedMemberRef, expectedStateSha256, entry, argv})`,
   then the terminal (`releaseOnboardingSessionCleanup` for the non-terminal entries, as `owning-verification-controller.mjs` 90-115 does; `close-feature`
   keeps its own `runOwnedContinuityRetiredTerminal`, onboarding-continuity 10753). Typed refusals for: entry outside the allowlist, foreign flags, member
   not armable, State not in an admitted phase; each naming the repair.
3. `lib/onboarding-continuity.mjs`: the D48 text of the bind writer (9972) and the `controlled-unit-method` special cases (11427-11572, 12503-12505) have to be
   re-read for the new assurance value (`physical-readback`, as the approved controller uses). No gate is removed; the new route needs readback
   through the same `continuityExecuteCompanionOperation` checks (10641-10733).
4. `skills/close-feature/SKILL.md`: one paragraph at ordered-route step 3 naming the command where a catalogue exists.
5. Tests: a fixture project with a catalogue that spawns the real CLI (the bridge authenticates process argv, so the walk has to spawn, not call a function), the
   negatives from the briefing (outside the allowlist; direct call still SDC-AUTHORITY-UNAVAILABLE; no-catalogue project unchanged), plus a negative that the
   fixture-assurance requester is refused by the new route.
   Reporting duties then apply: the kernel-closure test (`NEVER_LIFTABLE_KERNEL_PATHS`) for the new script, VCR01 counts per file, and a Verify registration if a new test file is created.

## Decisions required before this can be built (why this is a STOP and not a build)

- A. May a process started from a plain terminal become the owner of State writes at all? The bind writer's own text says it must not, and D231
  said "same gates". The new issuer would reverse that rule for the named close-route entries. That is a policy decision, not an implementation choice.
- B. The course predicate (which Continuity phases admit the owner). The approved-controller predicate does not fit; an invented one is the authority model.
- C. Owner identity: a fresh per-invocation descriptor (as the approved controller) or the host session (the hook-observed owner is documented as unauthenticated).
- D. Multi-process lifetime: bind, entry, release per CLI call. Needs a measured check that every entry of the route leaves a releasable State
  (not measured here).
- Alternative already on the table in the item: tile B (direct route for the Result-bootstrap and close entries when the PO attends the command) avoids the
  new issuer but reopens the owner-bound State write.

## Seams and what stays unverified

- Nothing was built, so no seam exists. The fixtures that exist today (`createControlledMethodRuntimeFixture` in `bindRouteOwner`/`ownedCli` and the
  result-bootstrap controlled-METHOD walk) stand in for a real requester; the proposal's walk would still need a named seam for the host session.
- Not run: the walk, the revert proof, the kernel-closure test, `check-verify-case-completion`, `check-doc-contracts`. None applies; nothing changed.
- Not measured: whether the checkpointed close State is refused by `approvedControllerCourse`; whether each route entry is releasable after a bind; native Windows;
  a real host shell as requester; a real Full Verify; a real consumer repository.
- Verified by reading only (no execution): the issuer list above was found with `rg` over the clone's `plugins/pipeline-core` for each constructor and
  for the callers of `spawnSessionPowerControllerChild` (only `scripts/session-power.mjs`) and `spawnRequesterChild` (only the bridge and a Darwin test).

## Recovery / next step for the Coordinator

Put decisions A-C to the PO as a tile (build the new fixed issuer per the proposal, or take tile B, or leave the item open). If the PO chooses the new
issuer, re-dispatch this slice with those decisions stated in the briefing; the clone, driver and candidate are untouched and ready (`git status` clean).
