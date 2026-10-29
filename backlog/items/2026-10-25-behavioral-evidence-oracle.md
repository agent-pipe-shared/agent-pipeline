---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.behavioral-evidence-oracle
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

# Verhaltensnachweise messen Ergebnisse statt Input-Echos oder Quelltextmarker

Reported P1;0.7.0. Existing AC relation: AC-146, AC-170. This is a regression/work outcome under existing contracts, not a PRD/Spec amendment or invented original acceptance.

## Evidence

[Consolidated finding ledger](../../specs/sprint-alfred-epic/evidence/greenfield-second-run-2026-10-25/findings.json): codex2.P1.3.seed-signature, codex2.P1.3.seed-alias, codex2.P1.3.source-pattern-tests. Reported occurrence, inferred cause and current Source qualification remain distinct.

## Acceptance

Candidate-bound acceptance evidence must distinguish actual output/geometry from seed text, counts, source patterns or syntax. Keep repeatability, changed-input and alias-domain controls. This is a Pipeline evidence/review outcome, not an instruction to edit the external product. AC-146 original acceptance remains separately qualified; no reconstruction of missing original text is claimed.

Preserve meaningful negative controls and original evidence. Implement and qualify the actual public consumer on the candidate; synthetic method checks are not native attestation. Scheduled batch Critic, final Verify/Security and PO acceptance remain separate.
