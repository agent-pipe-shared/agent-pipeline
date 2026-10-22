---
schema: pipeline.backlog-item.v1
id: pipeline.agy-driver-dispatch-and-design-routes-incomplete
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "PO observation after the 0.7.0 three-runner greenfield tests, 2026-10-03 (Antigravity test repo docs/pipeline-analyse-greenfield.md)."
sprint: alfred
done_when: manual
---

# Antigravity: driver neglects AGY, dispatches unclean, design cannot complete

## Description

PO observations from the Antigravity greenfield run:

- The onboarding/lifecycle driver does not handle Antigravity sufficiently;
  dispatches did not run cleanly.
- The runner could not produce the design at all, because elementary paths for
  the Critic, the Advisor and the build check (Verify) are missing on AGY.

Findings from the Antigravity analysis (`0.7.0+antigravity.20261003105506.1bd1d7bf`).
Each one must be verified against the source before it is fixed:

- **Befund 2, subagent bootstrap deadlock:** native subagents (`invoke_subagent`)
  inherit `session-<id>/requires-bootstrap.pending`. Every CLI tool call then fails
  with "Mandatory Session Bootstrap" (`hooks/antigravity-pretool-guard.mjs:505-514`).
  Both dispatched subagents were paralysed.
- **Befund 3, stale bootstrap lock after resume:** `armAntigravityBootstrapSession`
  returns `already-armed` without refreshing the lock's mtime, while the preflight
  requires an mtime within 30 minutes
  (`scripts/pipeline-start-preflight.mjs:422`). After a 2 h pause the PO had to
  `touch` the lock manually.
- **Befund 4, mandatory roles unavailable:** profile `feature` requires
  `readiness` and `critic_normal`, but onboarding generates both as
  `unavailable` for Antigravity. `runner-design-readiness-bootstrap.mjs:287`
  stops with `DESIGN-READINESS-ROUTE-UNAVAILABLE`.
- **Befund 5:** a signed override of the routes was undone by the registry
  projection (see `2026-10-03-signature-ceremony-requires-operator-work-and-breaks.md`).
- **Befund 6, scaffold commit circularity:** `resolveV3DutyRoute` reads
  `HEAD:pipeline.user.yaml`, while the draft gate refuses committing that file.
  The PO broke the deadlock with `git commit --no-verify`. See
  `2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md`.
- **Befund 7:** trailer `Dispatch: design (elephant)` documented but rejected (see
  `2026-09-27-installed-design-trailer-example-is-rejected-by-git-guard.md`).

## Acceptance

- The AGY runner completes the same greenfield happy path as Claude and Codex
  (`2026-10-03-three-runner-happy-path-with-two-po-approvals.md`).
- Critic, Advisor and Verify routes exist for AGY or degrade through the
  recorded self-dispatch fallback
  (`2026-10-03-role-route-preflight-with-self-dispatch-fallback.md`).

## Observed 2026-10-18: AGY greenfield run on WSL (F-02, F-04, F-05, handover)

Source: PO-supplied forensic analysis of the Antigravity greenfield run on WSL
(`scratch/pipeline-analyse-greenfield_agy_20261026.md`, findings F-02, F-04, F-05,
improvements 4 and 5), installed `pipeline-core` 0.6.2.

- F-02: `node` lives under an `fnm` install outside the default sandbox. 45 commands,
  including `git commit` through the `exec node` pre-commit hook, failed first with
  exit 127 and were retried outside the sandbox (about 90 steps). Re-check against 0.7.0:
  preflight does not report whether `node` is reachable inside the runner sandbox. The only
  related signal is `observeAntigravityHardEnforcement`, which cannot see exit 127 or
  version-manager installs.
- F-04: `invoke_subagent` was refused three times: a missing agent definition, missing
  native-dispatch preparation, and a re-invocation without a new prepare batch. Re-check
  against 0.7.0: `skills/pipeline-start/references/antigravity-native-dispatch.md`
  documents prepare, then `invoke_subagent`. Considered closed for the documented path.
- F-05: parallel `write_to_file` calls in a Goldfish failed with `permission check failed
  for write_file` (3 of 4). Not re-checked: it needs a live AGY run.
- Handover: `docs/state.md` stayed at its stage-0 text through implementation. Re-check
  against 0.7.0: EL-01 admits `docs/`, but lifecycle readiness may still refuse the write.
  This is unproven.

Added acceptance (0.7.0, minor unless the PO raises it):

- Preflight reports whether the resolved `node` runs inside the runner's default sandbox
  and names the one-time remedy instead of 45 per-command retries.
- The AGY Goldfish agent template forbids parallel file writes in one turn until the hook
  race is fixed.
- The main agent can update the calibrated handover in every phase through an admitted route.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

### Agent measurement of the open acceptance (2026-10-22)

`plugins/pipeline-core/lib/pins/agy-driver-dispatch-and-design-routes-incomplete.test.mjs` now has 14 cases (13 pass, 0 fail, 1 typed todo):

- Handover in every phase: through the Antigravity adapter on a governed high-risk project, a `docs/state.md` write is not refused by
  the EL-01 tripwire, the dev-plan gate, the handover-size guard, the test-path guard or the gate-strength guard in the design phase
  (before plan approval) or the implementation phase, while a production-code write in the same fixture is refused by EL-01 or the
  dev-plan gate. The lifecycle guard has no phase input, and with readiness satisfied it admits the write for the `antigravity` runner
  in both phases. Not measured: a native Antigravity session with a fully onboarded project (the adapter fixture is not ready, so
  lifecycle readiness is the guard that still refuses there), and the 0.6.2-era report that `docs/state.md` stayed at its stage-0 text.
- Critic and Advisor routes: not met. With a native host observation for every role, Antigravity advisor, critic, readiness and the
  mechanic/deep implementors still resolve to `unavailable` with `RRP-ROUTE-CELL-UNAVAILABLE`, and the self-dispatch fallback is legal
  only for the Claude advisor. Registering Antigravity route cells or admitting a fallback for Antigravity is a route-policy decision
  (typed todo in the pin). The implementor and the plan verifier have a native route; every other role resolves to a typed state.
- Verify: not measured as a route. The pin covers only the node-sandbox probe, the Antigravity prerequisite of running the project's verify command.
