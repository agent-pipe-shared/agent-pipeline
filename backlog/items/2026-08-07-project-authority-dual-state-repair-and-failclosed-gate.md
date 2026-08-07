---
schema: pipeline.backlog-item.v1
id: pipeline.project-authority-dual-state-repair-and-failclosed-gate
type: defect
owner: pipeline
status: open
source: merge report section 4 finding 8 and the two narrowed findings on po-gate-authority.mjs (specs/sprint-phoenix-epic/evidence/merge-0.5.2-what-fell-away.md gitignored evidence artifact); merge commit 75b8361
created: 2026-08-07
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

No proposal yet. Two independent questions for the redesign round: (1)
whether main's `resolveProjectAuthorityPaths` needs a fail-closed mode
restored for the ambiguous/mixed case, and (2) whether Phoenix's dual-state
repair tool is still needed given main's simpler project-authority layout
(ADR-0046), or whether that layout structurally avoids the ambiguity Phoenix
had to repair.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
