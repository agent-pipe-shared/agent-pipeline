---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.windows-main-entry-identity
type: bug
owner: pipeline
status: open
created: 2026-10-25
priority: P1
release: 0.7.0
source: "PO-supplied second Greenfield reports, consolidated under D152"
done_when: manual
---

# Windows-CLI erkennt ihren Main-Einstieg über physische Pfadidentität

Reported P1;0.7.0. Existing AC relation: AC-127, AC-230. This is a regression/work outcome under existing contracts, not a PRD/Spec amendment or invented original acceptance.

## Evidence

[Consolidated finding ledger](../../specs/sprint-alfred-epic/evidence/greenfield-second-run-2026-10-25/findings.json): C2-P1-WIN-MAIN. Reported occurrence, inferred cause and current Source qualification remain distinct.

## Acceptance

Reproduce the exact Windows entry invocation and normalize module/argv identity without weakening content or physical-path checks. Current phoenix-authority-revision uses URL.endsWith(argv), which cannot establish native separator equivalence; native occurrence is not yet reproduced.

Preserve meaningful negative controls and original evidence. Implement and qualify the actual public consumer on the candidate; synthetic method checks are not native attestation. Scheduled batch Critic, final Verify/Security and PO acceptance remain separate.
