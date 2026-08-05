---
schema: pipeline.backlog-item.v1
id: pipeline.claude-has-no-start-time-opt-in-adoption-path
type: idea
owner: pipeline
status: open
created: 2026-08-05
source: "PO observation, Sprint Nova session 2026-08-05, in the same session that reproduced the setup.mjs marketplace collision by hand"
due: 2026-09-05
---

# Claude has no start-time opt-in for adopting the Pipeline in a fresh repository

## Description

Codex has a bootstrap adoption path via `project-onboarding-v3.mjs` (V4
onboarding). Claude Code has no equivalent flow that offers adoption when a
session starts in a repository that does not yet carry the Pipeline. Today a
Claude operator must perform the marketplace registration and plugin install
by hand, which is exactly the manual sequence that exposed
`backlog/items/2026-08-05-setup-mjs-marketplace-name-collision-defeats-local-dev-installs.md`.

This is feature work needing its own PRD/Spec, not 0.5.2 hardening; it is not
scoped or designed here.

## Triggering situation

PO observation, 2026-08-05, made in the same session that reproduced the
`setup.mjs` marketplace-name-collision finding above. It is the PO's stated
target state: a bare repository should offer an opt-in at session start, the
way Codex does.

## Affected artifact

Claude Code session-start flow (no current file — this is the gap itself);
comparison target `project-onboarding-v3.mjs` (Codex's existing V4
onboarding adoption path); `docs/claude-local-plugin-development.md` (the
manual procedure this feature would replace); ADR-0051 (the dual-runner
contract that makes runner parity a standing requirement).

## Proposal

None yet — this is feature work requiring its own PRD/Spec before any
design or scoping decision is made. Not attempted here.

Owner: PO. Due: 2026-09-05.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
