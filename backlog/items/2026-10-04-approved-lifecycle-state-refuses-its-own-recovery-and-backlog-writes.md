---
schema: pipeline.backlog-item.v1
id: pipeline.approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "Live observation, Claude Code session on native Windows, 2026-10-04, feat/sprint-alfred at ae7ef5a23, lifecycle approved (between approve-plan and set-phase)."
sprint: alfred
done_when: manual
---

# The `approved` lifecycle state refuses its own recovery command and backlog writes

## Description

Between `approve-plan` and `set-phase --phase implementation` the lifecycle is
`approved`. When `set-phase` is refused there, the session is stuck in a state
in which almost nothing works:

- A Write to `backlog/items/` is refused with `GUARD-LIFECYCLE-NOT-READY`:
  the session readiness observation "failed the ready-gate's own shape
  validation (PORG-INVALID-OBSERVATION)". The denial says to re-run the typed
  `project-onboarding-v3` session inspection.
- That inspection (`project-onboarding-v3.mjs inspect --root <root> --intent
  session`) is itself refused with `GUARD-DEVPLAN-SHELL`, lane
  `opaque-script-execution`. The recovery the denial names cannot run.
- Read-only diagnostics such as `diff`, `cp` of a file into `scratch/`, and
  `git diff --no-index` are refused with the same readiness code.
- Running any script, including a test suite under `scratch/`, is refused,
  so a dispatched Goldfish could not verify its own work (hotfixes 9 and 10
  had to be test-run by the PO).
- In `implementing`, an Elephant commit of backlog items with `Dispatch: stage-0 (elephant)` is refused by the commit-msg hook (`GUARD-DEVPLAN-LIFECYCLE`), and without a `Dispatch:` trailer by the git guard (`GIT-03-DISPATCH-MISSING`); every tracked record write after the design phase therefore needs a Goldfish dispatch.

Only writes under `scratch/` and the lifecycle CLI itself were admitted. The
state is a mandatory pass-through, yet a refusal of its single exit leaves no
in-session route to record the defect, inspect readiness, or test a fix.

## Triggering situation

`set-phase --phase implementation` refused after the signed final approval of
the Alfred revision-4 package (2026-10-04); see
`2026-10-04-brownfield-implementation-entry-demands-a-greenfield-design-block.md`.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (session readiness
observation shape in the `approved` state; opaque-execution lane);
`plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs`.

## Proposal

- The ready-gate must produce a valid observation for every lifecycle state
  the writer can produce, `approved` included (writer/observer conformance,
  Spec §4.5 (ii)).
- Every recovery command a denial names must be admitted in the state that
  emits it (R1 catalogue rule).
- `backlog/`, `docs/` and `scratch/` writes stay admitted in every phase.
- Consider removing `approved` as a resting state: approval and the phase
  transition can be one writer transaction when entry readiness passes (input
  for the Fable process review).

## Observed 2026-10-18: AGY greenfield, materialize-architecture refused in devplan (F-01)

Source: PO-supplied forensic analysis of the Antigravity greenfield run on WSL
(`scratch/pipeline-analyse-greenfield_agy_20261026.md`, finding F-01, improvement 1).
The run used installed `pipeline-core` 0.6.2, not the 0.7.0 candidate.

- After the design signature, `onboarding-init.mjs` refused the move to `implementation`
  until the architecture was materialized, while `guard-lifecycle-ready` refused the agent's
  `pipeline-state.mjs materialize-architecture --input scratch/<file>.json` in `devplan`
  (`GUARD-UNAPPROVED-COMMAND-FORM`). The agent escaped through a `perl` scratch script
  (164 steps, about 22 minutes).
- Re-check against 0.7.0 (2026-10-18): the `--input` form no longer exists. The materializer
  reads the approved design itself, and `pipeline-state.mjs` refuses any argument.
  `lib/guard/sanctioned-args-scripts.mjs` admits exactly the bare
  `materialize-architecture`, the devplan lane delegates to that sanctioned set, and the
  onboarding plan now emits the step itself (`scripts/project-onboarding-e2e.test.mjs`).
  The deadlock as observed is therefore not reproducible from 0.7.0 source.
- Remaining gap: no test drives the devplan shell lane with the exact producer-emitted
  `node <plugin>/scripts/pipeline-state.mjs materialize-architecture` and proves it is
  admitted, nor that the dead `--input` spelling is refused with a typed hint naming the
  bare form. The `perl` escape also shows that an opaque interpreter is a working way
  around a lane refusal.

Added acceptance (0.7.0, major):

- A pin drives the devplan lane with the onboarding plan's exact materialize action and
  proves it is admitted; the `--input` spelling is refused with a hint naming the bare form.
- An opaque `perl <scratch script>` (and other interpreters) is no wider in devplan than
  `node <scratch script>`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
