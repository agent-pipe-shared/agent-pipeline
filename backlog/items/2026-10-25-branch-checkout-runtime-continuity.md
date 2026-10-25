---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.branch-checkout-runtime-continuity
type: bug
owner: pipeline
status: open
created: 2026-10-25
priority: P0
release: 0.7.0
source: "PO-supplied second Greenfield reports, consolidated under D152"
done_when: manual
---

# Branch- und Checkout-Wechsel bewahren Runtime und Produktzugang

Reported P0;0.7.0. Existing AC relation: AC-174, AC-274, AC-264. This is a regression/work outcome under existing contracts, not a PRD/Spec amendment or invented original acceptance.

## Evidence

[Consolidated finding ledger](../../specs/sprint-alfred-epic/evidence/greenfield-second-run-2026-10-25/findings.json): codex2.P0.2.checkout-verify, codex2.P0.2.branch-runtime. Reported occurrence, inferred cause and current Source qualification remain distinct.

## Acceptance

Verify/Critic must use a correctly bound checkout; close must preserve the deliverable branch and runtime authority without avoidable restart. Product deletion is not established; the delivered files remain on the delivery branch.

Preserve meaningful negative controls and original evidence. Implement and qualify the actual public consumer on the candidate; synthetic method checks are not native attestation. Scheduled batch Critic, final Verify/Security and PO acceptance remain separate.
