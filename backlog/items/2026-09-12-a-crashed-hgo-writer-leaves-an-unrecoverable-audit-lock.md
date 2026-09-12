---
schema: pipeline.backlog-item.v1
id: pipeline.crashed-hgo-writer-leaves-an-unrecoverable-audit-lock
type: defect
owner: pipeline
status: closed
created: 2026-09-12
sprint: nova-b
done_when: manual
due: 2026-09-30
closed_at: 2026-09-12
closure_repository: self
closure_commit: 3d3a478451e03b7b241e7751fd9f9b2f3fdf32b0
closure_evidence: backlog/evidence/2026-09-12-hgo-crash-and-idempotency-critic-pass.md
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
- **Assignment:** Pipeline team, Nova B, due 2026-09-30, after the current HGO repair is independently reviewed.
- **Date:** 2026-09-12
- **Closure:** closed on 2026-09-12 against implementation commit
  `3d3a478451e03b7b241e7751fd9f9b2f3fdf32b0` after the complete focused
  test corpus and an independent zero-findings Critic PASS proved every
  required recovery and race-safety condition.

## Implementation evidence — 2026-09-12

Commit `3d3a478451e03b7b241e7751fd9f9b2f3fdf32b0` gives ordinary audit
append and repair one shared authenticated lock primitive. It writes and
fsyncs the complete lock record under a unique private sibling and publishes
the canonical lock create-only with an atomic hard link. Recovery accepts the
two-link crash residue only when exactly one private sibling has identical
device, inode, bytes and valid MAC; live, ambiguous, malformed and foreign
states remain fail-closed.

Four real SIGKILL fixtures cover normal recovery and both sides of canonical
publication. Concurrent-reclaimer and replacement-writer cases prove that a
replacement lock is never removed. The focused library suite passes 132/132,
the CLI suite passes 23/23, documentation contracts pass, and the independent
Critic returned PASS with no findings. See
`backlog/evidence/2026-09-12-hgo-crash-and-idempotency-critic-pass.md`.
