---
schema: pipeline.backlog-item.v1
id: pipeline.push-flow-needs-one-remote-readback-transaction
type: workflow-improvement
owner: pipeline
status: open
done_when: manual
created: 2026-09-13
sprint: nova-b
tracking: "Nova B — a generic push can leave pendingAuditWrite and no remote readback; testers need one canonical success/failure boundary rather than a sequence of inferred follow-up steps."
source: "evidence/pipeline-retrospective-2026-09-13.md §4 and recommendations."
---

# Push approval, audit fold, push, and remote readback are not one completed transaction

The current push machinery can carry a pending audit write and expects a later
prepare step to fold it.  A direct or generic push does not necessarily provide
the matching remote-tip readback.  The source already has pieces of a prepared
publication flow, but the normal tester-facing route does not expose one
transactional completion result.

## Direction

Design a single typed driver that performs or explicitly sequences: candidate
validation, approval consumption, bounded audit handling, push, and remote
readback.  It must never claim a push succeeded until the destination ref is
observed.

## Acceptance criteria

- Success returns local and remote commit identity plus audit state.
- A failed remote readback is non-success and yields an exact safe retry.
- Sole pending audit state is folded only under the existing no-unrelated-work
  constraint.

## Prepared decision sketch — not an implementation authorization

The eventual driver should expose one versioned `push-transaction` result,
not infer completion from a sequence of script exits.  It owns five explicit
stages: immutable candidate preflight, intent/approval validation, conditional
audit fold, one push attempt, and destination readback.  Each stage records
the exact candidate commit/tree and prior-stage digest it consumed; a later
stage must not silently refresh an earlier binding.

The audit fold remains conditional: it may run only where the existing
no-unrelated-work predicate proves that the sole pending state write is the
driver's own expected record.  Otherwise the result stops before any push
with `audit-fold-blocked` and names the typed recovery.  It must never fold a
mixed worktree merely to make delivery convenient.

After a push attempt, success is impossible until an authenticated remote
readback resolves the exact destination ref to the expected candidate commit.
The terminal result vocabulary should at minimum distinguish:

- `not-started` for failed local preflight, intent, or audit-fold predicates;
- `push-not-confirmed` if the transport returns an error or ambiguous result;
- `remote-readback-failed` if transport may have succeeded but the destination
  cannot yet be observed safely; and
- `pushed` only for an exact destination-ref readback match.

`remote-readback-failed` must retain the push attempt identity and give an
exact read-only recheck action.  Retrying must first inspect that recorded
attempt; it may not issue another push merely because the first observation
timed out.  A destination mismatch is a hard non-success that preserves all
local evidence for diagnosis.

The adversarial matrix must cover a clean success, an unrelated dirty
worktree, a foldable sole audit write, a transport failure, an ambiguous
transport success followed by delayed matching readback, a mismatching remote
tip, and repeated recovery invocation.  No case may report delivery before
the exact remote readback.
