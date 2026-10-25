---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.windows-lock-release-postcondition
type: bug
owner: pipeline
status: open
created: 2026-10-25
priority: P1
release: 0.7.0
source: "PO-supplied second Greenfield reports, consolidated under D152"
done_when: manual
---

# Windows-Lockfreigabe meldet tatsächlichen Zustand trotz Sync-Fehler korrekt

Reported P1;0.7.0. Existing AC relation: AC-127, AC-272. This is a regression/work outcome under existing contracts, not a PRD/Spec amendment or invented original acceptance.

## Evidence

[Consolidated finding ledger](../../specs/sprint-alfred-epic/evidence/greenfield-second-run-2026-10-25/findings.json): C2-P1-WIN-FSYNC. Reported occurrence, inferred cause and current Source qualification remain distinct.

## Acceptance

Distinguish a removed lock from a retained lock and an unavailable directory durability operation. Do not claim rollback or full durability after an unsupported sync; preserve the actual postcondition and typed next action.

Preserve meaningful negative controls and original evidence. Implement and qualify the actual public consumer on the candidate; synthetic method checks are not native attestation. Scheduled batch Critic, final Verify/Security and PO acceptance remain separate.
