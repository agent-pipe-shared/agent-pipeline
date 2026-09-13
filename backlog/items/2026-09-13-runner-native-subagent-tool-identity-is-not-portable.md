---
schema: pipeline.backlog-item.v1
id: pipeline.runner-native-subagent-tool-identity-is-not-portable
type: defect
owner: pipeline
status: open
created: 2026-09-13
sprint: nova-b
tracking: "Nova B — Antigravity reports DBB-PARENT-TOOL-USE-ID-MISSING for ordinary roles; do not weaken dispatch binding before collecting the native sanitized payload."
source: "evidence/pipeline-analysis-agy-062-103.md."
---

# Dispatch-budget identity assumes a tool-use field not supplied by every runner

The Antigravity greenfield report observed `DBB-PARENT-TOOL-USE-ID-MISSING` for
ordinary dispatched roles, while an ad-hoc role was used as a workaround.  The
current guard deliberately fails closed when it cannot bind a child call to its
parent tool use; simply accepting a missing id would weaken dispatch accounting.

## Direction

Capture a sanitized real Antigravity hook envelope for both standard and custom
roles, then add a runner-native adapter that derives the same stable parent
identity from an actually supplied immutable field.  Preserve refusal when no
such binding is available.

## Acceptance criteria

- Standard Antigravity roles receive correctly bound budgets.
- A missing or unrelated binding remains denied.
- Fixtures are captured from native payloads, rather than inferred from another
  runner's schema.

