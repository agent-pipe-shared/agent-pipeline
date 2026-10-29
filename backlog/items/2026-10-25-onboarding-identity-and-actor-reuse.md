---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.onboarding-identity-and-actor-reuse
type: defect
owner: pipeline
status: open
created: 2026-10-25
sprint: alfred
priority: P1
release: 0.7.0
source: "PO-supplied second Greenfield reports, consolidated under D152"
done_when: manual
---

# Git-Identität und freigegebene Actor-Zuordnung über Neustarts behalten

Reported P1;0.7.0. Existing AC relation: AC-264, AC-258. This is a regression/work outcome under existing contracts, not a PRD/Spec amendment or invented original acceptance.

## Evidence

[Consolidated finding ledger](../../specs/sprint-alfred-epic/evidence/greenfield-second-run-2026-10-25/findings.json): codex2.P1.1.repeat-git-identity, codex2.P1.1.actor-repetition. Reported occurrence, inferred cause and current Source qualification remain distinct.

## Acceptance

Persist the supplied local Git identity and an explicitly scoped Pipeline actor assignment, reuse them after restart, and present the joint identity choice once. Attribution is not signature or approval authority; do not put personal identity into public Resume-Hints.

Preserve meaningful negative controls and original evidence. Implement and qualify the actual public consumer on the candidate; synthetic method checks are not native attestation. Scheduled batch Critic, final Verify/Security and PO acceptance remain separate.
