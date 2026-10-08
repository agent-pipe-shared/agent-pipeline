---
schema: pipeline.backlog-item.v1
id: pipeline.denial-names-a-diagnosis-it-refuses
type: defect
owner: pipeline
status: open
created: 2026-10-08
source: "Haupt-PC session 2026-10-08 late: GUARD-DEVPLAN-SHELL denial during an unverifiable approval."
sprint: alfred
done_when: manual
---

# A guard denial names a read-only diagnosis that the same guard refuses

## Description

With an unverifiable approval (`DWP-PACKAGE-PHYSICAL`), the `GUARD-DEVPLAN-SHELL` denial text says: "Use
design-advisory-admission.mjs inspect --repo-root <root> --feature <id> --plan <plan> --spec <spec> for read-only
diagnosis." Running exactly that command is refused by the same guard under the same lane (`opaque-script-execution`),
as is every other `node` call including a single `node --test` file. The only remaining diagnosis was reading minified
source and handing PO-run scripts back and forth (T73, T76).

## Proposal

Every diagnosis or recovery command a denial names must be admitted in the state that produced the denial (a typed
read-only allowlist bound to the denial code), and a test pins it per denial code. More generally (PO decision BI): an
approved feature whose approval cannot be re-verified must degrade to advisory, never lock all execution.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
