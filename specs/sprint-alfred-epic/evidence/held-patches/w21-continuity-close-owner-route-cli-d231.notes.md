# W21 D231 owner route: measurement (D) STOP, no production code written

Slice: W21-CONTINUITY-CLOSE-OWNER-ROUTE-BUILD-D231-20261101
Candidate: 0a11ebc6e2e4d815172383f39cb07ea4c74c900c (prepared clone `scratch/agent-out/w32own/clone`, baseline `clone2`)
Outcome: `checkpoint`. The briefed stop condition "an allowlisted entry cannot be released after the bind: stop before production code" fired for `close-feature`.
Changed in the clone: only an untracked measurement probe (`scratch/probe-d.mjs`, a named test seam, not a shipped path). No production file, no test, no patch.
The `.patch` slice file is intentionally absent.

## Result in one paragraph

The four read/CAS entries of the allowlist (`continuity-result-bootstrap-plan`, `continuity-result-bootstrap-apply`, `continuity-result-close-plan`,
`continuity-result-close-apply`) were run bind -> one entry -> release and leave a State that releases cleanly (measured below). `close-feature`
cannot run in that lifetime. MEASURED: driven through the companion port after the four, it is refused before any write with `WT-OWNED-CLOSURE-UNAVAILABLE`
(State bytes unchanged, binding still releasable) even under the fixture assurance, because its State write runs inside the retired-owner terminal route
(`runOwnedContinuityRetiredTerminal`), which first demands that the owner descriptor is already retired (`physical-owner-retirement`); a per-invocation
`controller-<random>` descriptor is never retired by a bind -> one entry -> release call. By code reading, a second layer sits on top: that route is built
only for the `controlled-unit-method` fixture assurance, never for the `physical-readback` assurance a production issuer (the approved-controller precedent)
mints. Making it work is not a wiring step: it needs a retirement lifecycle for the owner descriptor and an extension of the terminal to a second
assurance, and none of the three test files that call `executeCompanionOperation` names `close-feature`. That is a gate-design decision, so it is reported
and not built. A half route (four entries only, step 7 of the
ordered route still refused with `SDC-AUTHORITY-UNAVAILABLE` for a catalogue project) was not built either.

## Fact check of the briefing / W11 line references (against the candidate)

All confirmed unchanged: `scripts/pipeline-state.mjs` companion routing 13967-13983, `STATE_COMPANION_ENTRIES` 14474, `prepareStateCompanion` 14550 (refusal text
`companion-owning-lifecycle-context-required` 14556), `readSourceOwnedOnboardingContinuityCompanionContext` (onboarding-continuity 10337),
`continuityExecuteCompanionOperation` 10641, `runOwnedContinuityCompanionState` 10738, `bindOnboardingSessionCleanup` 9967 (D48 text 9972),
`releaseOnboardingSessionCleanup` 9992, approved-controller issuer in `lib/session-requester-bridge.mjs` 1555-1636, fixtures `bindRouteOwner`/`ownedCli`
(`design-approval-route.e2e.test.mjs` 272/311) and the controlled-method walk (`pipeline-state-result-bootstrap.test.mjs` 423-510).

## Measurement (D)

Probe: fixture project WITH a session-authority catalogue (same fixture as the controlled-METHOD walk, registered package), fixture requester (assurance
`controlled-unit-method`, a named seam: the new issuer does not exist yet). Sequence: `prepareOperation`/reserve/`executeOperation` (bind) -> entries ->
`port.finishOperation(release)` + `releaseSessionAuthorityMember` (exactly the two steps `releaseOnboardingSessionCleanup` drives for a non-retired owner,
10002-10009). Command: `node scratch/agent-out/w32own/driver.mjs run c1 scratch/probe-d.mjs` (exit 0; log `c1.probe-d.mjs.log` next to the driver).
Printed evidence (State preimage/postimage hashes omitted):

```
registry: initialized
bind: executed
afterBind: sessionCleanup bound, neutral true, mode active, memberPhase armed
bootstrap-plan: completed, exit 0
bootstrap-apply: completed, exit 0          (State revision 7 -> 8, Result bound)
close-plan:      completed, exit 0
close-apply:     completed, exit 0          (State revision 8 -> 9)
close-feature:   unavailable, code WT-OWNED-CLOSURE-UNAVAILABLE, attempted true, State bytes unchanged
afterApply: sessionCleanup still bound, revision 9, memberPhase armed
finish: observed
releaseMember: releaseRef written
afterRelease: sessionCleanup null, memberPhase released
```

| Entry | Run through the companion port after a bind | Released afterwards | Basis |
|---|---|---|---|
| `continuity-result-bootstrap-plan` | completed, exit 0 | yes | run |
| `continuity-result-bootstrap-apply` | completed, exit 0 | yes | run |
| `continuity-result-close-plan` | completed, exit 0 | yes | run |
| `continuity-result-close-apply` | completed, exit 0 | yes | run |
| `close-feature` | run: refused before any write, `WT-OWNED-CLOSURE-UNAVAILABLE` (fixture assurance) | the binding stays releasable, but the entry never completes | run for the refusal; code reading for the `physical-readback` layer below |

The release path of the four is assurance-independent by code: `continuityAuthorityFinish` (9911) takes the non-retired branch whenever
`inspectOwnedSessionDescriptorClosure` is not `physical-owner-retirement` (10002), which holds until a descriptor has been retired. So the run under the
fixture assurance carries over to `physical-readback` for these four, except that this is not run with a production issuer (none exists yet).

### Why `close-feature` stops

0. (measured) `runOwnedContinuityRetiredTerminal` calls `observeOwnedSessionDescriptorClosureHandle` (11516, worktree-lifecycle 2443-2450) before running the
   entry; that requires the owner descriptor's closure to be `closed` already. Nothing in a bind -> one entry -> release lifetime retires the descriptor, so the
   entry refuses (`WT-OWNED-CLOSURE-UNAVAILABLE`) under any assurance. This is the primary reason; the layers below apply once the descriptor is retired.
1. `runOwnedContinuityCompanionState` (10738-10755) wraps `close-feature` unconditionally in `runOwnedContinuityRetiredTerminal` (11505-11526). That function
   refuses with `continuity original local invocation unavailable` (11512) unless `continuityRetainedOwnerInvocations` holds the operation.
2. The only writer of that map is `retainContinuityControlledOwnerInvocation` (11468), called from `prepareOperation` (9844). It returns without retaining
   when `observed.assurance !== 'controlled-unit-method'` (11472). A requester built like the approved controller (`assurance: 'physical-readback'`,
   bridge 1615/1626) is therefore never retained.
3. Even with retention, `continuityReadRetiredOwner` (11486-11504) requires `observed.assurance === 'controlled-unit-method'` (11496), and the release after a
   retirement takes the same retired terminal (10002-10003, `continuityAuthorityFinish` 9920).
4. `retiredOwnerTerminalObservation` (bridge 809-832) also pins the original invocation process through `observePosixProcess`/`sameProcess`; the approved
   controller invocation records its process through `osvObservedProcess`. Whether the two shapes compare equal was not measured.

Missing piece, named: (a) who retires the per-invocation owner descriptor before `close-feature` runs (today only the owning session-cleanup lifecycle does), and
(b) the retired-owner terminal (retention, `continuityReadRetiredOwner`, the bridge terminal observation and the descriptor-retirement closure read) for a
`physical-readback` requester, plus a fixture that drives `close-feature` through the companion port end to end (none of the three test files that call
`executeCompanionOperation` names `close-feature`: `architecture-prospective-companion.test.mjs`, `design-approval-route.e2e.test.mjs`,
`pipeline-state-result-bootstrap.test.mjs`). Files involved are inside the briefed scope
(`onboarding-continuity.mjs`, `session-requester-bridge.mjs`), but the change widens who may drive descriptor retirement, so it needs the PO's decision.

## Options for the Coordinator / PO (not decided here)

- A. Re-dispatch the slice as two: slice 1 builds the issuer, CLI, walk and heal for the four proven entries and keeps `close-feature` out of the allowlist
  with a typed refusal naming the missing piece (PO changes answer A: the allowlist loses its fifth entry; step 7 of the ordered route stays on its
  present refusal until slice 2); slice 2 designs the retired-owner terminal for `physical-readback` with its own fixture.
- B. Keep the five-entry allowlist and dispatch the retired-terminal design first, then the owner route.
- C. Take the item's tile B (direct route for the attended close) for `close-feature` only.

## Facts found while measuring, for whoever builds the route

- Close lifecycle (design answer B, "started: checkpointed or later") lives NOT in the State but in the coordinator record
  `<git common dir>/agent-pipeline/publication-close/<lifecycle id>/coordinator.json` (`readCloseCoordinator`, `COORDINATOR_PHASES` in
  `scripts/publication-close-journal.mjs`; `lib/` importing it has precedent: `feature-close-audit-executor.mjs`, `guard-maintenance-window.mjs`). The predicate
  needs the lifecycle id, so the fixed argv shape must carry `--lifecycle <id>` (or the predicate must scan that directory for the active feature id).
  The State keeps `lifecycle.status = implementing` throughout (bootstrap eligibility requires it), so the existing `approvedControllerCourse` predicate would
  probably admit a checkpointed State; it does not check that a close lifecycle exists, which is why design answer B asks for a new predicate (not measured).
- `observeSessionCleanupState().orphanBinding` (2985-3117) is set ONLY for a private binding naming a discarded feature. A controller killed between bind and
  release leaves `sessionCleanup !== null` (State tuple) plus an `armed` member, which that observer reports as a live bound session, not as an orphan. The
  PO's heal requirement (E) therefore cannot reuse `planOrphanSessionCleanupBindingRelease` (3920) as is; the existing recovery text points at
  `session-cleanup.mjs plan-recovery`. How `session-authority-repair heal` treats an armed member of a dead process was not measured (no issuer to kill).
- Direct bindings (`continuityAuthorityDirectBindings`, 9942) hold `port`, `operationHandle`, `executionHandle`, `reserved.memberRef` privately; the CLI needs
  one new `onboarding-continuity.mjs` export that runs `executeCompanionOperation` for the current process's direct binding (the entry then sits between the
  existing `bindOnboardingSessionCleanup` and `releaseOnboardingSessionCleanup`).
- `finishOperation` / `executeCompanionOperation` refuse (`SDC-AUTHORITY-UNAVAILABLE`) outside `runtime.run`; a spawned CLI must keep everything inside one run.
- The release in the controller precedent needs `observeSessionCleanupState` for `expectedStateSha256` / `expectedRevision` taken AFTER the entry.

## Seams and what stays unverified

- Named seam: the fixture requester (`createControlledMethodRuntimeFixture`) in the probe; no shipped path touched.
- The probe `scratch/probe-d.mjs` is git-ignored inside the clone and does not survive driver `cleanup`; the sequence above (fixture of the controlled-METHOD walk,
  then the steps listed) is the reproducible recipe.
- Not run (nothing changed, so none applies): the walk, negatives, heal cases, revert proof, kernel-closure test, `check-verify-case-completion` (VCR01 count moves: none),
  `check-doc-contracts`, driver `patch`.
- Not measured: close-feature with a retired descriptor, or under `physical-readback`; the bridge terminal's process comparison for `physical-readback`; heal over a killed owner;
  native Windows; a real shell session as requester; a real Full Verify; a real consumer repository.

## Recovery

Clone and clone2 are at the candidate (clone carries only the untracked probe and no production change). Decide A, B or C, then re-dispatch with that
decision in the briefing.
