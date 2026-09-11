---
schema: pipeline.backlog-item.v1
id: pipeline.crashed-hgo-writer-leaves-an-unrecoverable-audit-lock
type: defect
owner: pipeline
status: open
created: 2026-09-12
sprint: nova-b
done_when: manual
source: "Goldfish-deep review NVA-B-HGO-AUDIT-REPAIR-2: the bounded torn-append repair correctly refuses to unlink an unowned audit.lock, but a writer killed after acquiring that lock leaves every later append and repair fail-closed with no safe reclamation route."
---

# A crashed HGO writer leaves an unrecoverable audit lock

## Problem

The Human Guard Override audit uses an exclusive `audit.lock`. The bounded
torn-append repair correctly avoids deleting a competing writer's lock, but
the lock file has no authenticated ownership or expiry record. If the owning
process is killed or the host loses power after acquisition, later audit
appends and `repair-audit` return `HGO-AUDIT-LOCKED` indefinitely.

Blindly deleting an old-looking pathname is unsafe: another writer may have
acquired a replacement between observation and unlink. The current fail-closed
behavior is therefore correct, but it has no autonomous recovery path.

## Required behavior

- Give an audit lock authenticated, bounded ownership metadata suitable for
  distinguishing a live owner, a dead owner and legacy empty lock files.
- Reclaim a dead lock through one race-safe primitive that cannot unlink a
  replacement lock acquired by another writer.
- Keep live, ambiguous, malformed and unverifiable ownership fail-closed with
  typed diagnostics.
- Exercise ordinary append and `repair-audit` through the same primitive.
- Prove recovery with a real killed-writer fixture and prove safety with
  concurrent reclaimer/replacement-writer fixtures.
- Preserve the existing audit ledger, head and key bytes during lock recovery.

## Affected artifacts

- `plugins/pipeline-core/lib/human-guard-override.mjs`
- `plugins/pipeline-core/lib/human-guard-override.test.mjs`
- `docs/human-guard-override-threat-model.md`
- `docs/adr/0059-signed-human-guard-override.md`

## Triage

- **Decision:** accepted as a separate residual from authenticated torn-append recovery.
- **Rationale:** crash recovery expands lock ownership and concurrency semantics; keeping it separate avoids weakening the reviewed repair with racy stale-path deletion.
- **Assignment:** Nova B, after the current HGO repair is independently reviewed.
- **Date:** 2026-09-12
