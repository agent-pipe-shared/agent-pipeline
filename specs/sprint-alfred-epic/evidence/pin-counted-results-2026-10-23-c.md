# Counted pin results, 2026-10-23 (set c: clusters K3, K4, K5, K8)

Measured on commit `905fb7568` in a local clone (`scratch/clones/k68`), one file after the other, each run once in the foreground with its own private TMPDIR outside every repository (a tracked-runner equivalent: spawn of `node <file>` with TMPDIR/TMP/TEMP set, as `scripts/run-quiet.mjs` does); no other suite was running on the machine. The three red files were re-run once alone to rule out load, with the same result each time. Nothing was fixed.

Totals: 30 test files plus 1 check (31 runs); 27 test files green and the license check PASS; 3 test files red (`lifecycle-denial-loop-guard`, `guard-apply-patch`, `antigravity-pretool-guard`). The 27 green files carry 486 passing cases (59 K3, 154 K4, 170 K5, 103 K8 on the three green K8 files), 0 failed, 0 skipped, 0 todo. `guard-gate-strength.test.mjs` and `guard-push-architecture.test.mjs` are listed under two clusters each but were run once.

The columns use the figures each suite prints. Suites that print their own summary instead of the node summary (marked `custom`) report that count in Cases and Pass; for these, Fail/Skip/Todo are 0 because the printed summary states 0 failed or lists no failing, skipped or todo case.

## K3

| Pin file | Verdict | Cases | Pass | Fail | Skip | Todo |
|---|---|---|---|---|---|---|
| `plugins/pipeline-core/lib/architecture-effective-decisions.test.mjs` | GREEN | 13 | 13 | 0 | 0 | 0 |
| `plugins/pipeline-core/scripts/architecture-baseline.test.mjs` | GREEN | 21 | 21 | 0 | 0 | 0 |
| `plugins/pipeline-core/lib/architecture-decision-continuity.test.mjs` | GREEN | 4 | 4 | 0 | 0 | 0 |
| `harness/scripts/architecture-entry-required-source.test.mjs` | GREEN | 2 | 2 | 0 | 0 | 0 |
| `plugins/pipeline-core/scripts/rigor-floor.test.mjs` | GREEN | 18 | 18 | 0 | 0 | 0 |
| `plugins/pipeline-core/hooks/guard-push-architecture.test.mjs` (GPA001) | GREEN | 1 | 1 | 0 | 0 | 0 |

## K4

| Pin file | Verdict | Cases | Pass | Fail | Skip | Todo |
|---|---|---|---|---|---|---|
| `plugins/pipeline-core/scripts/guard-human-override.test.mjs` | GREEN | 28 | 28 | 0 | 0 | 0 |
| `plugins/pipeline-core/lib/human-guard-override-capability-scan.test.mjs` | GREEN | 3 | 3 | 0 | 0 | 0 |
| `plugins/pipeline-core/scripts/commit-msg-hook-signed-integration.test.mjs` | GREEN | 9 | 9 | 0 | 0 | 0 |
| `plugins/pipeline-core/hooks/guard-git-signed-integration.test.mjs` | GREEN | 5 | 5 | 0 | 0 | 0 |
| `plugins/pipeline-core/scripts/model-family-approval-request.test.mjs` | GREEN | 10 | 10 | 0 | 0 | 0 |
| `plugins/pipeline-core/lib/critical-action-approval-request.test.mjs` (custom: "7 tests passed") | GREEN | 7 | 7 | 0 | 0 | 0 |
| `plugins/pipeline-core/lib/threat-model-approval-request.test.mjs` (custom: "39 checks passed") | GREEN | 39 | 39 | 0 | 0 | 0 |
| `plugins/pipeline-core/hooks/guard-gate-strength-ledger.test.mjs` | GREEN | 2 | 2 | 0 | 0 | 0 |
| `plugins/pipeline-core/hooks/guard-gate-strength.test.mjs` (custom: "41 passed, 0 failed"; also K8) | GREEN | 41 | 41 | 0 | 0 | 0 |
| `plugins/pipeline-core/scripts/pipeline-state-push-anchor.test.mjs` | GREEN | 10 | 10 | 0 | 0 | 0 |

`guard-push-architecture.test.mjs` (GPA001, also tagged K4) is counted in the K3 table above.

## K5

| Pin file | Verdict | Cases | Pass | Fail | Skip | Todo |
|---|---|---|---|---|---|---|
| `harness/scripts/check-doc-contracts.test.mjs` | GREEN | 76 | 76 | 0 | 0 | 0 |
| `plugins/pipeline-core/skills/pipeline-start/pipeline-start-v3.test.mjs` (PSV04 is a case of this file) | GREEN | 8 | 8 | 0 | 0 | 0 |
| `harness/scripts/check-language-canon.test.mjs` | GREEN | 4 | 4 | 0 | 0 | 0 |
| `harness/scripts/check-phase3-sdlc-coherence.test.mjs` (custom: TAP 31 ok, 0 not ok) | GREEN | 31 | 31 | 0 | 0 | 0 |
| `harness/scripts/no-autoupdate-key.test.mjs` (custom: "15/15 cases passed") | GREEN | 15 | 15 | 0 | 0 | 0 |
| `plugins/pipeline-core/scripts/check-spec-retention.test.mjs` (custom: TAP "pass 6") | GREEN | 6 | 6 | 0 | 0 | 0 |
| `plugins/pipeline-core/scripts/push-release-flow-docs-contract.test.mjs` | GREEN | 11 | 11 | 0 | 0 | 0 |
| `harness/scripts/check-license-contract.test.mjs` (custom: TAP "pass 19") | GREEN | 19 | 19 | 0 | 0 | 0 |

Check:

| Check | Verdict | Output |
|---|---|---|
| `node harness/scripts/check-license-contract.mjs` | PASS | `PASS: license contract (1989 JavaScript sources; SUL-1.0)` |

Name resolution: `spec-retention-check` resolved to `plugins/pipeline-core/scripts/check-spec-retention.test.mjs`; `push-release-flow-docs-contract` to `plugins/pipeline-core/scripts/push-release-flow-docs-contract.test.mjs` (no file of that name under `harness/scripts`); `no-autoupdate-key` to `harness/scripts/no-autoupdate-key.test.mjs`. The `doc-contract-tests` cases are all in `check-doc-contracts.test.mjs`.

## K8

| Pin file | Verdict | Cases | Pass | Fail | Skip | Todo |
|---|---|---|---|---|---|---|
| `plugins/pipeline-core/hooks/notebook-write-coverage.test.mjs` (custom: "8 passed, 0 failed") | GREEN | 8 | 8 | 0 | 0 | 0 |
| `plugins/pipeline-core/hooks/codex-session-start-hint.test.mjs` (SSH003 inside) | GREEN | 9 | 9 | 0 | 0 | 0 |
| `plugins/pipeline-core/hooks/guard-devplan.test.mjs` (custom: "86/86 cases passed") | GREEN | 86 | 86 | 0 | 0 | 0 |
| `plugins/pipeline-core/hooks/lifecycle-denial-loop-guard.test.mjs` | RED | 5 | 4 | 1 | 0 | 0 |
| `plugins/pipeline-core/hooks/guard-apply-patch.test.mjs` | RED | 28 observed (no summary line) | 26 | 2 | 0 | 0 |
| `plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs` | RED | 7 observed (no summary line) | 5 | 2 | 0 | 0 |

`guard-gate-strength.test.mjs` (also K8) is counted in the K4 table above.

Red details, each identical on the first run and on the lone re-run:

- `lifecycle-denial-loop-guard.test.mjs` (exit 1, about 10 s): the failing case is `RC04C001 actual guard retains exit2 and emits bounded alternate action on second exact returned refusal`; RC04C002 and RC04C003 pass.
- `guard-apply-patch.test.mjs` (exit 1, about 236 s, no node summary; TAP lines only): first `not ok` is `the lifecycle guard is invoked per patched path with an explicit codex runner even when CLAUDECODE=1 is present in its environment (regression pin for ready-gate-env-var-runner-authority, second production caller)`, assertion `runnerStart >= 0 && runnerEnd > runnerStart` raised at `runLifecycleWithObservedCaller` (test line 167). Second `not ok`: `a genuinely empty V3 onboarding root reaches the native Codex apply-patch chain and admits generated staging authoring before plan approval`, where the V3 onboarding result is `status: bootstrap-binding-required` (diagnostic `bootstrap_binding_required`) instead of the state the case expects. The file then ends with an uncaught assertion at test line 472. The 26 earlier cases are `ok`.
- `antigravity-pretool-guard.test.mjs` (exit 2, about 118 s, no node summary): first `not ok` is `Antigravity pretool guard rejects invalid JSON` (the guard answers `deny` with "failed internally; pipeline guards fail closed"); second is `Antigravity pretool guard blocks chained commands (&&, ;, pipes)`, an assertion on an onboarding result `status: bootstrap-binding-required` with nextAction `architecture-design-required` (code `ARCHITECTURE-DESIGN-PACKAGE-REQUIRED`). The process then dies with `code=adapter-uncaught name=AssertionError` at test line 406. The 5 earlier cases are `ok`.

The two whole-file failures in the K8 row (`guard-apply-patch` about 92 s, `antigravity-pretool-guard` about 43 s in the earlier measurement) are still whole-file failures on this HEAD; `guard-devplan` is no longer a whole-file failure (86/86).
