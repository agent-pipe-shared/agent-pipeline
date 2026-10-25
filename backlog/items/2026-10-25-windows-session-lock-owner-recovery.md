---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.windows-session-lock-owner-recovery
type: bug
owner: pipeline
status: open
created: 2026-10-25
priority: P1
release: 0.7.0
source: "PO-supplied second Greenfield reports, consolidated under D152"
done_when: manual
---

# Verwaiste Windows-Session-Locks haben eine sichere Owner-Recovery

Reported P1;0.7.0. Existing AC relation: AC-127, AC-200. This is a regression/work outcome under existing contracts, not a PRD/Spec amendment or invented original acceptance.

## Evidence

[Consolidated finding ledger](../../specs/sprint-alfred-epic/evidence/greenfield-second-run-2026-10-25/findings.json): C2-P1-WIN-ORPHAN. Reported occurrence, inferred cause and current Source qualification remain distinct.

## Acceptance

Use trustworthy owner/liveness facts and a bounded recovery for a provably dead owner; uncertain ownership is not permission to reclaim. This is the session-lock outcome, distinct from the HGO audit-lock item.

Preserve meaningful negative controls and original evidence. Implement and qualify the actual public consumer on the candidate; synthetic method checks are not native attestation. Scheduled batch Critic, final Verify/Security and PO acceptance remain separate.
