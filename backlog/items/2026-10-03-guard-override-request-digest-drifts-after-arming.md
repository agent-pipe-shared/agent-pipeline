---
schema: pipeline.backlog-item.v1
id: pipeline.guard-override-request-digest-drifts-after-arming
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Claude/Windows greenfield analysis 2026-10-03 (Claude test repo docs/pipeline-analyse-greenfield.md, finding V-3, T:1151/T:1168/T:1171)."
sprint: alfred
done_when: manual
---

# A signed guard override is burnt because the request digest changes after arming

## Description

The signed human-guard override reached `armed` (T:1168). The byte-identical
retried command was then refused with a **new** request digest (`4374f3…` →
`97b765…`, T:1171), so the PO's signature was consumed without effect. The
digest appears to include volatile state, for example the untracked `project/`
files or the override store itself, which the arming step changes.

## Acceptance

- The request digest is computed only from the tool call and the stable
  authority inputs it actually governs. Arming an override never changes the
  digest of the identical retry.
- A regression test covers the sequence seed, sign, arm, and identical retry
  consuming the capability, on Windows and POSIX.
- If a mismatch still happens, the denial names the differing digest inputs
  instead of looking like a fresh denial.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
