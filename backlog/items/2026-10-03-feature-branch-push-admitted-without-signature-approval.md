---
schema: pipeline.backlog-item.v1
id: pipeline.feature-branch-push-admitted-without-signature-approval
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "PO special finding, 2026-10-03: the last push of feat/sprint-alfred to origin (handover commit a0d83ce78) was admitted without a push signature, although gates.push_approval is signature in this repository."
sprint: alfred
done_when: manual
---

# Feature-branch push was admitted without a signature approval

## Description

`pipeline.user.yaml` sets `gates.push_approval: signature` for this repository.
The PO reports that the most recent push of `feat/sprint-alfred` to `origin`,
which carried the handover commit `a0d83ce78`, needed no signature.
`pipeline-state.mjs inspect` currently reports the stored push approval as
`stale-candidate`, so no current approval can have legitimately covered that
commit. The CLAUDE.md push policy and `docs/push-release-flow.md` require an
approval bound to the exact candidate commit for every push.

Desired direction (PO): the push path should be slimmed down. Only a
release/main promotion keeps the full prerequisite chain (Verify, security,
Critic and so on). In signature mode, **every** push, including a feature-branch
checkpoint push, still needs a signed approval bound to the exact commit.

## Triggering situation

End of the previous session (WSL checkout), handover push before the restart.
Also relevant: the onboarding inspect on this Windows clone reports an
`UNBACKED GATE` (no git pre-push hook installed), so any push outside the
session tool guard goes unchecked here too.

## Affected artifact

`plugins/pipeline-core/hooks/guard-push.mjs`, the push-gate policy and its
feature-branch / checkpoint carve-outs, the pre-push hook installer and
`docs/push-release-flow.md`.

## Proposal

First reconstruct which route admitted the push: session guard, pre-push hook
absent, a checkpoint exemption, or a stale approval wrongly accepted. Add a
regression test asserting that a `signature`-mode push of any branch without a
current commit-bound approval is refused. Then reduce the non-release push
prerequisites to the approval alone.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
