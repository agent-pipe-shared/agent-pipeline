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

- **Decision:** accepted; fix in sprint alfred.
- **Rationale:** reproduced by GLWIN-t (`1dbcb22cc`): path separators, not line endings — a nested finding keeps its absolute path on win32 and never matches a content-v1 key (`specs/sprint-alfred-epic/evidence/night-2026-10-05/gitleaks-windows-suppression.md`). A backslash-relative finding path is normalised on win32 only, where a backslash is never a filename character; `safeAuthorityPath` stays strict for ignore-file entries.
- **Assignment (if accepted):** red test GLWIN-t (done, `1dbcb22cc`); production fix GLWIN (separate dispatch, QG-04); Critic after the fix. The existing `gitleaks.test.mjs` failure at its real-binary ledger case is detection-side and out of this item.
- **Date:** 2026-10-06
