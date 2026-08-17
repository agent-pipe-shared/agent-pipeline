---
schema: pipeline.backlog-item.v1
id: pipeline.host-managed-codex-apply-may-fail-its-own-target-boundary-invariant
type: defect
owner: pipeline
status: open
created: 2026-08-12
source: "NVA-BL-67, 2026-08-12, surfaced while measuring an unrelated manifest-seed divergence (backlog/items/2026-08-08-two-manifest-literals-still-bypass-the-single-seed-owner.md). Explicitly flagged as unconfirmed, not asserted as a production defect."
---

# `applyRunnerProfileMigrationV3` may fail its own `validateTargetBoundary()` invariant for a host-managed-Codex apply

## What happened

While measuring an unrelated manifest-seed divergence, a dispatch built a
synthetic fixture reproducing the host-managed-Codex fresh-project branch
(`plugins/pipeline-core/lib/runner-profile-migration-v3.mjs`) and called
`applyRunnerProfileMigrationV3(plan, { activate: true })` against the
resulting plan. The call failed:

    apply_failed: "V3 transaction has an incomplete target boundary"

`validateTargetBoundary()` (`runner-profile-migration-v3.mjs:714`) appears
to expect the target count to equal the FULL `runtimePaths()` set
(including `.claude/*` paths). But for a host-managed-Codex plan, `.claude/*`
paths are already filtered OUT of the `internal` target array before the
plan is authenticated (`projectedTargets = hostManagedCodex ? ... .filter(t
=> !t.path.startsWith(".claude/")) : ...`, line ~578-580) — so the count the
plan actually carries can never match what the boundary check expects on
this branch, by construction.

## Why this is explicitly NOT confirmed as a production defect

The dispatch that found this was scoped to measure a different thing and
did not have budget to rule out an explanation in its own synthetic
fixture: it is possible real host-managed-Codex operation never reaches
`applyRunnerProfileMigrationV3` with `activate: true` the way the fixture
invoked it, or requires preconditions the fixture did not reproduce (e.g.
a specific plan shape, an intermediate step, or a precondition guard
upstream that a live session always satisfies first). No live/production
reproduction was attempted.

## Direction, not a design

A dedicated, narrowly-scoped follow-up should: (1) confirm whether a real
host-managed-Codex onboarding session ever actually calls
`applyRunnerProfileMigrationV3({ activate: true })` on a plan shaped like
the one in this fixture, or whether some other code path/precondition
makes this unreachable in practice; (2) if reachable, either adjust
`validateTargetBoundary()`'s expected count to account for the
host-managed-Codex filter, or explain in code why the mismatch is
intentional and harmless.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, confirmed as a real reachable defect (upgraded from
  "unconfirmed" — this triage pass read the code rather than reproducing the
  fixture). `prepare(root, targets, deps)`
  (`runner-profile-migration-v3.mjs:786-787`) calls
  `validateTargetBoundary(targets)` directly with the caller-supplied
  `targets` array, which for a host-managed-Codex plan is the
  `.claude/`-filtered `projectedTargets`/`internal` array built at
  `:578-581`. `validateTargetBoundary()` (`:714-721`) compares against
  `expected = runtimePaths().sort(...)` (`:256-262`), which reads the FULL,
  unfiltered runtime-ownership manifest with no host-managed-Codex awareness
  at all. A host-managed-Codex apply's target count is therefore structurally
  smaller than `expected.length` by construction — the mismatch is not an
  edge case, it is guaranteed for every host-managed-Codex apply that reaches
  this path. Stays open, current-scope (not deferred): this can block a real
  host-managed-Codex onboarding apply today, which is exactly the class of
  problem the PO's Windows-handover blockers this session were about — no
  direct link confirmed, but the severity profile matches and it should not
  wait for a later sprint.
- **Rationale:** verified by reading `runtimePaths()`, `validateTargetBoundary()`
  and the `prepare()` call site directly; the filter/expectation mismatch is
  unconditional on the host-managed-Codex branch, not merely plausible.
- **Assignment (if accepted):** needs a dedicated goldfish-deep dispatch
  (guardrail/transaction-integrity code) — either make
  `validateTargetBoundary()` host-managed-Codex-aware (filter `expected` the
  same way `projectedTargets` is filtered) or explain in code why the two
  must differ. Not fixed in this triage pass (docs/backlog-only).
- **Date:** 2026-08-17
