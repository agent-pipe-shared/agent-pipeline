---
schema: pipeline.backlog-item.v1
id: pipeline.calibration-twins-should-have-one-canonical-writer-and-a-derived-copy
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-13
sprint: nova-b
tracking: "Nova B — two tracked calibration authorities multiply review/signature work and make a small configuration repair look like two unrelated protected changes."
source: "evidence/pipeline-analysis-claude-session-2026-09-13.md; evidence/pipeline-retrospective-2026-09-13.md §§55–89."
---

# `project/pipeline.json` and `.claude/pipeline.json` are twins without an explicit source-of-truth model

The current writer keeps both calibration files synchronized, but both appear
as independently protected, user-visible authority files.  Greenfield users
therefore pay duplicate review/signature cost and diagnose drift as a second
problem even when the intended update is one logical decision.

## Direction

Choose one canonical calibration representation and make any compatibility copy
explicitly derived, including provenance and deterministic regeneration.  This
is a migration design, not a shortcut around GS-10/GS-11.

## Acceptance criteria

- One user decision creates one logical protected transaction.
- Drift, manual changes to a derived copy, and malformed migration inputs fail
  closed with an actionable repair.
- Existing consumer projects have a migration/readback path before the legacy
  tier is retired.

