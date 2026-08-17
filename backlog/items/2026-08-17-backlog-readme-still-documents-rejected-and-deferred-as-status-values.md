---
schema: pipeline.backlog-item.v1
id: pipeline.backlog-readme-still-documents-rejected-and-deferred-as-status-values
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Elephant self-caught, 2026-08-17, while independently verifying NVA-MICRO-1's fix to backlog/README.md's duplicate-merge convention (2026-08-17-merged-into-frontmatter-key-documented-but-unsupported.md)."
---

# `backlog/README.md`'s triage-rules step 2 still documents `status: rejected`/`status: deferred`, the same unsupported-value class step 3's sibling fix just corrected

## Description

`backlog/README.md`'s "Triage rules" section, step 2: "**reject** (rationale
in the item, `status: rejected`) / **defer** (`status: deferred`, state the
condition)". `reconcile-backlog-ledger.mjs`'s `ORDER` enum (confirmed by the
sibling item this session) accepts only `open`/`in_progress`/`closed` —
`rejected` and `deferred` are not in it, the same unsupported-value defect
class NVA-MICRO-1 just fixed for step 3's `merged-into`/`status: rejected`
duplicate-merge convention two lines below.

Not independently confirmed yet whether following step 2 literally actually
breaks anything the way the merge convention did (untested this session) —
filed on the strength of the enum mismatch alone, mirroring the sibling
finding's own method.

## Affected artifact

`backlog/README.md`, "Triage rules" step 2 (~line 57).

## Proposal

Not designed here. Confirm first (do not guess) what actually happens today
when an item is triaged as rejected/deferred in practice — grep existing
closed/rejected items for their real recorded `status:` value and pattern,
the same way the sibling fix found the real working "duplicate" pattern
before rewriting the docs. Likely direction: `status: closed` with the
rejection/deferral rationale in the Triage section's prose (matching the
convention step 3 now documents), not a distinct status value.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, current scope — small, same investigation shape as
  its already-fixed sibling.
- **Rationale:** self-caught while verifying the sibling fix; same
  documented-vs-enforced mismatch class, worth closing before another
  session follows step 2 literally.
- **Assignment:** unassigned; goldfish-mechanic-sized once the real
  reject/defer convention is confirmed against source.
- **Date:** 2026-08-17
