---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-browser-evidence-is-not-portably-provisioned
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-13
sprint: nova-b
tracking: "Nova B — all three reports distinguish valid static/offline verification from unavailable browser evidence, but the consumer path does not make that capability gap early and actionable."
source: "evidence/pipeline-analysis-agy-062-103.md; evidence/pipeline-analysis-claude-session-2026-09-13.md; evidence/pipeline-retrospective-2026-09-13.md."
---

# Greenfield projects cannot reliably obtain the browser evidence their product claims invite

The reports agree that the delivered mini game could be checked with static or
offline suites, while Playwright/browser execution was unavailable in some
runners because dependencies or a browser were absent.  The resulting evidence
is honest, but the capability gap is discovered late and differs by runner.

## Direction

Provide a portable browser-evidence preflight that either prepares the required
dependency/browser through an authorized host boundary or records a typed
degraded-evidence result before implementation starts.  Product claims and
release criteria must then consume that result explicitly.

## Acceptance criteria

- The preflight distinguishes unavailable tooling from a failed browser test.
- It never installs dependencies or downloads browsers without the applicable
  host/PO authority.
- Consumer verification and CI can reproduce the selected evidence mode.

