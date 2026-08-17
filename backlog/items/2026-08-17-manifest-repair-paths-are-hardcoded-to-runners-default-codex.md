---
schema: pipeline.backlog-item.v1
id: pipeline.manifest-repair-paths-are-hardcoded-to-runners-default-codex
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: 2026-08-17
closure_repository: self
closure_commit: 4af6bb0b289f6afc3ab95c560e3cd142d795bddc
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-17-manifest-repair-runner-gate-closure.md
source: "Relayed by the PO 2026-08-17 from a live D:\\Dev\\HA (native Windows Claude) session's handover; the original report's line numbers were corrupted by transcription and were not trusted -- independently re-located and confirmed against this repository's own current source before filing."
---

# `selectedRunnerIsCodex()` makes the automated manifest-repair path unconditionally unrepairable for `runners.default: "claude"` projects

## Description

`selectedRunnerIsCodex()` (`plugins/pipeline-core/lib/project-onboarding-v3.mjs:2520-2527`)
gates BOTH `planProjectOnboardingSourceRecoveryV4` (`:2669`, diagnostic
`source_runner_transition_unsupported`) and
`planProjectOnboardingManifestRepairV4` (`:2772`, diagnostic
`manifest_repair_source_not_current`, message text: "the current V4
lifecycle supports only a Codex-selected authority"). Any project whose
`pipeline.user.yaml` has `runners.default: "claude"` (a fully legitimate,
supported runner selection everywhere else in this codebase) gets both
automated repair paths refused unconditionally — not a state problem, a
code path that simply does not support Claude-default projects.

## Triggering situation

A live D:\Dev\HA bootstrap session (native Windows, Claude runner) hit
`inspect --intent session` returning `plan-manifest-repair` as the next
action, then found that plan reproducibly fails with
`canonical_manifest_requires_owner_repair` because
`selectedRunnerIsCodex()` rejects the project's `runners.default: "claude"`
before reaching the actual manifest logic. Workaround used: temporarily set
`runners.default: "codex"` in `pipeline.user.yaml`, complete the repair,
then set it back — brittle and easy to forget the "set it back" step.

## Affected artifact

`plugins/pipeline-core/lib/project-onboarding-v3.mjs`,
`selectedRunnerIsCodex()` and its two call sites,
`planProjectOnboardingSourceRecoveryV4`/`planProjectOnboardingManifestRepairV4`.

## Proposal

Not designed here. Whoever picks this up needs to establish WHY these two
repair paths were scoped to Codex-only in the first place (read git blame /
any ADR referencing this) before deciding whether to make them
runner-agnostic outright, or whether there's a genuine Codex-specific
precondition that needs a Claude-equivalent path instead of just deleting
the gate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — confirmed exact and reproducible against this
  repository's current source (line numbers above, independently
  re-located since the original report's were corrupted by transcription).
- **Rationale:** a legitimate, elsewhere-fully-supported runner
  configuration (`runners.default: "claude"`) makes two automated repair
  paths permanently dead-ended; real functional gap, not a misreading.
- **Assignment (superseded):** originally queued behind the Windows-hotfix
  candidate, pending design input on why the gate was Codex-only. That
  design question was answered by the dispatch's own source investigation
  (the Codex-specific helper's exact call sites, and that an already-used
  runner-neutral replacement already existed) before implementation began —
  the investigation itself is what justified acting same-session rather
  than deferring further, even though this line originally said otherwise.
  Dispatched as `NVA-MANIFESTRUNNER-1` (goldfish-deep) the same session.
- **Outcome:** Critic review (`claude-sonnet-5` at `max`) returned **FAIL**
  (1 blocker — verify evidence bound to the wrong commit; 3 minor — stale
  Codex-worded diagnostics/comment, and this Triage note left unreconciled).
  All four resolved directly, no second Critic round (this session's
  one-round practice). Full account:
  `specs/sprint-nova-epic/evidence/backlog/2026-08-17-manifest-repair-runner-gate-closure.md`.
  Closed `4af6bb0b` (the commit resolving every Critic finding; the original
  fix landed at `a9a170a7`).
- **Date:** 2026-08-17 (filed and fixed); 2026-08-17 (closed, same AFK block)
