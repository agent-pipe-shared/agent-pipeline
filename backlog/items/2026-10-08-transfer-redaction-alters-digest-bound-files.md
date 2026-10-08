---
schema: pipeline.backlog-item.v1
id: pipeline.transfer-redaction-alters-digest-bound-files
type: defect
owner: pipeline
status: open
created: 2026-10-08
source: "Haupt-PC session 2026-10-08 late: the machine-switch transfer bundle carried the approval-bound package with altered bytes."
sprint: alfred
done_when: manual
---

# Transfer redaction alters digest-bound files

## Description

The machine-switch transfer bundle (`specs/sprint-alfred-epic/evidence/transfer-2026-10-08/bundle-evidence.json`)
redacts machine paths in every bundled file. In the approval-bound package
`evidence/design-course/sprint-alfred-epic/r5d.package.json` it rewrote rationale text (`Receipt-backed facts only:` →
`onl<machine-path>`), a false-positive match. The bundled copy can therefore never match the sha256 the signed approval
binds (`539629da…`), so the bundle failed as recovery for exactly the file that mattered; the PO had to copy the
original from the other PC.

## Affected artifact

The transfer bundler and its redaction rules (built ad hoc under `scratch/` on 2026-10-08), and any future handover
tooling that copies device-local evidence.

## Proposal

1. Never redact a file whose digest is bound by State, an approval or a gate receipt; carry it byte-exact, or refuse to
   bundle it and name it in the handover as "must be copied from the origin device".
2. Tighten the redaction pattern to real path shapes (drive letter / home prefix), never free text such as `ly:\n-`.
3. Superseded long-term by R7-3 (bound artifacts tracked in the repository).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
