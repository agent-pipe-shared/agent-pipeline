# HGO crash recovery and repair idempotency — independent Critic PASS

> Agent-Pipeline · Nova B · 2026-09-12

## Candidate binding

- reviewed candidate: `3d3a478451e03b7b241e7751fd9f9b2f3fdf32b0`
- candidate tree: `efc55d6174def658688b923ce1dbc1ddaa7ddc72`
- primary requirement:
  `backlog/items/2026-09-12-a-crashed-hgo-writer-leaves-an-unrecoverable-audit-lock.md`
- related repair requirement:
  `backlog/items/2026-09-02-a-torn-audit-append-has-disabled-every-human-guard-override-since-august-20.md`
- deterministic evidence:
  `scratch/NVA-B-HGO-CRASH-AND-IDEMPOTENCY/candidate-evidence.json`

## Deterministic result

The candidate-bound evidence records 132 passing HGO library tests, 23 passing
HGO CLI tests, passing documentation contracts, and a clean
`git diff --check`. The test corpus includes real killed-writer fixtures before
and after canonical lock publication, shared append/repair locking,
concurrent-reclaimer and replacement safety, authenticated twin recovery, and
idempotent torn-audit repair after later valid appends.

## Independent review

The fresh refs-only Critic returned **PASS with no findings**. It reviewed the
required behavior, changed-file scope, crash and recovery reachability,
concurrency, test integrity, authentication, private-file handling,
dependencies, secrets, rollback, and governance. It confirmed that staged hard
link publication prevents a partial canonical lock, twin finalization rechecks
inode, bytes and MAC, and the authenticated repair scan preserves idempotency
after ordinary appends.

Assurance was
`functional-equivalent-read-only; OS isolation not asserted`. The Critic used
no write operation and noted the residual host write-capability limitation.

The review found the trajectory consistent and recorded no briefing violation.
