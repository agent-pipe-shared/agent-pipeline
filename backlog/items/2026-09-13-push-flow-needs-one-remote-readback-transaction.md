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
