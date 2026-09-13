---
schema: pipeline.backlog-item.v1
id: pipeline.sanctioned-verify-transition-is-rejected-by-the-commit-backstop
type: defect
owner: pipeline
status: open
created: 2026-09-13
sprint: nova
tracking: "NOW / next local 0.6.2 candidate — blocks a normal greenfield project from committing the exact runtime-sanctioned design-to-implementation verification transaction without two unrelated human-signature ceremonies."
source: "evidence/pipeline-analysis-claude-session-2026-09-13.md §5.1; independently reproduced against the current source's pipeline-state writer and generated pre-commit backstop."
---

# The commit backstop rejects the exact verify transaction the lifecycle writer permits

`pipeline-state.mjs set-phase --phase implementation --verify-command <command>`
is intentionally the narrow runtime path that changes the protected verification
calibration while a plan starts implementation.  It writes both calibration tiers
and the lifecycle state.  The generated pre-commit backstop, however, only knows
first appearance, a consumed HGO capability, and the trust-anchor bootstrap
exception.  It therefore rejects the already-tracked calibration paths after the
sanctioned writer has completed.

The result is a self-conflict between two pipeline authorities: a normal
greenfield session must perform a second signature ceremony solely to commit a
diff that the first authority already admitted.  This is a release-flow blocker,
not a convenience issue.

## Direction

At the commit boundary, admit only the complete semantic transaction emitted by
the sanctioned writer: every existing calibration twin changes only `verify`
from baseline-only to one identical configured command, and the tracked state
changes exactly from approved design to implementation.  A missing twin, changed
unrelated field, already-configured source value, inconsistent command, or any
other protected path must remain blocked normally.

## Acceptance criteria

- The complete transaction commits without HGO.
- A wider calibration rewrite, a missing state transition, and an inconsistent
  twin remain refused at the real Git-hook boundary.
- Existing generic GS-10/GS-11 refusal coverage remains green.

