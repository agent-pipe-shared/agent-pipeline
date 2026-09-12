---
schema: pipeline.backlog-item.v1
id: pipeline.author-repair-route-has-no-signed-event-chain
type: requirement
owner: pipeline
status: open
created: 2026-09-12
due: 2026-09-30
sprint: nightwing
done_when: manual
source: "Nova B final Critic finding on the attended dispatch-lock repair evidence."
---

# Author repair route has no signed event chain

## Problem

Edits to permanently non-liftable Pipeline kernel paths cannot use a Guard
Maintenance Window. The attended Author-repair route can bind a preimage,
reviewed patch, postimage and an exact confirmation token, but it does not
currently emit a cryptographically signed request/grant/consume event chain
equivalent to the GMW audit trail.

This leaves attribution weaker precisely where the maintenance-window route is
intentionally unavailable. A versioned evidence note is reviewable, but it is
not a signature-backed authorization record.

## Done when

- The canonical Author-repair ceremony emits signed, repository-bound events
  covering the exact preimage, reviewed patch digest, permitted paths and
  resulting postimage.
- Verification rejects replay, wrong repository, wrong preimage, changed patch,
  expired authority and missing consumption evidence.
- Codex, Claude Code and Antigravity receive the same runner-neutral ceremony
  and audit semantics.
- User-project documentation explains when Author repair is required and how
  its signed evidence differs from a liftable GMW.
- Focused tests and Full Verify pass, followed by an independent Critic review.

## Scope

This item strengthens evidence for the existing non-liftable Author route. It
does not make a kernel path liftable and does not authorize push, publication,
deployment or release.

## Rollback

Revert the signed-event integration while retaining the current fail-closed
classification of permanently non-liftable paths. The existing attended route
remains available with its explicitly documented weaker audit evidence.
