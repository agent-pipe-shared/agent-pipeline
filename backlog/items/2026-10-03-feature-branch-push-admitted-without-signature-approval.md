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

**Source verification (2026-10-03):** the push was admitted through the
deliberately unsigned *checkpoint lane*. Commit `a0d83ce78` carries
`Checkpoint-Intent:`. `classifyPushDestination`
(`lib/push-destination-policy.mjs:61-80`) classifies a same-ref push under
`pushDestinationPolicy.checkpointNamespace: refs/heads/feat/` as
`feature-checkpoint`. `guard-push.mjs:1948-2019` then admits it after checking
a clean tree, HEAD, the single trailer and architecture currency, and checks no
approval or signature. The pre-push hook mirrors the lane
(`scripts/pre-push-hook-install.mjs:329-347,402-412`) and does not verify the
Ed25519 proof at all (header `:230-241`). Protected-lane pushes do require an
exact-commit approval plus a signature (`guard-push.mjs:2301-2335,2414-2451`).
This was an earlier design choice. The PO requirement now reverses it: in
signature mode the checkpoint lane needs a signed, commit-bound approval too,
while keeping the slim prerequisite set (no Verify, security or Critic chain).

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
