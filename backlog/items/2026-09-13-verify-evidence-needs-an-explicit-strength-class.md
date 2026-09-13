---
schema: pipeline.backlog-item.v1
id: pipeline.verify-evidence-needs-an-explicit-strength-class
type: workflow-improvement
owner: pipeline
status: open
done_when: manual
created: 2026-09-13
sprint: nova-b
tracking: "Nova B — a syntax/offline fallback can be honest and useful, but must not be treated as equivalent to the browser behavior evidence a product or release criterion implies."
source: "evidence/pipeline-analysis-claude-session-2026-09-13.md §10.8; evidence/pipeline-retrospective-2026-09-13.md §§33–39, 95–112."
---

# Verify receipts record success but not the strength or coverage class of that success

The Codex run correctly recorded that browser dependencies were unavailable and
added an offline verifier.  The reports nonetheless show a semantic gap: a
syntax check or minimal DOM simulation can be green without proving the
Playwright/browser behaviours originally named for the product.

## Direction

Model evidence strength explicitly (for example static, offline-behaviour,
browser-E2E, CI-browser), bind it to the declared release requirement, and
make a weaker valid result visibly insufficient when a stronger claim is made.

## Acceptance criteria

- A receipt identifies its evidence class and runner capability.
- Release readiness distinguishes an unavailable required browser proof from a
  failed test and from an acceptable low-stakes fallback.
- Product-facing reports cannot silently label a weaker class as browser-E2E.
