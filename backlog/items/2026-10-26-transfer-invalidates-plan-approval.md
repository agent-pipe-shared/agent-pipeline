---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.transfer-invalidates-plan-approval
type: bug
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
source: "Live WSL PC re-entry after the 2026-10-25 PC/runner transfer (D155)"
done_when: manual
---

# Eine PC-/Runner-Übergabe entwertet die Planfreigabe trotz identischer PRD/Spec

Observed live on 2026-10-26. Related existing criteria: AC-264 (happy path with
two PO approvals), AC-123 (bootstrap/re-entry); D155 promised re-entry through
the new runtime's own pipeline-start with the feature still in implementation.

## Evidence

[Re-entry observation](../../specs/sprint-alfred-epic/evidence/wsl-pc-reentry-2026-10-26/README.md)
and [probe output](../../specs/sprint-alfred-epic/evidence/wsl-pc-reentry-2026-10-26/approval-binding-probe.json):
the PO-gate authority recorded in the plan approval differs from the current one
only in `receiptSha256` and `repositoryFingerprint`; PRD, Spec, source and runtime
digests are identical. `observeCurrentPlanApprovalForCalibration` returns
`CVCT-AUTHORITY-STALE`, so `guard-dispatch` refuses every governed Goldfish
dispatch, and hand-built briefings are refused with
`DBG-GENERATED-BRIEFING-REQUIRED`. A transferred clone also arrives with the
State file at mode 0644 (`CVCT-FILE`).

## PO direction (2026-10-26, chat)

"Spannend! Sowas ist auch ein neues Feature was keiner braucht :-))) wie sollen
Teams so übergreifend arbeiten ?" — a plan approval that only one clone on one
machine can use is not wanted; teams work across machines and clones.

## Acceptance

A recorded plan approval of unchanged PRD/Spec/source content stays usable for
dispatch from any clone of the repository and on any machine or runner (other
team members included), without a new approval. A fresh human approval is
required only when approved content changes. Machine-local material (PO profile
receipt, local repository fingerprint) is checked as local readiness, not as
part of the approved identity; the human proof itself (signature over the
content-bound approval) stays verifiable everywhere and is not weakened or
replaced by an agent act. A transferred clone's State-file mode is restored by
onboarding or named with its repair before the first dispatch.

Preserve meaningful negative controls and original evidence. Scheduled batch
Critic, final Verify/Security and PO acceptance remain separate.
