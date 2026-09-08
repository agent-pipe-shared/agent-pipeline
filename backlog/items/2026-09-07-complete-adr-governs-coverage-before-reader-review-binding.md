---
schema: pipeline.backlog-item.v1
id: pipeline.complete-adr-governs-coverage-before-reader-review-binding
type: requirement
owner: pipeline
status: open
created: 2026-09-07
source: "PO decision 2026-09-07, decision queue items 10 and 12: follow the recommended separate ADR coverage package before depending on reconciliation for the reader-review binding."
sprint: nova-b
done_when: manual
---

# Complete ADR governing-path coverage before adding reader-review binding

## Description

The PO has accepted a reader review inside each documentation block and a cheap
documentation-state binding at release preflight. The existing reconciliation
precedent only enforces ADRs with a `**Governs:**` header; its missing coverage
must be addressed as a separate package before the new binding relies on it.

## Triggering situation

The 2026-09-06 queue reported 12 of 80 ADRs carrying governing paths. That count
is a historical baseline, to be remeasured against the actual implementation
candidate rather than copied as a current result.

## Affected artifact

- `docs/adr/` accepted decision headers and their real governed source paths.
- `harness/scripts/check-doc-reconciliation.mjs` and its existing checks.
- `docs/doc-reconciliation.md`, whose binding remains commit-range specific.
- `backlog/items/2026-09-06-documentation-has-no-reader-facing-review-and-no-machine-binding-for-one.md`.

## Acceptance criteria

- Inventory the complete current ADR corpus and its parsed governing paths.
- Add accurate, bounded paths for each applicable decision, derived from its
  own contract; do not add empty, nonexistent, or blanket globs to inflate coverage.
- Explicitly account for historical/superseded decisions and any legitimate
  non-code decision rather than silently exempting them.
- Exercise the existing checker with a governed change lacking reconciliation
  and its properly reconciled counterpart; preserve the candidate/ref binding.
- Record final coverage and residual exclusions. Existing acceptance checks
  must remain green; do not weaken the checker to make coverage appear complete.

## Triage

- **Decision:** accepted by the PO, queue item 12.
- **Rationale:** repair the precedent before building the new binding on it.
- **Assignment (if accepted):** Nova B; after the item-10 decision and before
  implementing the reader-review release binding.
- **Date:** 2026-09-07

### Progress — 2026-09-08

The corrected corpus inventory counts 75 accepted ADRs among 80 numbered
documents; 19 now declare Governs paths after seven bounded additions.
The prior 74-accepted denominator misread accepted-as-drafted ADR-0062.
Fifty-six accepted ADRs remain without declarations. Exact path rationale,
body-preservation checks and source-hash-bound counts are recorded in
`backlog/evidence/2026-09-08-adr-coverage-progress.md`.

The existing checker was exercised against real isolated Git refs: a newly
governed change rejects missing/uncommitted/stale records and accepts only
the exact candidate's committed descendant record. This is an acceptance
fixture, not the final source-candidate reconciliation. The item stays open
until remaining scope and residual exclusions are addressed.
