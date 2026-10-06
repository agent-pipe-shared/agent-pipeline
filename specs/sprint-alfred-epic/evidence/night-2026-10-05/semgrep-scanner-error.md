# SEMG-d: diagnosis of the semgrep `scanner_error` in the 2026-10-05 security-scan

Read-only diagnosis. No code, test or config changed. Origin: `specs/sprint-alfred-epic/evidence/verify-2026-10-05/triage.md:39` ("semgrep scanner_error", classified "semgrep error likely env", undiagnosed).

## (a) Paths yielding a non-PASS status in `plugins/pipeline-core/scripts/security-adapters/semgrep.mjs`

| Line | Status / classification | Meaning |
|---|---|---|
| 101-103 | SKIPPED / `binary_missing` | binary not found (PATH search or `PIPELINE_SEMGREP_PATH`, lines 46-63). Not `scanner_error`. |
| 119-122 | ERROR / `scanner_error` | cannot create the scratch dir (mkdtemp). |
| 137-139 -> 69-86 | ERROR / `scanner_error` (or `execution_environment` for EPERM/EACCES, line 70-77) | spawn threw. |
| 143-145 | ERROR / `scanner_error` | whole-subprocess timeout, reason `semgrep timed out after <timeoutMs>ms`. |
| 146-148 -> 69-86 | ERROR / `scanner_error` or `execution_environment` | `res.error` other than ETIMEDOUT. |
| 150-158 | ERROR / `scanner_error` | nonzero exit, reason `semgrep exited <n>: <stderr[0..500]>`. |
| 163-172 | ERROR / `scanner_error` | stdout not parseable JSON. |
| 174-182 | ERROR / `scanner_error` | JSON lacks a `results[]` array. |
| 184-192 | ERROR / `scanner_error` | JSON `errors[]` non-empty, even at exit 0 with empty results (fail-closed; reason `semgrep JSON contains an error payload`). This is the path the backlog item `backlog/items/2026-08-11-semgrep-timeout-on-oversized-pipeline-state-test-file.md` documents (per-rule per-file timeout reported as `errors[]`). |

A missing rule file is not a separate branch: semgrep itself would exit nonzero (line 150 path) or put it in `errors[]` (line 184 path). The adapter passes `--timeout 45 --timeout-threshold 0` (line 115) to bound semgrep's per-rule-per-file budget.

## (b) This host (measured)

Driver: `scratch/SEMG-d/probe.mjs` (scratch is not tracked), run via capture-evidence, exit 0, log `scratch/SEMG-d/probe.log`.

- `isInstalled()` (semgrep.mjs:65): `installed: true` (found via PATH/override).
- Version: `1.171.0` (`semgrep --version`, status 0).
- Timeout the security-scan route uses: `DEFAULT_TIMEOUT_MS = 60000` (`plugins/pipeline-core/scripts/security-scan.mjs:130`), passed through to the adapter as `timeoutMs` (line 953 area). The CLI overrides it only via `--timeout-ms` (lines 1114-1115). `harness/scripts/verify.mjs:951` runs the suite as plain `security-scan.mjs`, and `rg -n timeout harness/scripts/verify.mjs` returns nothing, so the 60000 ms default applies (inferred from absence of any flag). The 5000 ms value (`PREFLIGHT_TIMEOUT_MS`, line 131) bounds only the child-process preflight, not semgrep.
- Default ruleset: `plugins/pipeline-core/security/semgrep/pipeline.yml` (security-scan.mjs:145, 233), fully offline by its own header comment.

## (c) One bounded adapter run on a tiny fixture (measured)

Fixture `scratch/SEMG-d/fixture/` (`a.js`, `b.py`), shipped default ruleset, `timeoutMs: 60000`:
status `PASS`, classification `success`, 0 findings, duration about 2.9 s (adapter diagnostics: exit 0, `complete-json`, resultsCount 0, errorsCount 0, version 1.171.0). No network need was observed; the offline local ruleset and the adapter's version-check/metrics-off env were used. Nothing was run on the whole repository.

## (d) Most likely path of the 2026-10-05 result

Measured: on this host semgrep is installed, healthy, and the adapter plus default ruleset complete cleanly on a small tree. That rules out binary-missing, spawn/permission failure, unparsable output and missing-ruleset causes for the adapter itself on this host (the 2026-10-05 verify host may differ; not verified).
Inferred, not measured: the scan was over the whole repository, where the two scale paths remain: (1) line 184-192, a non-empty `errors[]` (per-rule/file timeout or parse error on a large or odd file) at exit 0, or (2) line 143-145, the 60000 ms outer timeout on a large tree. The triage line records only the label "scanner_error" without the `reason`, so the two cannot be told apart from it. The "likely env" tag is therefore unconfirmed: the cause is scale or repository content, not a missing/broken install. Deciding between (1) and (2) needs the `reason` text from one full-repo security-scan run, which was out of scope here (forbidden whole-repo run).

## (e) The "semgrep timed out after 5000ms" cells

The string `timed out after` does not occur in `plugins/pipeline-core/scripts/security-scan.test.mjs`; it is produced only by the adapter (semgrep.mjs:144) with the caller's `timeoutMs`. In the test file every semgrep cell (about lines 818-873, 1089, 1290-1379) passes `timeoutMs: 5000` and uses fixture binaries via `fixtureSpawnFn` or `config.binaryPath`, so no real semgrep process is involved. Such a message could appear only if a test cell spawned the real binary with the 5000 ms budget, which is not what the fixture-based cells do (inferred from reading the cells; the suite was not run). Result: I found no evidence that those cells share the cause; they are a different mechanism (5000 ms test budget vs the route's 60000 ms), and I could not locate a failing cell with that string.

## (f) Proposed next step (text only)

1. Env fix is not indicated (install is healthy). Capture the actual `reason` and `diagnostics` (the adapter already attaches `diagnostics`, semgrep.mjs:228) from one full-repo `node plugins/pipeline-core/scripts/security-scan.mjs` run, preferably on the host class that failed, to separate the timeout path (143-145) from the `errors[]` path (184-192).
2. If it is `errors[]`: consider the backlog item's option of treating `level: "warn"` per-file timeouts as degraded-coverage rather than fatal (code change in semgrep.mjs:184, with a new test), or exclude the oversized file via semgrep ignore. If it is the 60 s outer timeout: raise `--timeout-ms` for the verify invocation or scope the scan (config change in the verify suite entry; `harness/verify-suites.json` is a protected path, TP-13, so that needs the PO route).
3. Record the captured `reason` into the triage row so the "likely env" label is replaced by a measured one.
