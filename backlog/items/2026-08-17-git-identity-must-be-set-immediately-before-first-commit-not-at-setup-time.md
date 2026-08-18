---
schema: pipeline.backlog-item.v1
id: pipeline.git-identity-must-be-set-immediately-before-first-commit-not-at-setup-time
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "f57375ff77263a2df70bbb3201feb361912f07f6"
closure_evidence: "plugins/pipeline-core/lib/project-onboarding-v3.mjs"
source: "PO, 2026-08-17, live Codex happy-path restart test: 'ausserdem fragt er zwar früh daten zu git identitäten etc ab aber versucht diese dann vor readiness zu setzen, das sollte er nicht. abfragen ist gut aber nicht das setzen so früh.' (Codex correctly asks early for git identity data, but then tries to SET it before readiness — that should not happen; asking early is fine, setting that early is not.)"
---

# Git author identity should be asked early, but only SET immediately before the repository's first commit — not at setup/ask time

## Description

`plugins/pipeline-core/lib/project-onboarding-v3.mjs`'s `collectAuthorIdentityAction()`
(lines 3919-3931) returns a `collect-input` action whose `guidance` text
currently bundles ask and set into one instruction: "ask the PO once for the
author name and email, then set both in THIS repository's local config
only". This action fires (via `applyProjectOnboardingV3()` directly, or via
`withPendingAuthorIdentityAsk()` for `v4Inspection()` callers) whenever
`observed.status` is one of `runtime-initialization-required`,
`restart-required`, or `kickoff-required` (`PORTABLE_APPLY_IDENTITY_ASK_STATUSES`,
line 4418) — every one of those is a pre-`ready` lifecycle status. Following
the guidance literally, an agent (confirmed today with Codex) asks the PO and
then immediately runs `git config user.name`/`git config user.email` before
onboarding readiness is established at all.

## Why this refines, not reverses, the 2026-08-10 decision

`backlog/items/2026-08-10-git-identity-warn-only-diagnostic-does-not-meet-po-expectation.md`
records the PO's original instruction: "die lokale git identitäten name und
mail sollten direkt im setup abgefragt und festgelegt werden" (asked AND set
directly at setup) — this is why `collectAuthorIdentityAction()` currently
bundles ask+set. Today's instruction keeps the "ask early" half exactly as
it was (early asking is confirmed working and still wanted) and narrows only
the "set" half: the actual `git config` write should happen immediately
before the repository's first commit, not at the moment the values are
collected. The PO's own live-test evidence: setting this early, before
readiness, is itself the defect — not a hypothetical concern.

## Affected artifact

- `plugins/pipeline-core/lib/project-onboarding-v3.mjs`: `collectAuthorIdentityAction()`
  (lines 3919-3931, guidance string), its two call sites
  (`applyProjectOnboardingV3()` ~4071-4073, `withPendingAuthorIdentityAsk()`
  ~4418-4430), and the `AUTHORID-1` test-history comment block in
  `project-onboarding-v3.test.mjs` (~3359-3371) which should gain a matching
  `AUTHORID-2` note recording this refinement rather than silently
  overwriting the AUTHORID-1 history.
- `plugins/pipeline-core/skills/pipeline-start/SKILL.md`, lines 76-84 (the
  matching bootstrap-consent guidance mirrored for the agent reading the
  skill directly).

## Proposal

Not designed in full here, but narrow enough to likely be a wording-only
fix: reword the `guidance` string so it instructs the agent to ask now
(unchanged) but hold the answered values and apply `git config user.name`/
`git config user.email` only immediately before authoring this repository's
first commit — never sooner. The existing mechanism where this action keeps
re-surfacing on every subsequent inspect/apply call until the underlying git
config actually resolves already provides the "not yet done" signal for
free; no new state-tracking field should be needed unless investigation
finds a real gap (e.g. the ask re-prompting the PO repeatedly across
sessions before the first commit — if so, disclose it rather than silently
expanding scope). Existing test assertions
(`project-onboarding-v3.test.mjs` ~3391-3397) that the guidance names
`git config user.name`/`git config user.email`, never `--global`, and
explicitly rules out `--global`, must keep passing unchanged — only add to
the guidance text, don't remove what those assertions check for.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, current scope — narrow, PO-confirmed via live
  test, low blast radius (instructional text + one doc comment + SKILL.md
  paragraph).
- **Rationale:** live-test evidence of the actual failure mode (Codex
  executing the write before readiness), not a hypothetical; scoped tightly
  enough to dispatch immediately rather than defer.
- **Assignment:** dispatched same-day as NVA-GITID-1 (goldfish-deep,
  worktree-isolated — a second non-isolated dispatch was already running in
  the main checkout at filing time).
- **Closure (2026-08-18):** NVA-GITID-1 landed — `collectAuthorIdentityAction()`'s
  guidance at `project-onboarding-v3.mjs:3939` now explicitly holds the
  answered values and defers the `git config` write to "immediately before
  authoring this repository's first commit, never sooner". Confirmed present
  at HEAD during a systematic 0.6.0-release backlog sweep; item was left
  `open` past landing rather than closed.
- **Date:** 2026-08-17 (closed 2026-08-18)
