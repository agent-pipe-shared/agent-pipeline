---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-browser-evidence-is-not-portably-provisioned
type: workflow-improvement
owner: pipeline
status: open
done_when: manual
created: 2026-09-13
sprint: nova-b
tracking: "Nova B — all three reports distinguish valid static/offline verification from unavailable browser evidence, but the consumer path does not make that capability gap early and actionable."
source: "evidence/pipeline-analysis-agy-062-103.md; evidence/pipeline-analysis-claude-session-2026-09-13.md; evidence/pipeline-retrospective-2026-09-13.md."
---

# Greenfield projects cannot reliably obtain the browser evidence their product claims invite

The external Greenfield-runner reports describe a disposable browser fixture
that could be checked with static or offline suites, while Playwright/browser
execution was unavailable in some runners because dependencies or a browser
were absent.  The resulting evidence is honest, but the capability gap is
discovered late and differs by runner.  This repository contains the pipeline,
not that fixture: the fixture is intentionally deleted after each runner test
and is not a product, release artifact, or supported application here.

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

<!-- SPEC-REFERENCE-STRIPPED-TRIAGE: this section of the original backlog item has been removed for dispatch citation. It recorded a prior human or Critic verdict about this item -- never spec/reference content -- and would otherwise contaminate an independent downstream review or implementation. See the item's own file for the full history. Convention: backlog/items/2026-08-18-triage-verdict-text-can-contaminate-a-backlog-item-as-a-later-spec-reference.md. -->
