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

Correction found the same day: a sanctioned route already exists.
`pipeline-state.mjs rebind-approval` re-verified the existing signed approval
for this clone (`reboundFields: receiptSha256, repositoryFingerprint`,
`signaturesRequested: 0`, `stateChanged: false`, private receipt under
`.git/agent-pipeline/rebind-approval/`), after which
`observeCurrentPlanApprovalForCalibration` reads `eligible`. The remaining
defects are discoverability and CLI safety: (1) `guard-dispatch` repairs
`CVCT-AUTHORITY-STALE` with "submit the plan again and have the PO approve it
again" and `calibration-verify-commit-transition.mjs` with "reopen-design and
approve again", instead of naming `rebind-approval` when only machine-local
fields differ; neither `inspect`, the bootstrap nor the transfer plan names it;
(2) `rebind-approval --help` executed the command instead of printing help.

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
replaced by an agent act. When only machine-local fields differ, every refusal
and `inspect` name the exact `rebind-approval` action (and the bootstrap runs or
offers it after a transfer); `--help` on any lifecycle verb prints help and
never executes. A transferred clone's State-file mode is restored by
onboarding or named with its repair before the first dispatch.

Preserve meaningful negative controls and original evidence. Scheduled batch
Critic, final Verify/Security and PO acceptance remain separate.
