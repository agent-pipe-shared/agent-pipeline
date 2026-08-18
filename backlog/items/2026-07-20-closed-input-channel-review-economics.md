---
schema: "pipeline.backlog-item.v1"
id: "pipeline.closed-input-channel-review-economics"
type: "workflow-improvement"
owner: "pipeline"
status: "closed"
created: "2026-07-20"
source: "close retro; bounded privacy correction review"
due: "2026-08-10"
expires: "2026-08-17"
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "f57375ff"
closure_evidence: "plugins/pipeline-core/skills/capture-observation/SKILL.md"
---

# Prefer closed input channels before variant hardening

## Problem

The observation privacy boundary initially required several rounds of URL and
remote-variant hardening. The final safe shape was smaller: structured
same-target links plus fail-closed rejection of free-text coordinates. The
open-ended parser path consumed review time and created avoidable correction
waves.

## Acceptance criteria

- New public intake designs start with a closed structured schema and an
  explicit rejection boundary for free-text coordinates.
- A variant parser is added only when a concrete accepted input requires it and
  the threat model, tests and bounded delta review name that requirement.
- Critic follow-up dispatches remain correction-delta-only after the first full
  review; no broad re-review is introduced to compensate for parser expansion.

## Result

The current observation intake now enforces the closed-channel rule and has a
candidate-bound privacy PASS. The next Pipeline Elephant should convert this
lesson into a reusable design/checklist rule and close this item with evidence.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, closed. `plugins/pipeline-core/skills/capture-observation/SKILL.md:18`
  already states and enforces the closed-channel rule this item asked for
  (structured same-target links, fail-closed rejection of free-text
  coordinates) — confirmed present at HEAD during a systematic 0.6.0-release
  backlog sweep, 2026-08-18.
- **Rationale:** the acceptance criteria were already met by prior work; only
  the closure step itself was left undone (item stayed `in_progress` past its
  own `expires` date without a Triage entry).
- **Assignment:** closed, no further work.
- **Date:** 2026-08-18
