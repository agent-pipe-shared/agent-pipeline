# w318: the Spec risk trace texts and the Critic inspection hint

Slice C31-M8 (candidate 31, lane L3, stage S3 of `specs/sprint-alfred-epic/plans/accepted-prd-risk-trace-table-2026-11-18.md`). Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

Apply order: this patch is a delta on the base clone of candidate 31 (`35560870d..HEAD` of the clone chain). It applies only after that base patch is applied; it does not apply to the current checkout alone (checked with `git apply --check` against the base clone: exit 0).

## What

- `plugins/pipeline-core/lib/spec-risk-trace.mjs`: one new export `RISK_TRACE_FORMS` (the four trace forms in prose). The reader's own `malformed` reason now builds its text from it; the resulting string is byte-identical to the old one. Reading logic, statuses and return shape are untouched.
- `templates/spec.md`: new section `3a. Accepted risks and assumptions` with the table skeleton (header `| id | source | statement | trace |`, one `R-1` row with unfilled placeholders). An unfilled skeleton reads `untraced` through the reader, never `malformed`; the section says to delete it when the PRD accepts no risk.
- `templates/prd.md`: new `## Assumptions` block after the risks block, with one compact italic technical line that names the Spec table.
- `plugins/pipeline-core/agents/readiness-reviewer.md`: exactly ONE new paragraph (`Accepted risks:`) in "What to check". It stays a question (`DESIGN-QUESTION-n`), never a block, asked in the full round and in a delta round only when the correction changed that table. The blocking-finding definition and the report shape are unchanged.
- `plugins/pipeline-core/lib/spec-risk-trace.test.mjs`: four new failing-first cases (RED before the texts existed: 4 failed, 11 passed; GREEN after: 15 passed, 0 failed). They pin that the Spec template, the PRD template and the reviewer quote the reader's header and forms, and that the reader itself recognises the template skeleton.

## Why

A risk accepted in a PRD was prose that never became behaviour or a Critic question (consumer run A). Stage S3 gives the author a place to write the trace, the PO a line for assumptions, and the reviewer one question; the reader and the close readback row (stages S1/S2) already report, never refuse.

## Not changed

- No stored status, record shape, digest, key bytes, gate, signature, approval, Critic evidence semantics, security scan or audit bundle. No refusal text added or changed.
- The Critic inspection hint (PO tile: "risks without behaviour: <ids>; inspect whether the delivered behaviour or a stated residual covers each") is NOT built. `templates/prompts/critic-review.md` and its vendored copy are untouched: the template holds only slots the builder fills, and a new slot or placeholder would make `renderCriticBriefings` refuse with `CBB-TEMPLATE-PLACEHOLDER` ("a placeholder this builder does not know"); a static line cannot carry a derived list. The derived line has no home there yet. Its home is `plugins/pipeline-core/lib/critic-briefing-build.mjs` (`renderBody`, the `values` map and the whole-line placeholders, outside the write list), which would also need the Spec text read through `inspectSpecRiskTrace` (with `exists` from the project root). STOP-reported: that file, plus its test, and then the template line and the vendored copy via the repository's sync route (`check-vendored-template-sync.mjs`, canonical `templates/prompts/critic-review.md` -> vendored copy) belong to a follow-up dispatch. The reader already returns the ids (`rows` with `status === "untraced"`, `open` for untraced, stale and malformed); the line text and which of the two sets it lists is that dispatch's call.
- No `S4` backfill. No extra "hint" helper in the reader (code for later).

## Not proven

- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: tests only.
- Neighbour suites run in the clone, one at a time, all green: `check-doc-contracts` 76, `design-authoring` 5, the journeys pin 10, `po-language-projection` 1, `close-quality-readback` 18, `design-review-receipt` 82. The documentation-contract and agent-obligations generator pins were not edited; `generate-agent-obligations.test.mjs` was not run (no obligations source changed).
