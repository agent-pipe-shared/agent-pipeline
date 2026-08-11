---
schema: pipeline.backlog-item.v1
id: pipeline.guard-lifecycle-ready-runner-allowlist-incomplete
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: 9427caa6a2e02ed78e49c3babb28df9d7195eef9
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-09
source: "Direct code inspection of guard-lifecycle-ready.mjs vs. session-cleanup.mjs's own documented CLI surface, while investigating the PO's private Codex + 0.5.4 test run, 2026-08-09. Independent of that run's actual failure chain — see the note below."
due: 2026-08-16
---

# `guard-lifecycle-ready.mjs`'s session-cleanup argv allowlist admits `--runner` for only 6 of the subcommands the CLI documents it for

## What's wrong

`plugins/pipeline-core/scripts/session-cleanup.mjs`'s own usage text states
"every command accepts an optional `--runner claude|codex`," and its flag
table lists `runner` as accepted for `confirm-privatization`,
`apply-recovery` and `apply-privatization` in addition to the subcommands
already fixed. `guard-lifecycle-ready.mjs`'s `sanctionedSessionCleanupArgs()`
was widened (2026-08-09, GF-059) to admit the optional `--runner claude|codex`
tail for `start`/`status`/`release-binding`/`plan-recovery`/
`plan-human-recovery`/`plan-privatization` only. The remaining documented
subcommands (`confirm-privatization`, `apply-recovery`, `apply-privatization`,
and `cleanup`) still require an exact argument count that has no room for the
tail, so the identical documented invocation is rejected two calls later in
the same privatization flow (`plan-privatization` → `confirm-privatization` →
`apply-privatization`).

Severity: minor, not blocker — `resolveRunner()`
(`session-cleanup.mjs:234-240`) already derives `codex` when `--runner` is
omitted, so an agent that simply drops the flag on the later calls has a
workaround. But the guard rejecting a flag its own target script documents as
universally accepted is a real, avoidable rough edge.

## Why this is filed separately

This gap was found by reading the code, not by reproducing a failure — the
incident that prompted the investigation
(`backlog/items/2026-08-09-kickoff-promotion-cleanup-readback-has-no-in-session-recovery.md`)
invoked `plan-privatization` *without* `--runner` at all, per
`plugins/pipeline-core/skills/pipeline-start/references/private-overlay.md:4`.
Bundling this fix into that item's remediation was an Elephant scoping error,
flagged by independent Critic review of GF-059 (F1/F4,
`scratch/nova-4e164e09/critic-notes.md`) — the two are unrelated defects that
happen to touch the same function.

## Direction

Widen `sanctionedSessionCleanupArgs()`'s optional-tail admission to cover
`confirm-privatization`, `apply-recovery`, and `apply-privatization` (and
confirm `cleanup`'s documented shape), matching exactly what
`session-cleanup.mjs`'s own usage text and flag table already document —
no wider than that surface, per the existing GF-059 pattern
(`sanctionedHumanOverrideArgs()`'s exact-tail style). New regression test
per subcommand, alongside the existing GF-059 test.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Closed (2026-08-11) — fixed.
- **Rationale:** `sanctionedSessionCleanupArgs()`'s optional `--runner` tail admission was widened to cover `confirm-privatization`, `apply-recovery`, and `apply-privatization`, matching `session-cleanup.mjs`'s own documented flag table per the item's Direction (`closure_commit` `9427caa6a2e02ed78e49c3babb28df9d7195eef9`).
- **Assignment:** N/A — already closed.
- **Date:** 2026-08-11.
