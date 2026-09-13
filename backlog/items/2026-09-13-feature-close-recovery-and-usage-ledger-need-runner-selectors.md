---
schema: pipeline.backlog-item.v1
id: pipeline.feature-close-recovery-and-usage-ledger-need-runner-selectors
type: defect
owner: pipeline
status: open
done_when: manual
created: 2026-09-13
sprint: nova-b
tracking: "Nova B — a completed local product can remain permanently implementing after a stopped release path, and Codex cannot always select its own session for close telemetry."
source: "evidence/pipeline-retrospective-2026-09-13.md §§37–39, 95–118."
---

# A stopped release can strand feature close, while telemetry cannot select the active runner session

The Codex run completed product and offline verification work but remained
`implementing`: the close path required a continuity result that was absent,
and the usage ledger found several Claude project directories with no Codex
session selector.  A later documented stop-close plan still could not complete
the lifecycle state.

## Direction

Define a typed terminal-state recovery that distinguishes a failed public
release from completed local delivery, and make ledger selection explicit by
runner/session identity rather than directory guessing.

## Acceptance criteria

- A failed or deferred release has a deterministic, audited close-or-resume
  action that never fabricates publication success.
- Multiple runner session directories cannot make close telemetry ambiguous.
- Tests cover interrupted release, local-only completion, and normal remote
  release separately.
