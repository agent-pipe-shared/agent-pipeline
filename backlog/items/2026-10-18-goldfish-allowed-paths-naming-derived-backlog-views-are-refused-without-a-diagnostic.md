---
schema: pipeline.backlog-item.v1
id: pipeline.goldfish-allowed-paths-naming-derived-backlog-views-are-refused-without-a-diagnostic
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "Alfred self-application, backlog dispatches BL1-BL4, 2026-10-18"
sprint: none
done_when: manual
---

# Goldfish allowed paths naming derived backlog views are refused without a diagnostic

## Description

guard-dispatch refused four Goldfish dispatches with `SDC-AUTHORITY-UNAVAILABLE`. The cause
was that their `allowedPaths` named the derived backlog views (`backlog/index.json`,
`backlog/STATUS.md`, `backlog/transitions.ndjson`). These are written only by
`reconcile-backlog-ledger.mjs --activate`. The same dispatch without those paths was
admitted. The refusal code names an authority problem, not the offending path.

## Triggering situation

Any dispatch that writes backlog items and lists the derived views among its paths.

## Proposal

Refuse with a dedicated code that names the derived-view path and points to
`reconcile-backlog-ledger.mjs --activate` as the route.

## Acceptance

- A dispatch naming a derived backlog view is refused with a code that names the path.
- The refusal text names the reconcile route.
