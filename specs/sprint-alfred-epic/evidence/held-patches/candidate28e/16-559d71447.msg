fix(lifecycle): refuse a feature id at set-feature that the design chain refuses later

Glossover consumer finding G1 (2026-11-12): `set-feature --id
2026-10-26-epic2-...` and `bind-adr-proposals.mjs --feature` accepted an
id starting with a digit; `design-review-receipt.mjs create` refused it
much later with a bare DRR-SHAPE. Renaming the id then left the PRD in the
date folder, and the feature package could no longer be registered (G7).

- lib/feature-id.mjs: the one shape that walks the whole lifecycle,
  ^[a-z][a-z0-9-]{2,63}$ (the narrowest of the later checks: the design
  receipt, approval binding and PO proof take {0,63}, the feature close,
  the close-commit split, the audit preflight and the Semgrep baseline
  {2,63}); a refusal names the flag, the shape, a digit-first hint and
  that the package lives in specs/<feature-id>/
- pipeline-state.mjs set-feature refuses any other id with exit 2 before
  anything is written
- bind-adr-proposals.mjs --feature uses the same rule (it accepted
  upper case, dots and underscores)
- design-review-receipt.mjs: a DRR-SHAPE caused by the feature id names
  --feature and the expected shape

Tests: PS07-G1 (six refused ids, nothing written, digit hint, the id
without the date prefix accepted); the bind refusal before any file is
read; the receipt message for "Not A Feature" and a dated id. Test ids
"x", "f1", "f2" in the harness State test became "xyz", "feat-1",
"feat-2". Harness pipeline-state, the State, observer, discard, lifecycle
event, inspect, seal and staging suites, architecture-baseline and both
receipt suites: green.

AI-Assisted: true
Dispatch: stage-0 (elephant)
