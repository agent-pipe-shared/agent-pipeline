---
schema: pipeline.backlog-item.v1
id: pipeline.git-identity-ask-step-unreachable-through-live-cli-path
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-12
closure_repository: self
closure_commit: 476ca6472635f15186f23568eab3e1951a599213
closure_evidence: backlog/items/2026-08-10-git-identity-ask-step-unreachable-through-live-cli-path.md
created: 2026-08-10
source: "GF-103's own final report (2026-08-10), self-disclosed as a caveat rather than papered over; confirmed independently by the Elephant reading applyLifecycle's 'portable' branch directly."
due: 2026-08-17
---

# The git-identity ask-step GF-103 built is correct but unreachable through the real onboarding CLI path

## Description

GF-103 (commit `018d523b`) replaced the passive, easy-to-miss warn-only
diagnostic for a missing git author identity with a real `collect-input`
ask-step, at the `applyProjectOnboardingV3()` function level. The
implementation is correct, tested (115/115 in
`project-onboarding-v3.test.mjs`, independently re-run and confirmed by the
Elephant), and safe (never invents an identity, never writes `--global`).

**But it does not fix the originally-reported live bug end to end.**
Confirmed by direct code reading: `applyLifecycle()`'s `operation ===
"portable"` branch (same file, `project-onboarding-v3.mjs` around line
4156-4166) calls `applyProjectOnboardingV3(plan, { rootDir, activate: true,
deps: fs })` and DISCARDS its return value entirely, then immediately
returns a completely fresh `v4Inspection(rootDir, fs, intent, runner)`
instead. This is the actual function the real `apply-portable-seed
--activate` CLI path (what a live onboarding session drives) goes through.
The new `nextAction` (and the old diagnostic before it) is therefore never
seen by a real onboarding session — only a direct unit-level call to
`applyProjectOnboardingV3()` observes it.

In short: this candidate ships correct groundwork, but a fresh onboarding
session run against this exact candidate will very likely still discover a
missing git identity only when the first commit fails, exactly as before —
the fix is not yet live-effective.

## Triggering situation

Discovered by GF-103 itself while implementing the PO-approved "ask and set
git identity at setup" fix (2026-08-10), and reported honestly as a caveat
rather than claimed as fully done. Independently confirmed by the Elephant
reading the exact discard-and-reinspect code path before merging GF-103's
commit, specifically so this gap would not be silently shipped as "fixed."

## Affected artifact

`plugins/pipeline-core/lib/project-onboarding-v3.mjs`: `applyLifecycle()`'s
`operation === "portable"` branch (confirm current line numbers; approximately
4156-4166 as of commit `018d523b`), and by extension `v4Inspection()`/
`readyLifecycleResult()`'s status/resting-status schema and the CLI's
`restingStatuses` table, all of which GF-103 identified as needing to change
together to thread a `nextAction` like this one through to a live caller.

## Proposal

No fix designed — GF-103 explicitly flagged this as "real design work with a
wide blast radius across existing status-transition tests," not a quick
follow-up, and recommended it as its own separately-scoped task rather than
attempting it under the current dispatch's time pressure. Whoever picks this
up should: (1) design how an additive `nextAction` (not a new terminal
status, to avoid the same `fakeDeps`/`fakeGit` test-breakage GF-103 avoided)
threads through `v4Inspection()`/`readyLifecycleResult()` to a real CLI
caller for the portable-seed apply path specifically; (2) confirm the fix
actually surfaces in a live `apply-portable-seed --activate` run, not just a
direct `applyProjectOnboardingV3()` unit call; (3) only then consider the
original 2026-08-09/2026-08-10 git-identity bug closed.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, due-dated (2026-08-17) — this is the actual
  remaining work to close the git-identity bug for real; GF-103's merge is
  correct groundwork, not the finish line.
- **Rationale:** shipping GF-103 alone without this item would let the
  candidate claim a fix that a real next greenfield test would very likely
  still fail to observe, reproducing the exact original PO complaint.
- **Assignment:** none yet — needs its own scoped design pass per GF-103's
  own recommendation, not a same-day quick dispatch.
- **Date:** 2026-08-10

### Confirmed (PO, 2026-08-12)

- **Decision:** proceed as recommended — dispatch to goldfish-deep now.
- **Rationale:** PO, 2026-08-12: "so machen."
- **Date:** 2026-08-12

### Closed (NVA-BL-67B, 2026-08-12)

Fixed and verified end to end (commit `476ca647`): `applyLifecycle()`'s
portable branch now wraps both its return paths in
`withPendingAuthorIdentityAsk()`, surfacing an additive
`authorIdentityAction` field on the `apply-portable-seed --activate` CLI
response itself, not just on a direct unit call. 116/116 pre-existing
tests unchanged, one new end-to-end regression test proves the fix at the
real CLI entry point (not just the inner function). Gated on all three of
the portable-apply's own resting statuses, not just the common case, after
Advisor review flagged that a root landing directly on a plugin-managed
Codex runtime would otherwise skip past the first status and still
reproduce the bug.
