# Dispatch-record and budget progress reconciliation

This note prevents two completed Nova-B subproblems from being rebuilt while
the broader runner-parity items remain open.

On 2026-09-12 the dispatch record writer and v3 validator suites passed:

```text
node --test plugins/pipeline-core/scripts/dispatch-record-write.test.mjs plugins/pipeline-core/lib/dispatch-record.test.mjs
```

The writer validates the full record before an exclusive create, restricts the
target to `evidence/dispatch-record-<taskId>.json`, checks model binding and
performs physical readback. The workflow return boundary separately requires a
matching writer receipt and commit-authorship result before success. This is
the completed record-write axis of
`pipeline.unenforced-process-rules-vary-by-runner`; it does not prove a real
environment reroute or cross-runner budget enforcement.

The six `dispatch-budget-core` cases also passed. The canonical and vendored
Goldfish templates are byte-aligned on the current max-turns/base-plus-closing
guidance and honestly name the runner-support boundary. This completes proposal
1 of `pipeline.briefed-tool-budgets-are-estimated-too-low-and-nothing-enforces-them`.
It does not validate the proposed empirical estimation formula and does not add
authenticated Codex or Antigravity live-call adapters.
