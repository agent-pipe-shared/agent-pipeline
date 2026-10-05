---
schema: pipeline.backlog-item.v1
id: pipeline.gitleaks-content-suppression-does-not-match-on-windows
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Observed live on native Windows, Alfred session, 2026-10-05."
sprint: alfred
done_when: manual
---

# gitleaks content suppression does not match on Windows

## Description

On native Windows the repository's gitleaks adapter run reported 49 retained
findings, including entries that ARE suppressed in `.gitleaksignore`
(content-v1 entries). Suspected cause: path separator or CRLF normalisation in
the content-authority matching. Not measured.

## Triggering situation

Adapter run on native Windows during the 2026-10-05 session.

## Affected artifact

The gitleaks adapter and its content-authority matching of `.gitleaksignore`
content-v1 entries.

## Proposal

Diagnose with a fixture that covers both line endings (LF, CRLF) and both path
separators (`/`, `\`); fix the normalisation where the match diverges and keep
the fixture as a regression test.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
