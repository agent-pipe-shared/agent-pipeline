---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.critic-validation-transaction-recovery
type: bug
owner: pipeline
status: open
created: 2026-10-25
priority: P1
release: 0.7.0
source: "PO-supplied second Greenfield reports, consolidated under D152"
done_when: manual
---

# Critic-Validierungsfehler hinterlassen keine unreparierbare Transaktionssperre

Reported P1;0.7.0. Existing AC relation: AC-264, AC-245. This is a regression/work outcome under existing contracts, not a PRD/Spec amendment or invented original acceptance.

## Evidence

[Consolidated finding ledger](../../specs/sprint-alfred-epic/evidence/greenfield-second-run-2026-10-25/findings.json): AGY2-H05. Reported occurrence, inferred cause and current Source qualification remain distinct.

## Acceptance

Validate inputs before mutation where possible; a failed transaction must either leave no effects/lock or expose a typed Source-bound recovery preserving genuine partial effects. Never delete an ambiguous live lock.

Preserve meaningful negative controls and original evidence. Implement and qualify the actual public consumer on the candidate; synthetic method checks are not native attestation. Scheduled batch Critic, final Verify/Security and PO acceptance remain separate.
