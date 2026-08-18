---
schema: pipeline.backlog-item.v1
id: pipeline.claude-has-no-start-time-opt-in-adoption-path
type: idea
owner: pipeline
status: closed
created: 2026-08-05
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "88dc3ba6952f226ed4f9caa57bad982cb660a425"
closure_evidence: "backlog/items/2026-08-05-claude-has-no-start-time-opt-in-adoption-path.md"
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

- **Decision:** accept-deferred.
- **Rationale:** re-verified 2026-08-07: `plugins/pipeline-core/hooks/` has a
  Codex-only session-start hint (`codex-session-start-hint.mjs`) with no
  Claude equivalent; no commit since filing adds a bare-repo, pre-plugin-
  install adoption hint for Claude sessions. The gap is real and, as the
  item's own Description states, is feature work needing its own PRD/Spec —
  not something to scope by inference here.
- **Assignment (if accepted):** needs a PO scope decision first (is this
  in-repo hint-only, or a fuller onboarding flow matching Codex's V4
  onboarding?), then a normal kickoff/PRD/Spec cycle. Not blocking 0.5.2 or
  Nova B.
- **Date:** 2026-08-07

**Update 2026-08-18 (Elephant, Phoenix backlog-clearing pass):** the
in-repo-hint-only version this Triage flagged as needing a PO scope decision
has since landed without a separate PRD/Spec cycle: `hooks.json`'s
`SessionStart` block (matcher `startup|resume|clear`) now registers
`codex-session-start-hint.mjs` for Claude too (previously Codex-only via
`codex-hooks.json`), and its `sessionStartDecision()` (lines 19-56) branches
on an ungoverned repo to return exactly the proposed opt-in flow: state Agent
Pipeline is available, ask whether to install it, end the turn and wait for
consent before invoking `pipeline-core:pipeline-start`. This satisfies the
item's core ask (a bootstrap adoption/opt-in hint for Claude sessions,
matching what Codex's onboarding already offered). Closing.
