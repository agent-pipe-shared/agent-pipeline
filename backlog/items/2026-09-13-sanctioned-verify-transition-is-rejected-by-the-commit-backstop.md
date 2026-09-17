---
schema: pipeline.backlog-item.v1
id: pipeline.sanctioned-verify-transition-is-rejected-by-the-commit-backstop
type: defect
owner: pipeline
status: closed
done_when: manual
created: 2026-09-13
sprint: nova
closed_at: 2026-09-17
closure_repository: self
closure_commit: 6970805a573550ddf7835f28f80dae83e66b4851
closure_evidence: backlog/evidence/2026-09-17-precommit-hook-sandbox-reclassification.md
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

## Closure — 2026-09-17

Commit `6970805a573550ddf7835f28f80dae83e66b4851` implements the narrow
semantic exemption in the installed pre-commit hook.  It admits only the
complete, matching baseline-only-to-configured verification transition and
keeps broader or incomplete variants in the ordinary protected-path boundary.

The canonical local Git/child-process readback recorded in
`backlog/evidence/2026-09-17-precommit-hook-sandbox-reclassification.md`
executed the real suite with **51/51 passing**.  That suite includes the
successful sanctioned transition, the wider-calibration refusal, the
missing-lifecycle-transition refusal, and the generic protected-path refusal
coverage.  The earlier restricted-sandbox red result was separately measured
as `EPERM` before the hook started and is not used as closure evidence.
