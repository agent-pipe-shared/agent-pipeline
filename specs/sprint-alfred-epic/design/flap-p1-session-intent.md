# FLAP-P1: a ready `bootstrap` is followed by a `partial` session (design note)

Status: design note, uncommitted. Dispatch FLAP-P1. Candidate commit `792f8ab22`.
Backlog item: `backlog/items/2026-10-03-session-readiness-drops-to-partial-after-bootstrap-ready.md`, Proposal P1.
Evidence class: code reading with file:line. Nothing below was executed or measured by this dispatch
unless it says so. No source file was changed.

## 1. Mechanism (a): which receipt does the guard read?

None. The guard reads no receipt and no persisted readiness state.

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:6466-6472` (`evaluateAfterGrammarAdmission`) calls
  `requireProjectOnboardingReady({rootDir, intent: "session", runner})` on every governed tool call.
- `plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs:419-421` runs
  `inspectProjectOnboardingV3({rootDir, intent, runner})` live. `:459-473` turns any status other than `ready`
  into `PORG-NOT-READY` carrying `lifecycleStatus` (here `partial`).
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs:5466-5513` (`inspectProjectOnboardingV3`) is a pure read apart from
  two side effects: `clearConsentMarker` on a session-intent `ready` result (`:5505-5511`) and the cleanup auto-apply below.

So a ready `--intent bootstrap` inspection cannot "refresh" anything the guard reads. The guard re-derives
session readiness on each call. Parallel tool calls in one turn are N independent live derivations, which
is why one of two parallel `git grep` calls was refused and one admitted (the item's Description).

### Why running the bootstrap inspection seemed to clear `partial`

Hypothesis from code, not measured:

1. The strict cleanup observation runs for EVERY intent, once local Git and valid continuity exist:
   `project-onboarding-v3.mjs:3317-3329` calls `partialCleanupRecoveryResult(... strict: true ...)` with no intent
   condition. A `ready` typed recovery plan is auto-applied (`:1813-1823`, `activate: true`). That is a mutation that
   removes the residue, so ANY inspection (either intent) can leave the next session derivation clean.
2. The two intents are still not equivalent. They differ in exactly these places:

| Where | bootstrap | session |
|---|---|---|
| `project-onboarding-v3.mjs:1851-1869` bare `cleanup-required` residue (plan carries no typed action) | falls through, `:1929` returns `null`, so ready | `partial` + `cleanupHumanRecoveryAction`, or a foreign-residue warning (`:1773-1783`, `:1861-1868`) |
| `:2257` `sessionCapability` | `not-required` | `not-observed`, must be observed |
| `:4777-4781` `local-uninitialized`, `host-managed` | tolerated | `control-path-invalid` / `repository-mode-unsupported` unless session capability passed |
| `:5505` consent marker clear | never | on `ready` |

   Row 1 is the deterministic part of the mismatch: a bootstrap inspection is blind to a bare cleanup residue that the
   guard's session derivation blocks on. The preflight's own probe is also `bootstrap`
   (`pipeline-start-preflight.mjs:1422`) and its `nextAction` is `inspect --intent bootstrap`
   (`:1585-1604`; `SKILL.md:114`). The `partial` refusal text itself prescribes `--intent session`
   (`guard-lifecycle-ready.mjs:995`), which preflight and skill never name. This matches the item's Description.
3. The MEASURED flap (item, "Observed again 2026-10-05 (measured)": 2 of 60 session inspections, both
   `cleanup_recovery_observation_unavailable`) is NOT intent-dependent. It comes from the strict `catch` at
   `project-onboarding-v3.mjs:1908-1925`, which runs for bootstrap too (point 1). A bootstrap run under the same
   4-5 concurrent agents would flap at the same rate; that was not measured. Retry already exists
   (`:1742-1767`, FLAP2: 3 attempts, 50/100 ms) but only for 7 transient codes (`:1743-1751`). The diagnostic message
   carries the failing cause (`:1921`, `(cause: <code>)`); the item does not record the two causes. They are the
   first thing to capture.

Conclusion for P1: switching the preflight to `session` closes the deterministic intent gap (row 1) and gives the agent
the typed way forward, but it does NOT cure the measured flap. That needs a change inside the 1700-1950 region
(retry/transient set) or a snapshot (P3), both outside this dispatch's authority.

## 2. Recommendation

R1 (P1, smallest, preflight-only, guard untouched). In `pipeline-start-preflight.mjs`, directly after the bootstrap
probe at `:1419-1427`: when that probe succeeded, probe the same function with `intent: "session"`. On a
`PORG-NOT-READY` from the session probe, set a local `sessionReadinessNotReady = true`. In the `nextAction`
ternary at `:1563-1604`, in the `ready` non-onboarding branch emit the same command with `--intent session` instead
of `--intent bootstrap` when `sessionReadinessNotReady` is true. Leave everything else as is.

- Why additive and not "always `session`": the existing preflight tests pin the default argv with `deepEqual`
  (`pipeline-start-preflight.test.mjs:311-330` and `:607-626`, both `--intent bootstrap`, mocks that ignore the intent
  argument and return ready). Changing the default needs edits to those tests, which a Goldfish may not make. With the
  additive rule those tests stay green because the mocked session probe is also ready.
- Chain: preflight -> `inspect --intent session` -> its own typed `nextAction` (cleanup recovery). The guard
  already admits `inspect ... --intent <value>` shapes (`guard-lifecycle-ready.mjs:4647`, `:4674`, `:4704`).
- Costs/risks: one more full inspection per preflight. It has the same side effects the guard's own derivation
  already has. Add a typed `sessionReadiness` field only if the preflight consumers tolerate a new key; not checked.
  It is another sample of the flaky observation, so it may point at `--intent session` spuriously (3 % rate); the
  action is a read-only re-inspection, so that is harmless.

R2 (documentation, optional, safe): add to `SKILL.md` near `:114` one sentence: an interactive session is gated on
`--intent session`; after the bootstrap inspection, if a governed call is refused with `partial`, run that inspection.
No test pins that text as far as read; not checked with a search.

R3 (the real flap fix, separate dispatch): record the cause code in failing runs, extend or restructure the retry in
`project-onboarding-v3.mjs:1757-1767` / `:1908`, and add the typed `partial` transition reason the proposal asks for.

## 3. Test for R1 (deterministic, new file, not written; budget)

New file `plugins/pipeline-core/scripts/pipeline-start-preflight-session-intent.test.mjs`, SPDX line 1. Drive
`observePipelineStartPreflight` with the same stubs as `preflight()` in the existing test (`:167-184`), and
`requireProjectOnboardingReadyFn({intent})` that returns ready for `bootstrap` and throws
`new ProjectOnboardingReadyError("PORG-NOT-READY", ..., {intent: "session", lifecycleStatus: "partial"})` for `session`.

- RED today: `nextAction.argv` ends `--intent bootstrap --runner <runner>`; assertion expects `--intent session`.
- GREEN after R1. Second case: both intents ready -> argv unchanged (`bootstrap`). Third: bootstrap not ready ->
  `onboarding-init` unchanged, session probe not called (assert call log).
- Mechanism proof without a fixture, optional: call the exported `partialCleanupRecoveryResultCore`
  (`project-onboarding-v3.mjs:1788`, "unit-test seam") with an injected `planSessionCleanupRecovery` returning
  `{status: "cleanup-required", nextAction: null}`: `intent: "bootstrap"` returns `null`, `intent: "session"`
  returns `partial`. With an injected throw of a non-transient code and `strict: true`, both intents return
  `partial` (intent independence of the measured flap).

## 4. What a P3 test needs ("parallel read-only calls see one consistent readiness snapshot")

Today there is no snapshot: N parallel calls make N live derivations, each running the strict cleanup observation
and possibly the auto-apply mutation, against state that other agents mutate. A deterministic test needs:

1. A harness that starts K concurrent guard evaluations (child processes of `guard-lifecycle-ready.mjs`, or the exported
   evaluator with `dependencies.requireProjectOnboardingReadyFn` for the in-process variant) with identical `tool_input`.
2. A controllable fault: an injected `planSessionCleanupRecovery` / `classifyActiveSessionDescriptors` that fails
   on a fixed fraction of calls with a non-transient code, or a real second writer toggling a descriptor during the
   observation window in a fixture repo (flaky unless the toggle is synchronised by a barrier file).
3. The assertion: all K verdicts identical, repeated over R rounds; the invariant to pin is "one root state digest ->
   one verdict". RED today because each call samples independently.
4. A design the test can pin: a short-lived readiness snapshot keyed by (root, runner, HEAD, authority/continuity digest)
   or a retry on `cleanup_recovery_observation_unavailable` before reporting `partial`. A cache must never turn a
   real `partial` into `ready` (fail closed); that needs its own negative test.

## 5. Implementation status

Not implemented. Reason: the 80 % tool-use checkpoint was reached after orientation and mechanism; the briefing says to
write the note and report then. Nothing was edited in unprotected or protected files. No test written, so no RED/GREEN
and no run of the preflight test file by this dispatch.

## 6. Briefing-premise correction

The briefing and the item assume a receipt/state that a ready `bootstrap` inspection could refresh. There is none
(section 1). The fix space is "what the preflight tells the agent to run" or "make the derivation stable", not
"write the same receipt for both intents".
