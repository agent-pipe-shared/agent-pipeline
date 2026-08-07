---
schema: pipeline.backlog-item.v1
id: pipeline.project-authority-dual-state-repair-and-failclosed-gate
type: defect
owner: pipeline
status: closed
source: merge report section 4 finding 8 and the two narrowed findings on po-gate-authority.mjs (specs/sprint-phoenix-epic/evidence/merge-0.5.2-what-fell-away.md gitignored evidence artifact); merge commit 75b8361
created: 2026-08-07
closed_at: 2026-08-07
closure_repository: self
closure_commit: 1f070c91743b7340c59ea5836286cd632bb0eba8
closure_evidence: backlog/evidence/2026-08-07-project-authority-failclosed-closure.md
---

# Project-authority dual-state repair is gone; the paired gate now fails open on ambiguity

## Description

The 0.5.2 merge (`75b8361`, local only) resolved two related files to main's
implementation:

- `plugins/pipeline-core/lib/project-authority.mjs` — Phoenix's
  dual-state (legacy/neutral) synchronization + recovery subsystem has no
  equivalent on main; no repair tool exists there for the ambiguity the
  paired finding below depends on.
- `plugins/pipeline-core/lib/po-gate-authority.mjs` (and its test) —
  assessed "narrowed" rather than "genuinely absent": main covers the core
  manifest-path-resolution case via its own `resolveProjectAuthorityPaths`,
  but silently falls back on ambiguous/mixed project authority instead of
  Phoenix's explicit fail-closed `PO-GATE-STATE-AUTHORITY-UNAVAILABLE` code.

Together these mean the merged tree has lost both the repair mechanism for a
legacy/neutral project-authority split and the fail-closed signal that would
have flagged the ambiguity in the first place — main's gate proceeds on a
best-effort resolution instead of refusing to.

## Triggering situation

Merge conflict resolution, code-conflict batch (28 files, origin/main taken
verbatim per PO's same-function policy).

## Affected artifact

`plugins/pipeline-core/lib/project-authority.mjs`,
`plugins/pipeline-core/lib/po-gate-authority.mjs` and its test.

## Proposal

**Implemented (2026-08-07).** Question (1) — fail-closed restored:
`po-gate-authority.mjs`'s `activeFeatureState` now returns a dedicated
`"unavailable"` status for any non-`"ready"` `resolveProjectAuthorityPaths`
result (mixed, missing, unsafe, migration-required), mapped to
`PO-GATE-STATE-AUTHORITY-UNAVAILABLE` in `validatePoGateAuthority`. The
`"ready"` path is byte-for-byte unchanged. Regression coverage added
permanently in `po-gate-authority.test.mjs` (mixed + missing, via both
`validatePoGateAuthority` and `validatePoGateAuthorityForRepository`).
Commit `1f070c9` on `sprint_phoenix` (cherry-picked from a Goldfish-deep
dispatch's worktree commit `f8121a5`, verified byte-identical target files
before the pick). Verify: `node plugins/pipeline-core/lib/po-gate-authority.test.mjs`
→ 39/39 passed, exit 0; `node plugins/pipeline-core/lib/project-authority.test.mjs`
→ 25/25 passed, exit 0.

Question (2) — dual-state repair tool: **not needed.** Main's
`project-authority.mjs` already has its own equivalent repair/migration
mechanism for both ambiguity classes: `planProjectAuthorityMigration`/
`applyProjectAuthorityMigration`, covering `"migration-required"`
(`PA-LEGACY-STATE-RETIREMENT-REQUIRED`, a `retire-legacy-state` operation)
and `"mixed"` (an `adopt-existing-neutral` provenance-gated plan/apply flow),
with the same durable-journal/transaction-recovery discipline Phoenix's tool
had. Phoenix's separate subsystem is functionally superseded, not genuinely
absent — confirmed by reading the current code, not assumed. No repair tool
was built; none is needed.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, implemented
- **Rationale:** fail-closed on ambiguous project authority is a core safety
  property this session already relied on elsewhere (continuity-authority
  work); low-risk, well-scoped, no dependency on the larger redesign items.
  The paired "is a repair tool still needed" question resolved to "no" on
  investigation — main's project-authority.mjs already covers it.
- **Assignment (if accepted):** done, 2026-08-07.
- **Date:** 2026-08-07
