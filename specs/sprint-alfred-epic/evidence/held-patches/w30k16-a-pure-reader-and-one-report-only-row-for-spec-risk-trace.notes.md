# w30k16 — a pure reader derives the trace of accepted risks from a Spec table, and one report-only close readback row shows it (candidate 30k, slice C30K-K16)

Criterion binding: AC-112 is the closest existing accepted criterion (a fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged.
Source: `specs/sprint-alfred-epic/plans/accepted-prd-risk-trace-table-2026-11-18.md`. The PO released stages S1 and S2 only; S3 (texts) and S4 (backfill) are NOT built.

Order of application: this patch is a delta on the integrated 30j tree (the clone int30j). It does NOT apply to the real checkout until that tree is applied first; `apply --check` against that tree passes (exit 0). An `apply --check` against the real HEAD alone is expected to fail (exit 1) and is not an error.

## What it changes (two production files, two test files)

### S1: `plugins/pipeline-core/lib/spec-risk-trace.mjs` (new) and `spec-risk-trace.test.mjs` (new)

- `inspectSpecRiskTrace(specText, deps)` is a pure reader over ONE closed marker: a markdown table outside any fenced block whose header row is exactly `| id | source | statement | trace |` (case and spacing free; exported as `RISK_TRACE_HEADER`). Design A of the plan: a separate reader, never PRD prose, never `requirements.json`.
- `trace` is exactly one of a test path (`*.test.mjs|cjs|js`), `command:<id>`, `residual: backlog/items/<item>.md`, `not-applicable: <reason>`. Per row it returns `covered`, `residual-stated`, `not-applicable` (a stated reason), `untraced` (empty cell, placeholder, or a form with no value), `stale` (a named path or backlog item does not exist) or `malformed` (fits no form, wrong cell count, bad or repeated id). Overall `status` is `not-applicable` when the table is absent (or has no rows), else `applicable`; `open` lists the untraced, stale and malformed ids.
- Reads are injected: `deps.exists(rel)` is required only when a row names a path, and a throwing reader propagates (the caller turns that into `unknown`); `deps.isCommandRegistered(id)` is optional. Nothing is stored, written, run or fetched; the Spec bytes are the only state.
- 11 cases, written first against the missing module (RED: the import failed), cover: covered, residual, untraced (4 spellings), stale, malformed (7 shapes), not-applicable row, `command:` row, no table, header-only table, another header, three fence variants (backtick, tilde, longer fence not closed by a shorter one), table end, backticks and escaped pipes, never-claims-what-it-cannot-read, purity.

### S2: `plugins/pipeline-core/lib/close-quality-readback.mjs` and its test

- `QUALITY_ROW_IDS` gains `risk-trace` as the SEVENTH, appended id; the six existing rows and their order are unchanged. The row reads the Spec at the same `specPath` as `journey-coverage` and calls the S1 reader with the readback's own `exists` reader.
- `unknown` when the Spec cannot be read or a read throws (remedy: restore the Spec, run the readback again); `not-applicable` when there is no table; `present` when every row is covered, residual-stated or not-applicable (evidence lists `specPath (R-1: covered; ...)`); `missing` when any row is untraced, with the ids listed in the evidence and a remedy naming the human step (give the row a trace; on an approved Spec a registered Spec addendum, never an edit of approved bytes). Report-only: no refusal, no gate, no stored status.
- Tests (extended first, RED against the original code: 6 of 18 failed): the id list restated (QG-04: six ids became seven; the old "every other row is present" assertion now also leaves out `risk-trace`, which is `unknown` without a Spec reader), plus 5 new cases (unknown, not-applicable, present with evidence, missing with ids, six earlier rows unchanged beside a missing row).

## Test first

S1: `spec-risk-trace.test.mjs` RED (module absent), then 11 of 11 GREEN. S2: `close-quality-readback.test.mjs` RED 12 of 18 pass, then 18 of 18 GREEN. Each run alone in the clone with a private TMPDIR.

## Deliberately not changed

- **One neighbour pin outside the write list is stale and now RED (needs a two-line QG-04 restatement by the Coordinator).** `plugins/pipeline-core/scripts/close-coordinator.test.mjs`, case "process: AC-239 drive and --dry-run print qualityReadback ...", pins the readback to six rows: line 1118 (`deepEqual(out.qualityReadback.map((r) => r.id), [... "journey-coverage"])`) must gain `"risk-trace"` as a last element, and line 1132 (`assert.equal(seen.index.qualityRows.length, 6)`) must read `7`. I ran that file alone in the clone: 56 of 57 pass, the one failure is exactly this assertion (`actual` has `risk-trace`, `expected` does not). The edit is outside this dispatch's write list and the check file asserts the patch touches only four files, so it is reported, not built in. Nothing in that case asserts on the risk-trace row's status.
- The accepted-risk `AC-n` pointer (section 4.2 of the plan: a risk that became a criterion points to its `AC-n` instead of restating it) is NOT a trace form: the plan's own closed list in 4.1 has three forms and S1 names none for it, so such a cell reads `malformed`. Adding it needs a judgment on what "covered by a criterion" means; left for the PO.
- Judgment calls inside the stage text: `stale` and `malformed` rows also make the readback row `missing` (stage text names untraced; "a fully traced table makes it present" implies only a traced table does), and a header-only table reads `not-applicable` so an unfilled future skeleton does not flip a Spec. A `command:<id>` is `covered` by form because the plan hand-off already requires every `command:<id>` token anywhere in the Spec to be registered; the optional registry dep exists for a caller that has one.
- No change to `close-coordinator.mjs`, the close chain guide, the runbook, the readiness reviewer, the Spec or PRD templates (S3), the epic Spec (S4), any gate, signature, approval, push approval, Critic evidence, security scan or audit bundle semantics, record shape, digest or key byte. A missing `risk-trace` row appears as an advice action `quality-risk-trace` before the freeze through the existing `missingQualityRows` path (advice, never a gate; unchanged code). The existing audit index `qualityRows` carries the seventh row through the existing path.
- No time-based expiry, owner or due date on a residual (plan D3), no PRD parsing.

## Verify registration

`plugins/pipeline-core/lib/spec-risk-trace.test.mjs` is a NEW test file and is not run by Verify until it is registered in `harness/verify-suites.json` (a protected list, TP-13, not edited here). `close-quality-readback.test.mjs` is already registered (`close-quality-readback-tests`); its `nonOverlapNote` could name the new reader.

## Not proven

- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only. Verify, an independent Critic review and PO acceptance remain open.
- Tests run (each alone, in the clone): `lib/spec-risk-trace.test.mjs` 11 of 11; `lib/close-quality-readback.test.mjs` 18 of 18; `lib/pins/acceptance-criteria-are-examined-as-whole-user-journeys.test.mjs` 10 of 10; `scripts/close-coordinator.test.mjs` 56 of 57 (the one stale pin above); the held-patch check file 2 of 2. No other suite was run.
- The reader was only run against fixtures; it was not run over a real Spec (the epic Spec has no table, so it would read `not-applicable`). Table forms with indented code blocks, HTML tables or a table nested in a list are not read.
- The test-path shape rule is the reader's own regular expression (plus no `.`/`..`/empty segment); it is not the delivery-briefing validator the plan hand-off uses, so a path that validator would refuse could still read `covered` here when the file exists.
