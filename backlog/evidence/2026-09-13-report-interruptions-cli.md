# Local Interruption Reporting CLI (C1 Slice 2) — Verification Evidence

- Date: 2026-09-13
- Task: `ALF-C1-S2-LOCAL-REPORTING`
- Scope Authority: `specs/sprint-alfred-epic/plans/c1-store-controller.md` §8/§9, `specs/sprint-alfred-epic/plans/sprint-alfred-execution-roadmap.md` C1 Slice 2
- Dispatch: `ALF-C1-S2-LOCAL-REPORTING` (goldfish)

## 1. Summary

Implemented the standalone CLI utility `report-interruptions.mjs` for reading, filtering, and reporting local C1 interruption receipts and store snapshots. The implementation connects the storage layout established in C1 Slice 1 with `aggregateInterruptionReceipts` from `interruption-receipts.mjs`, supporting both machine-readable JSON output and deterministic human-readable text summaries.

## 2. Deliverables & Implementation Details

1. `plugins/pipeline-core/scripts/report-interruptions.mjs`:
   - Command signature:
     `report-interruptions.mjs --root ROOT [--from ISO] [--through ISO] [--feature ID] [--package ID] [--dispatch ID] [--format json|text]`
   - `--root`: Required repository root path.
   - `--from` / `--through`: Optional ISO 8601 timestamps defining the window filter. Validates ISO format and enforces `--from <= --through`.
   - `--feature` / `--package` / `--dispatch`: Optional exact scope filters, validated against logical ID constraints (`/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/` without private credential patterns).
   - `--format`: Optional format, default `"json"`, supports `"json"` and `"text"`.
   - `--help` / `-h`: Emits usage summary to stdout and exits 0.
   - Reads from store via `createInterruptionStore` and inspects store topology (`evidence/interruption-collection/` and `evidence/interruption-receipts/`).
   - Validates each receipt against `validateInterruptionReceipt` with `policies/interruption-registry.v1.json`.
   - Computes deterministic `sourceEntries` and `entrySetSha256`, builds snapshot `pipeline.interruption-store-snapshot.v1`.
   - Aggregates filtered receipts using `aggregateInterruptionReceipts`.
   - Format `json`: Prints `{ schema: "pipeline.interruption-local-report.v1", snapshot, aggregate }` to stdout (exit 0).
   - Format `text`: Prints deterministic human summary preserving all metric values and status tags (exit 0).
   - On argument or execution failure: Emits `{ schema: "pipeline.interruption-report-result.v1", status: "rejected", code }` JSON to stderr, stdout empty, exits 2.

2. `.gitignore`:
   - Anchored ignore `/telemetry/interruptions/` is present to ignore report generation artifacts.

3. `plugins/pipeline-core/scripts/report-interruptions.test.mjs`:
   - Unit tests covering:
     - Argument parsing and validation (`--help`, `-h`, invalid args, invalid timestamps, invalid IDs).
     - Exit code 0 on `--help` with clean stderr.
     - Exit code 2 and `C1S-SHAPE` on invalid CLI arguments with clean stdout.
     - Exit code 2 and `C1S-NOT-FOUND` on absent stores with clean stdout.
     - Initialized store with 0 receipts producing valid JSON and text reports (exit 0, clean stderr).
     - Store with real preflight interruption receipts producing valid JSON and text reports (exit 0, clean stderr).
     - Multi-dimensional filtering across `--from`, `--through`, `--feature`, `--package`, and `--dispatch`.

## 3. Verification Results

All DoD checks executed locally and passed cleanly:

- Unit test suite:
  ```bash
  node --test plugins/pipeline-core/scripts/report-interruptions.test.mjs
  ```
  Result: 6/6 tests passed (0 failures, 0 skipped, duration ~1.1s).

- Sibling observer test suite:
  ```bash
  node --test plugins/pipeline-core/scripts/observe-critic-preflight.test.mjs
  ```
  Result: 3/3 tests passed.

- Core receipts test suite:
  ```bash
  node --test plugins/pipeline-core/lib/interruption-receipts.test.mjs
  ```
  Result: 93/93 tests passed.

- Diff hygiene:
  ```bash
  git diff --check
  ```
  Result: Clean (exit code 0).
