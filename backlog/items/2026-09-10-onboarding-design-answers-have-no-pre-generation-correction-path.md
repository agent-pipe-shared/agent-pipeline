---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-design-answers-have-no-pre-generation-correction-path
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-10
closure_repository: self
closure_commit: 8b7dfd05c7604bbfa9de6590c28ba0ee7786fac2
closure_evidence: plugins/pipeline-core/lib/onboarding-continuity.test.mjs
created: 2026-09-10
sprint: nova
done_when: manual
source: "Claude 0.6.2 greenfield report: a placeholder answer submitted while testing the onboarding command became immutable and had to be repaired later in the generated PRD. Code inspection confirmed that intake-design-questions-apply rejects every changed replay even before staging generation."
---

# Onboarding design answers have no pre-generation correction path

## Problem

The intake checkpoint accepts one bundled set of design answers and then treats
every changed replay as an error. This is safe against silent overwrites, but it
also makes an obvious typo or a mistakenly submitted test value immutable while
the checkpoint is only `ready-to-generate` and no specification artifact exists.
The later PRD can be edited, but that leaves its recorded input disagreeing with
the correction and forces avoidable repair work into the design phase.

## Required behavior

- The ordinary apply remains idempotent and refuses changed content.
- A separately named, explicit replacement command may replace the complete
  answer set while the checkpoint is `ready-to-generate`.
- Replacement increments the checkpoint revision and therefore leaves the
  normal content-digest and timestamp trail.
- Once staging is `generated` or `bound`, replacement is refused; later changes
  use the normal specification amendment path.
- The command is admitted consistently by the shared CLI/guard argv registry
  for Claude Code, Codex, and Antigravity.

## Acceptance criteria

- A wrong test value can be replaced before generation without deleting the
  checkpoint or editing its JSON by hand.
- A stale normal replay cannot overwrite the corrected value.
- A replacement after generation fails closed and leaves the generated package
  unchanged.

## Resolution

Commit `8b7dfd05` adds the explicit replacement command, keeps ordinary apply
closed against changed replay, increments the checkpoint revision, refuses
replacement after generation, exposes the correction in lifecycle diagnostics
and consumer documentation, and covers the shared guard argv registry for all
three runners.
