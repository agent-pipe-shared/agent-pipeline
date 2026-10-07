---
schema: pipeline.backlog-item.v1
id: pipeline.fresh-preflight-hides-onboarding-action
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-09-27
source: "Claude/Windows greenfield review F-05, 2026-09-27; reported preflight plugin-refresh-required with advisory nextAction in a fresh self-application project."
sprint: none
done_when: manual
closed_at: 2026-10-07
closure_repository: self
closure_commit: 26fef9e7d26be3d59b7e609c1dad9dd04c747b4d
closure_evidence: specs/sprint-alfred-epic/plans/backlog-triage-2026-10-07.md
---

# Fresh-project preflight should surface the executable onboarding action

## Description

The Claude consumer's first preflight returned `plugin-refresh-required` with
an advisory next action even though the project had not been onboarded. The
agent had to find the onboarding driver in documentation. Refresh status may
still matter, but it did not tell the agent how to progress on the primary
fresh-project path. This is a reported usability issue; the exact self-
application source-attestation decision needs replay.

## Affected artifact

`pipeline-start-preflight.mjs`, pipeline-start guidance, and onboarding action
projection.

## Proposal

Expose the actual `onboarding-init`/inspection action as the primary next
action when it is admissible. Carry plugin-refresh status separately as an
advisory unless it truly prevents the onboarding action.

## Acceptance

- A fresh self-application Claude project gets a concrete runnable next
  action from preflight without searching skill prose.
- A genuinely incompatible plugin still produces a blocking refresh action.
- The action and advisory each state their authority and do not contradict
  onboarding inspection.

## Triage

- **Decision:** closed — fixed in source
- **Rationale:** Fix: `scripts/pipeline-start-preflight.mjs` line 1594. Test: `scripts/pipeline-start-preflight.test.mjs` lines 566-594.
- **Assignment:** n/a
- **Date:** 2026-10-07

## Prepared Codex boundary verification (2026-09-28)

Five regular fixture cases pass for the exact proposed preflight bytes. An
actually empty temporary root is inspected through the real readiness gate:
under soft plugin refresh it yields `portable-seed-required` and the proposed
preflight publishes the exact driver action. Canonical preflight instead
publishes advisory without probing that root. Missing plugin manifest and real
missing private installed-copy receipt remain hard, exit 2; project readiness
is not called. A typed injected source mismatch also retains `nextAction:null`.

`scratch/preflight-boundary-evidence.md` records commands, five-case output and
the proposed SHA-256 `1ca46294e9d2e5765138aa584b4150738c323216cbfdd8f983f6e393168da85d`,
verified against current virtual metadata. Registry/manifest observations are
hermetic fixture inputs; this is not native installed-host attestation.

Source audit finds no distinct genuinely-incompatible-plugin classification.
Version inequality is treated as soft refresh and cannot establish semantic
incompatibility. Separate refresh advisory publication also remains open when
the driver becomes the primary action. Productive integration and real host
acceptance remain pending; current live scope is Codex, no Claude pass claimed.
