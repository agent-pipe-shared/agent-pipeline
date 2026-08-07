# Unregistered test suites in the verify gate — measurement and classification

- Task: `PHX-SUITE-CLASSIFY` (goldfish, measurement only — no tracked source or test file was edited)
- Measured at commit `0ffe37c37f68e7522dd4a2b2ae14d27429acac3a`, 2026-08-08
- Machine artifact (authoritative for every count here): `.git/phx-suite-classify/unregistered-suite-classification.json`
  (inputs: `.git/phx-suite-classify/classification.json`, `.git/phx-suite-classify/run-results.json`)
- Run command per file: `node --test <file>`, sequential, 120 s per-file timeout, `cwd` = repo root

## Headline

| figure | value |
| --- | --- |
| tracked `*.test.mjs` under `plugins/pipeline-core/` + `harness/` | **350** |
| registered `*.test.mjs` entries in `harness/scripts/verify.mjs` (all three arrays, `file:` expressions resolved) | **242** |
| **unregistered** | **109** |
| category (a) genuine, runnable suites | **109** |
| category (b) fixture/generator/helper (not a gate suite) | **0** |
| category (c) unclear | **0** |
| ran | **109 of 109** — none unrunnable, none skipped |
| green (exit 0) | **102** |
| red (non-zero exit) | **7** |
| hit the 120 s timeout | **0** |

Every one of the 109 was executed; there is no "could not run" bucket. 6.4 % of
category (a) is red, well under the one-third threshold that would have changed
the recommendation.

## Recommendation

**Register the 102 green suites in batches; file the 7 red ones as defects and
leave them out of the gate until each is decided.** The green set costs roughly
17 s of wall clock in total (sum of the per-file durations below), so the gate's
runtime is not an argument against registering them.

Three of the seven red suites fail with `SyntaxError: … does not provide an export
named …` — they were written against a module surface that does not exist in this
tree. Those are not "flaky", they are dead-on-arrival and want an owner decision
(implement the missing export, or delete the suite), not a registration line.

## The Elephant's 108 vs. the true 109

The backlog item's 108 is a basename match against the raw text of
`harness/scripts/verify.mjs`. Re-derived by resolving each registration array's
`file:` expression (`join(libDir, "x.test.mjs")` and string-literal forms) to a
repo-relative path, the figure is **109** — one more, not fewer. The single
difference is a false positive of the basename method:

- `harness/scripts/security-readiness/security-readiness.test.mjs` — its basename
  collides with the registered `plugins/pipeline-core/lib/security-readiness.test.mjs`,
  so the text match counted it as registered. It is not.

No suite went the other way (nothing that the basename method called unregistered
is in fact registered). Two `file:` expressions could not be resolved statically —
both are the identical `join(repoRoot, suite.file)` mapping lines that expand the
`SCOPED_VERIFY_SUITES` / `WINDOWS_ASSURANCE_VERIFY_SUITES` arrays, whose members
are string literals already resolved; they add no unaccounted registration. One
registered entry, `setup.test.mjs`, lives at the repo root and is therefore outside
the enumerated scope, not missing.

So: the backlog item's number is essentially right, and its caveat ("upper bound
until each is classified") turns out to have been unnecessary caution in one
direction and one file short in the other. **The classification does not shrink the
set: none of the 109 is a fixture or a generator.**

## Classification criterion (stated once, applied uniformly)

This repository uses two suite styles, and a framework-based criterion would have
mislabelled half the corpus. The criterion is therefore behavioural:

- **(a) suite** — the file self-checks, i.e. it either imports `node:test`, or it
  contains an assertion mechanism (`node:assert` import, `assert.`, `t.assert`,
  `expect(`) or an explicit failure-counting `process.exit`. Both styles are
  `node <file>`-runnable and fail the process on a violated expectation, which is
  exactly what the gate needs.
- **(b) non-suite** — no assertion mechanism and no failing exit at all (a fixture,
  generator, helper or data module that cannot fail), or the file declares itself a
  fixture in its header.
- **(c) unclear** — neither rule settles it.

Applied to the 109: 63 are `node:test` style, 46 are hand-rolled self-checking
scripts (the `check(name, fn)` / `let pass = 0; failures.push(...)` shape, e.g.
`plugins/pipeline-core/lib/publication-bundle.test.mjs`,
`plugins/pipeline-core/lib/ruleset-source.test.mjs`). Nothing landed in (b) or (c).

**Counting caveat, stated with the counts and not in a footnote:** for hand-rolled
files `node --test` treats the whole file as a single test, so its `# pass` / `# fail`
lines are not per-assertion counts. The **exit code is the authoritative signal**
throughout this report; the per-file table therefore reports exit status and
duration rather than assertion counts. The raw counters are in the JSON artifact
where they exist.

## Clusters wholly absent from the gate

| cluster | files | green | red |
| --- | --- | --- | --- |
| other | 41 | 38 | 3 |
| `governance-*` (event, store, projection, replay, export, outbox, delivery, authority resolver, human-governance ledger) | 18 | 18 | 0 |
| `publication-*` / `provenance-*` | 8 | 8 | 0 |
| policy / audit (`organization-policy`, `change-control`, `audit-bundle`, `control-catalog-migration`) | 8 | 8 | 0 |
| `afk-*` | 7 | 6 | 1 |
| `codex-*critic*` isolation | 7 | 6 | 1 |
| security adapters + scan v2 (`gitleaks`, `license-check`, `osv-scanner`, `semgrep`, `security-readiness`, `security-scan-v2-integration`) | 6 | 6 | 0 |
| guards / human authorization (`guard-human-override`, `po-human-approval`, `critical-human-proof-gate`, `guard-git-phoenix`) | 4 | 3 | 1 |
| reference catalog | 4 | 4 | 0 |
| `codex-*` (other) | 3 | 2 | 1 |
| evidence view | 3 | 3 | 0 |

Plainly: **the entire `governance-*` subsystem (18 files, all green), the entire
security-adapter set (6 files, all green), the whole `publication-*`/`provenance-*`
family (8 files, all green) and the whole policy/audit family (8 files, all green)
are absent from the gate and would go in today without turning it red.** The
human-authorization surface is 3-of-4 green, with `guard-git-phoenix` the exception.

## Observation worth more than a pass/fail

`plugins/pipeline-core/lib/windows-assurance-verify-registration.test.mjs` is red on
exactly one of its 24 checks: **WAVR19, "Verify fails before ordinary suites with a
named Windows-assurance registration step."** That is a suite asserting a property of
`harness/scripts/verify.mjs` itself, and it is both unregistered and failing — i.e.
the gate is not currently observing the ordering guarantee that this suite exists to
pin. That is a finding for the PO, not a registration candidate, and it is recorded
here without being acted on.

## Working-tree mutation watch

The working tree was compared against a baseline after every single run. One
tracked-file change was observed during the run window: `harness/scripts/verify.mjs`
appeared staged while `plugins/pipeline-core/lib/security-completeness-gate.test.mjs`
was executing. **It was not caused by that suite** — the suite writes only into a
`mkdtemp` directory, and the change corresponds to commit `0ffe37c` ("register the
gate-strength origin-attestation suite in the verify gate") landed by a parallel
dispatch in the same checkout. Recorded for completeness because the observation is
real; attributed correctly because the attribution is checkable. **No suite in the
set was observed mutating a tracked file.**

## Per-file results

The tables below are generated from the JSON artifact
(`.git/phx-suite-classify/report-body.md` is the machine-written source).

### Green — runnable and passing today (102)

| suite | cluster | style | ms |
| --- | --- | --- | --- |
| `harness/scripts/codex-sandbox-preflight-host-control.test.mjs` | codex-* (other) | node:test | 2136 |
| `harness/scripts/network-lockdown.test.mjs` | other | hand-rolled | 175 |
| `harness/scripts/pipeline-state-external-push-ledger.test.mjs` | other | hand-rolled | 252 |
| `harness/scripts/publication-state-authority.test.mjs` | publication-*/provenance-* | hand-rolled | 399 |
| `harness/scripts/security-adapters/gitleaks.test.mjs` | security-adapters/scan | node:test | 172 |
| `harness/scripts/security-adapters/license-check.test.mjs` | security-adapters/scan | node:test | 64 |
| `harness/scripts/security-adapters/osv-scanner.test.mjs` | security-adapters/scan | node:test | 68 |
| `harness/scripts/security-adapters/semgrep.test.mjs` | security-adapters/scan | node:test | 72 |
| `harness/scripts/security-readiness/security-readiness.test.mjs` | security-adapters/scan | hand-rolled | 66 |
| `harness/scripts/security-scan-v2-integration.test.mjs` | security-adapters/scan | node:test | 1455 |
| `plugins/pipeline-core/lib/afk-assumption-mode.test.mjs` | afk-* | node:test | 84 |
| `plugins/pipeline-core/lib/afk-capability-worker.test.mjs` | afk-* | node:test | 78 |
| `plugins/pipeline-core/lib/afk-git-adapter.test.mjs` | afk-* | node:test | 490 |
| `plugins/pipeline-core/lib/afk-review.test.mjs` | afk-* | node:test | 339 |
| `plugins/pipeline-core/lib/afk-transaction-host.test.mjs` | afk-* | node:test | 338 |
| `plugins/pipeline-core/lib/agent-decision-journal.test.mjs` | other | node:test | 67 |
| `plugins/pipeline-core/lib/async-execution.test.mjs` | other | hand-rolled | 62 |
| `plugins/pipeline-core/lib/audit-bundle.test.mjs` | policy / audit | node:test | 95 |
| `plugins/pipeline-core/lib/authority-revision-proof.test.mjs` | other | node:test | 66 |
| `plugins/pipeline-core/lib/change-control.test.mjs` | policy / audit | node:test | 67 |
| `plugins/pipeline-core/lib/control-catalog-migration.test.mjs` | policy / audit | hand-rolled | 50 |
| `plugins/pipeline-core/lib/credential-lease.test.mjs` | other | hand-rolled | 55 |
| `plugins/pipeline-core/lib/critical-action-approval-request.test.mjs` | other | hand-rolled | 57 |
| `plugins/pipeline-core/lib/evidence-view-model.test.mjs` | evidence-view | node:test | 79 |
| `plugins/pipeline-core/lib/evidence-view-renderer.test.mjs` | evidence-view | node:test | 66 |
| `plugins/pipeline-core/lib/external-command-offer.test.mjs` | other | node:test | 64 |
| `plugins/pipeline-core/lib/external-reference-adapter.test.mjs` | reference-catalog | node:test | 80 |
| `plugins/pipeline-core/lib/forge-capability.test.mjs` | other | hand-rolled | 65 |
| `plugins/pipeline-core/lib/gate-estimate.test.mjs` | other | hand-rolled | 55 |
| `plugins/pipeline-core/lib/governance-authority-resolver.test.mjs` | governance-* | node:test | 80 |
| `plugins/pipeline-core/lib/governance-event-projection.test.mjs` | governance-* | node:test | 67 |
| `plugins/pipeline-core/lib/governance-event-store.test.mjs` | governance-* | node:test | 702 |
| `plugins/pipeline-core/lib/governance-event.test.mjs` | governance-* | node:test | 77 |
| `plugins/pipeline-core/lib/governance-export-adapter.test.mjs` | governance-* | node:test | 68 |
| `plugins/pipeline-core/lib/governance-export-delivery.test.mjs` | governance-* | node:test | 75 |
| `plugins/pipeline-core/lib/governance-export-outbox-store.test.mjs` | governance-* | node:test | 71 |
| `plugins/pipeline-core/lib/governance-export-outbox.test.mjs` | governance-* | node:test | 66 |
| `plugins/pipeline-core/lib/governance-replay-view.test.mjs` | governance-* | node:test | 65 |
| `plugins/pipeline-core/lib/governance-replay.test.mjs` | governance-* | node:test | 63 |
| `plugins/pipeline-core/lib/human-governance-ledger.test.mjs` | governance-* | node:test | 182 |
| `plugins/pipeline-core/lib/lifecycle-governance-events.test.mjs` | governance-* | node:test | 68 |
| `plugins/pipeline-core/lib/local-worker-pool.test.mjs` | other | hand-rolled | 61 |
| `plugins/pipeline-core/lib/organization-policy-activation.test.mjs` | policy / audit | node:test | 70 |
| `plugins/pipeline-core/lib/organization-policy.test.mjs` | policy / audit | node:test | 70 |
| `plugins/pipeline-core/lib/plan-spec-state-v2.test.mjs` | other | node:test | 86 |
| `plugins/pipeline-core/lib/provenance-release-binding.test.mjs` | publication-*/provenance-* | hand-rolled | 63 |
| `plugins/pipeline-core/lib/publication-authority.test.mjs` | publication-*/provenance-* | hand-rolled | 73 |
| `plugins/pipeline-core/lib/publication-bundle-v2.test.mjs` | publication-*/provenance-* | hand-rolled | 64 |
| `plugins/pipeline-core/lib/publication-bundle.test.mjs` | publication-*/provenance-* | hand-rolled | 62 |
| `plugins/pipeline-core/lib/publication-capability-preflight.test.mjs` | publication-*/provenance-* | hand-rolled | 58 |
| `plugins/pipeline-core/lib/reference-catalog-views.test.mjs` | reference-catalog | node:test | 74 |
| `plugins/pipeline-core/lib/reference-catalog.test.mjs` | reference-catalog | node:test | 71 |
| `plugins/pipeline-core/lib/remote-provisional-receipt.test.mjs` | other | hand-rolled | 53 |
| `plugins/pipeline-core/lib/ruleset-source.test.mjs` | other | hand-rolled | 54 |
| `plugins/pipeline-core/lib/security-capability-plan-builder.test.mjs` | other | node:test | 78 |
| `plugins/pipeline-core/lib/security-completeness-gate.test.mjs` | other | node:test | 72 |
| `plugins/pipeline-core/lib/security-evidence-v1-migration-fixture.test.mjs` | other | node:test | 60 |
| `plugins/pipeline-core/lib/source-observation.test.mjs` | other | hand-rolled | 53 |
| `plugins/pipeline-core/lib/stack-capability-plan.test.mjs` | other | hand-rolled | 56 |
| `plugins/pipeline-core/scripts/afk-claude-host.test.mjs` | afk-* | node:test | 77 |
| `plugins/pipeline-core/scripts/ai-assisted-hardening-gate.test.mjs` | other | node:test | 67 |
| `plugins/pipeline-core/scripts/antigravity-alpha-adapter.test.mjs` | other | hand-rolled | 51 |
| `plugins/pipeline-core/scripts/audit-bundle.test.mjs` | policy / audit | node:test | 67 |
| `plugins/pipeline-core/scripts/change-control.test.mjs` | policy / audit | node:test | 71 |
| `plugins/pipeline-core/scripts/check-close-security-completeness.test.mjs` | other | hand-rolled | 173 |
| `plugins/pipeline-core/scripts/check-completeness-vocabulary-doclint.test.mjs` | other | hand-rolled | 56 |
| `plugins/pipeline-core/scripts/check-release-state-consistency.test.mjs` | other | hand-rolled | 77 |
| `plugins/pipeline-core/scripts/codex-critic-packet-host.test.mjs` | codex-*critic* isolation | hand-rolled | 600 |
| `plugins/pipeline-core/scripts/codex-critic-probe-split.test.mjs` | codex-*critic* isolation | hand-rolled | 154 |
| `plugins/pipeline-core/scripts/codex-critic-shadow.test.mjs` | codex-*critic* isolation | node:test | 70 |
| `plugins/pipeline-core/scripts/codex-isolated-critic-claims.test.mjs` | codex-*critic* isolation | hand-rolled | 53 |
| `plugins/pipeline-core/scripts/codex-isolation-control-decomposition.test.mjs` | codex-* (other) | hand-rolled | 542 |
| `plugins/pipeline-core/scripts/critic-route-activation.test.mjs` | other | node:test | 74 |
| `plugins/pipeline-core/scripts/critic-t1-po-override.test.mjs` | other | node:test | 70 |
| `plugins/pipeline-core/scripts/critical-human-proof-gate.test.mjs` | guards / human authorization | hand-rolled | 128 |
| `plugins/pipeline-core/scripts/evidence-viewer.test.mjs` | evidence-view | node:test | 77 |
| `plugins/pipeline-core/scripts/external-reference.test.mjs` | reference-catalog | node:test | 80 |
| `plugins/pipeline-core/scripts/governance-authority.test.mjs` | governance-* | node:test | 297 |
| `plugins/pipeline-core/scripts/governance-event.test.mjs` | governance-* | node:test | 204 |
| `plugins/pipeline-core/scripts/governance-export.test.mjs` | governance-* | node:test | 65 |
| `plugins/pipeline-core/scripts/governance-replay-viewer.test.mjs` | governance-* | node:test | 72 |
| `plugins/pipeline-core/scripts/governance-replay.test.mjs` | governance-* | node:test | 68 |
| `plugins/pipeline-core/scripts/guard-human-override.test.mjs` | guards / human authorization | node:test | 354 |
| `plugins/pipeline-core/scripts/live-runner-certification.test.mjs` | other | hand-rolled | 62 |
| `plugins/pipeline-core/scripts/native-plugin-readback.test.mjs` | other | hand-rolled | 63 |
| `plugins/pipeline-core/scripts/neutral-range-plan.test.mjs` | other | hand-rolled | 326 |
| `plugins/pipeline-core/scripts/organization-policy.test.mjs` | policy / audit | node:test | 64 |
| `plugins/pipeline-core/scripts/phoenix-governance-threat-model.test.mjs` | governance-* | node:test | 60 |
| `plugins/pipeline-core/scripts/pipeline-state-reopen-design.test.mjs` | other | node:test | 108 |
| `plugins/pipeline-core/scripts/po-guarded-push.test.mjs` | other | hand-rolled | 50 |
| `plugins/pipeline-core/scripts/po-human-approval.test.mjs` | guards / human authorization | node:test | 106 |
| `plugins/pipeline-core/scripts/public-baseline-diagnose.test.mjs` | other | hand-rolled | 171 |
| `plugins/pipeline-core/scripts/publication-close-journal.test.mjs` | publication-*/provenance-* | hand-rolled | 72 |
| `plugins/pipeline-core/scripts/publication-executor-v2.test.mjs` | publication-*/provenance-* | hand-rolled | 1573 |
| `plugins/pipeline-core/scripts/ruleset-update-policy.test.mjs` | other | node:test | 65 |
| `plugins/pipeline-core/scripts/run-codex-critic-isolation.test.mjs` | codex-*critic* isolation | hand-rolled | 60 |
| `plugins/pipeline-core/scripts/run-codex-critic-probe-split.test.mjs` | codex-*critic* isolation | hand-rolled | 61 |
| `plugins/pipeline-core/scripts/run-codex-isolation-control-decomposition.test.mjs` | other | hand-rolled | 57 |
| `plugins/pipeline-core/scripts/runner-contracts.schema.test.mjs` | other | hand-rolled | 57 |
| `plugins/pipeline-core/scripts/verify-topology-preflight.test.mjs` | other | hand-rolled | 59 |
| `plugins/pipeline-core/scripts/worktree-target-binding.test.mjs` | other | hand-rolled | 308 |
| `plugins/pipeline-core/skills/critic-review/critic-review-scope.test.mjs` | other | node:test | 61 |

### Red — failing when run standalone (7)

- `harness/lib/plan-spec-state-v2.test.mjs` — exit 1
  - first failure: `SyntaxError: The requested module './plan-spec-state-v2.mjs' does not provide an export named 'bindPlanSpecApprovalWithHumanDecision'`
- `harness/scripts/recovery-bridge-approval.test.mjs` — exit 1
  - first failure: `SyntaxError: The requested module './pipeline-state.mjs' does not provide an export named 'RECOVERY_BRIDGE_DECISION_SCHEMA'`
- `plugins/pipeline-core/lib/codex-host-plugin-list.test.mjs` — exit 1
  - first failure: `SyntaxError: The requested module './codex-host-plugin-list.mjs' does not provide an export named 'observeCodexRulesetSource'`
- `plugins/pipeline-core/hooks/guard-git-phoenix.test.mjs` — exit 1
  - first failure: `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 1 !== 2`
- `plugins/pipeline-core/scripts/afk-activation.test.mjs` — exit 1
  - first failure: `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: false !== true`
- `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` — exit 1
  - first failure: `AssertionError [ERR_ASSERTION]: harness/review-protocol.md` (+ actual − expected)
- `plugins/pipeline-core/lib/windows-assurance-verify-registration.test.mjs` — exit 1
  - 23 of its 24 checks pass; the single failure is `FAIL WAVR19 Verify fails before
    ordinary suites with a named Windows-assurance registration step` (this file
    prints its own report, so the failure text is the check name, not an assert message)

### Timeouts

None. No file reached the 120 s per-file limit.

### Category (b) / (c) — non-suites excluded from the run

None. Every unregistered `*.test.mjs` under the two roots is a self-checking,
`node`-runnable suite by the criterion above, so no file was excluded on
fixture/generator/helper grounds.
