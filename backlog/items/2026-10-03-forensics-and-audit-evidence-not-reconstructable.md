---
schema: pipeline.backlog-item.v1
id: pipeline.forensics-and-audit-evidence-not-reconstructable
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "0.7.0 three-runner greenfield analyses 2026-10-03: Codex report P0 (transcript reader), P1 (continuity digests), P2 (Verify null, audit index); Claude report §0/V-8; Antigravity report §2.3."
sprint: alfred
done_when: manual
---

# Session forensics and the audit chain cannot be reconstructed reliably

## Description

- **Transcript reader (Codex P0):** a direct scan of the Codex session
  directory is refused (`GUARD-READ-SCOPE-OUTSIDE-ROOT`). The sanctioned
  `runner-transcript-recovery.mjs` listed two entries of the same earlier
  session but no text, and `read` ended with `requested-session-unavailable`.
  The reader lists file candidates and requires exactly one match on read
  (`scripts/runner-transcript-recovery.mjs:176/:275/:297`), so a multi-segment
  session is unreadable. Claude's analysis could not run a read-only forensic
  script either (V-8). Antigravity transcripts have no usage fields, so tokens
  could only be estimated.
- **Continuity digest drift (Codex P1):** the persisted continuity names
  PRD/Spec hashes that differ from the checkout. "Lifecycle current" was easy to
  misread as "sources bound".
- **Verify null (Codex P2):** greenfield calibration keeps `verify: null` with no
  executable product test contract fixed during design.
- **Audit index (Codex P2, Claude E26, Antigravity §6.2):** reviewers had to
  assemble mandate, approvals, dispatches and sources from several stores by
  hand.

## Acceptance

- A project-bound, data-minimising transcript export merges segments, child
  sessions and turn boundaries, and reports usage where the host supplies it,
  for all three runners.
- Bootstrap and dispatch compare continuity source digests with the checkout
  and surface drift as an open recovery.
- The design course fixes an executable Verify contract, activated with the
  first implementation dispatch.
- Each change gets a generated index of source, commit and gate digests, with
  explicitly missing steps.
- Each claim is verified against the source before implementation, because the
  reports may contain false positives.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
