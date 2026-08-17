---
schema: pipeline.backlog-item.v1
id: pipeline.ledger-drift-classification-has-no-reachability-cutoff
type: defect
owner: pipeline
status: closed
created: 2026-08-16
closed_at: 2026-08-17
closure_repository: self
closure_commit: d16c734572d141ed19bc6a695d24278930b07dac
closure_evidence: backlog/items/2026-08-16-ledger-drift-classification-has-no-reachability-cutoff.md
source: "Self-observed while making the backlog-ledger gate green in the 2026-08-16 candidate; the classification change is the same candidate's work, and the PO agreed to file the weakening it introduces as its own item rather than leave it implicit."
---

# The ledger's drift classification accepts the past but never expires, so a future unreachable commit stays non-blocking

## What changed, and why it had to

Until 2026-08-16 the backlog-ledger gate treated any event whose evidence
commit is unreachable from HEAD as an integrity failure. Historical entries
legitimately carry such commits — the baseline-migration commit and at least
one short-hash reference, both already filed as their own items
(`2026-08-11-backlog-ledger-baseline-migration-commit-unreachable.md`,
`2026-08-12-ledger-event-403-has-a-short-hash-evidence-commit.md`). The gate
was therefore continuously red, and a gate that cannot be made green stops
being read at all.

The candidate reclassifies unreachable-commit findings as DRIFT (reported,
non-blocking) while every other finding stays INTEGRITY (blocking), with a
fail-closed default: anything not matching the drift pattern is INTEGRITY. The
gate moved from "reject the past" to "reject bad writes", and verify reached
exit 0 for the first time since the drift appeared.

## The weakening this necessarily brings

The classification keys on the *shape* of the finding, not on when the event
was written. An event appended tomorrow with an unreachable evidence commit
receives exactly the same non-blocking treatment as the 2026-07 baseline
entries.

The second half of "reject bad writes" is currently enforced only at write
time, by the candidate-event validation in `reconcile-backlog-ledger.mjs`. The
read-time gate no longer enforces it. Anything that appends to the ledger
without going through that writer — a hand-edit, a future script, a merge —
lands outside the check entirely.

## Direction

A cutoff: a sequence number or date at or after which an unreachable evidence
commit is INTEGRITY again, and before which it remains DRIFT. It is set once,
at the last pre-existing event (sequence 411 at time of writing), and never
moves. Historical entries stay accepted; every newly appended event is held to
the original standard.

One question to decide when this is picked up, not now: whether the cutoff
lives in the ledger file itself — self-describing, but mutable by the same
writer it constrains — or in the checking script, which is immutable relative
to the data but drifts if the ledger is ever rebuilt.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — cutoff lives in the checking script (`plugins/pipeline-core/scripts/check-backlog-state.mjs` or the shared lib it calls), not in the ledger file. The item itself left this open; the checking script is the safer default because it is immutable relative to the data (a future writer/rebuild cannot silently move the cutoff forward to re-admit a new integrity violation as DRIFT).
- **Rationale:** not architecture/ADR-scale, a bounded implementation choice with tradeoffs already stated in the item body — resolved here rather than escalated, per this session's PO-set autonomy for exactly this class of decision.
- **Assignment (if accepted):** Nova A AFK-session closeout, folded into the next local 0.5.5 candidate.
- **Date:** 2026-08-16

## Closure (2026-08-17)

Verified live: `plugins/pipeline-core/lib/backlog-state.mjs:836` carries
`export const LEDGER_DRIFT_CUTOFF_SEQUENCE = 417;`, and `classifyFinding()`
(:843-861) resolves a DRIFT-shaped finding's ledger sequence against it,
reclassifying anything above the cutoff back to INTEGRITY (blocking) —
exactly the fix this item's own Triage decided on 2026-08-16. Landed in
commit `d16c734572d141ed19bc6a695d24278930b07dac` (2026-08-16), the same day
the Triage decision was recorded. Closing.
