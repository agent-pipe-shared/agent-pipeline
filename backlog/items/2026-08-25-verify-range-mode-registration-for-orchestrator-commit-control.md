---
schema: pipeline.backlog-item.v1
id: pipeline.verify-range-mode-registration-for-orchestrator-commit-control
type: idea
owner: pipeline
status: open
created: 2026-08-25
sprint: alfred
done_when: contains harness/scripts/verify.mjs check-commit-type-range.mjs
source: "Split out of backlog/items/2026-08-08-orchestrator-authored-production-commits-have-no-deterministic-control.md at closure, 2026-08-25 -- Part B of that item's 2026-08-19 'Direction 1 design' section, fully designed but never built and never required to consider that item's own stated problem closed."
---

# Redundant defense-in-depth range check for `verify.mjs` (Part B of the orchestrator-commit-control item)

## Description

`backlog/items/2026-08-08-orchestrator-authored-production-commits-have-no-deterministic-control.md`
(Part A, GIT-01/GG-22 commit-time enforcement, closed 2026-08-25) blocks a
bad commit type at the moment `git commit` runs. Part B is a second,
independent, defense-in-depth layer: a `verify.mjs` suite that audits an
entire commit *range* after the fact, catching anything that slipped past
GIT-01 through a path that bypasses the commit-time hook. Not required to
consider the original item's problem closed — Part A alone already delivers
the item's most valuable piece — but real, designed, undelivered scope
worth keeping visible rather than left to rot inside a closed item.

## Design (carried over verbatim from the source item's 2026-08-19 note)

**This registration step IS TP-3-protected; needs its own signed HGO
ceremony, separate from and after any implementation work.**

Mirror the `backlog-state-check` / checker-vs-tests split pattern correctly:
register the CHECKER script as the verify suite entry, not only its test
file (the exact gap the final Nova-A T1 Critic review flagged as its F1
finding against a sibling item — do not repeat it here).

1. New script `plugins/pipeline-core/scripts/check-commit-type-range.mjs`:
   exports a pure-ish `auditCommitTypeRange({ root, base, head, gitOperations })`
   (injectable git adapter for its own tests, same pattern as
   `check-product-capability-inventory.mjs`'s `_testGitOperations`) that
   walks `git log --format=%H%x00%s base..head`, builds the `{sha,
   subject}[]` array `commitTypeFindingsForRange` already expects, and
   returns `{ok, findings}`. Direct invocation (`process.argv[1] ===`
   this file) exits 2 on any finding, matching
   `check-state-numeric-claims.mjs`'s live-mode entry point shape.
2. **Default range source (open sub-question, small — confirm during
   implementation, does not block starting):** parse the short SHA embedded
   in `plugins/pipeline-core/.claude-plugin/plugin.json`'s `version` field
   (e.g. `f047f63` from `0.6.0+claude.20260819081848.f047f63`) as the
   default `base`, resolved to a full SHA via `git rev-parse`; `head`
   defaults to `HEAD`. If the field is absent or unparsable, the checker
   must report `{ok: true, findings: [], skipped: "no resolvable base"}`
   rather than crash or block — a missing anchor is "not looked at", not
   "clean".
3. New `check-commit-type-range.test.mjs`, fixture-driven against the
   injected `gitOperations`, no real `git log` walk in tests.
4. Register `check-commit-type-range.mjs` itself (not just its test file)
   as a `harness/scripts/verify.mjs` suite entry — this is the step that
   needs the fresh signed TP-3 HGO ceremony.

## Triage

- **Decision:** open, unassigned. No urgency signal (defense-in-depth on
  top of an already-working commit-time control) — pick up when a session
  has spare bounded-dispatch capacity and a TP-3 ceremony is convenient to
  batch with other work.
