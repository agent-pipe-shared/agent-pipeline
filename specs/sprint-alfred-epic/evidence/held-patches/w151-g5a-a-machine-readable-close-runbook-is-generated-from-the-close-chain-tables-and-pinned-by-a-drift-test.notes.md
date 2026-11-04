# W151 C19-G5A generated close-path runbook (held patch notes)

Base: c5f1efa114d563c12ad3ac510c2e0c703d448619. Patch: `w151-g5a-a-machine-readable-close-runbook-is-generated-from-the-close-chain-tables-and-pinned-by-a-drift-test.patch` (git diff --binary, 4 new files).

## What
- `plugins/pipeline-core/scripts/generate-runbook.mjs`: builds the close-path runbook from `describeCloseChain`, `describeCloseActions`, `CLOSE_STEP_REQUIREMENTS` and `coordinatorNextPhases` (placeholders `<root>`, `<id>` kept). Canonical JSON, no timestamp, no absolute path. Args: `[--check]`, `--root <dir>` (default: the plugin directory). Without `--check` it writes `runbooks/close-path.v1.json` and `runbooks/index.v1.json`; with `--check` it writes nothing and exits 2 with `RUNBOOK-DRIFT <file>` on a byte difference.
- `plugins/pipeline-core/runbooks/close-path.v1.json` (schema `pipeline.runbook.v1`, `pathId: close`, ordered `steps`, `notGenerated` naming the quality rows and the push-threat-model action) and `index.v1.json` (schema `pipeline.runbook-index.v1`, sha256 of the path file).
- `plugins/pipeline-core/scripts/generate-runbook.test.mjs` (6 cases): drift pin against the committed files, determinism, every `CLOSE_STEP_REQUIREMENTS` phase exactly once as a step id, index digest, `--check` exit codes, write mode.

## Why
C19-G5 stage 1: a machine-readable, always-current close runbook that cannot silently drift from the close chain tables. Criterion binding AC-108 is the closest existing accepted criterion; the PRD and Spec are unchanged.

## Not changed
- `close-chain-guide.mjs`, `close-coordinator.mjs`, every command result: untouched; no `runbook` field anywhere (later stage). Nothing reads the runbook at runtime.
- `harness/verify-suites.json` and the inventory: the new test file needs registration by the Elephant.
- The chain walk follows the first branch of each fork, so `delivered` is not in `describeCloseChain`; the generator builds that step from its table row and the sibling's plan command (phase token swapped), because `stepFor` is not exported and was not to be changed.

## Not proven
- Packaging/allowlist checks that enumerate plugin top-level directories were not run against the new `runbooks/` directory outside the clone's targeted tests (see report). Full Verify is the Coordinator's.
