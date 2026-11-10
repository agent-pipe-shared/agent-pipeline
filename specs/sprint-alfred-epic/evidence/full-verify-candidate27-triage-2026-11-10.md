# Full Verify of candidate 27: triage (2026-11-10)

Subject: commit `329ac8327`, clean clone outside the repository, candidate mode without receipt reuse. Result: **red**, exit 1, 1208 steps, 48 red, 1957 s. Greenfield runs loaded the machine during the run.

Every red step has a cause below, read from its red excerpt. A plain `node --test` of the red files says nothing about group 1, because the case-completion declaration is checked only by Verify.

## 1. Case list of the registry behind the test file: 17 steps, tests green

`VERIFY-CASE-COMPLETION-DECLARATION` (`lib/verify-case-completion-receipt.mjs`): the case ids a suite declares at run time differ from `caseIds` in `harness/verify-suites.json`. Every case of these suites passed.

`agy-host-commit-admission-tests`, `codex-critic-host-tests`, `critic-course-admission-tests`, `critic-dispatch-preflight-tests`, `devplan-shell-sanctioned-recovery-tests`, `dispatch-record-write-tests`, `g23-read-help-tests`, `guard-dispatch-native-worker-tests`, `guard-dispatch-tests`, `model-role-session-tests`, `native-goldfish-host-finalizer-tests`, `native-goldfish-host-return-tests`, `native-goldfish-host-state-tests`, `post-compact-reground-tests`, `runner-profile-migration-v3-tests`, `toolchain-preflight-tests`, `windows-authority-readiness-tests`.

Precedent for the repair: commits `94b8b9ff4` and `13ad46987`.

## 2. Registry and generated files: 9 steps

| Step | Cause |
|---|---|
| `verify-case-completion-registry-tests` | VCR01, registry counts behind, same root as group 1 |
| `verify-suite-append-history-check` | `VSA-PRIOR-ENTRY-CHANGED` at `4c37267c1`, which extended one suite's case list. Fixable forward: `harness/verify-suite-history-recovery.json` has a `rewrites` kind for case-list extensions. Later commits may need entries too, so iterate |
| `obligations-contract-tests` | AC-2, `templates/prompts/agent-obligations.md` stale |
| `pin-agent-obligations-says-no-and-and-while-the-guard-admits-six-segments-tests` | AP7, canonical and vendored document stale |
| `control-placement-tests` | hook `publication-readback-stop` missing from the table |
| `guard-maintenance-window-kernel-closure-tests` | `lib/observation-governance-bootstrap.mjs`, `lib/critic-round-pass.mjs` not in `NEVER_LIFTABLE_KERNEL_PATHS` |
| `license-contract-check` | `lib/critic-round-pass.mjs` and its test lack the SPDX header |
| `consumer-safe-paths-tests` | a comment in `security-adapters/gitleaks.mjs:166` names `harness/` |
| `product-capability-inventory-tests` | PCI24 and PCI30 |

## 3. Backlog: 3 steps

`backlog-state-check`, `deferred-backlog-check`, `check-backlog-state-tests` (CBS16): four items of 2026-11-10 have a `source` value the checker refuses (not plain text or a JSON string), and `backlog-state-check` also reports ledger event 2480 naming no current item. The other drift lines are known and accepted.

## 4. Minor-only pass against older fixtures: 3 steps, 7 cases

`pin-close-coordinator-refuses-a-required-critic-without-evidence-tests` (four cases), `pin-critic-course-consumer-chain-walk-tests` (two), `verify-evidence-producer-tests` (N22). The fixtures build a failed all-minor round. `criticRoundPassed` (candidate 25, PO decision) counts that as passed, so `reviewPass` is true. Tests are stale, the route is not dead: a residual acceptance remains reachable for a round failed by a named major, and a minor list for receipts written before the rule, a partial review or an inconsistent trajectory. The fixtures need one of those shapes.

## 5. Guard grammar and texts moved: 7 steps

`guard-no-route-denials-seed-no-override-request-tests` (NRS01, `rg -A3` is admitted now), `read-command-diagnosis-tests` (RCD14), `pin-guard-push-refuses-a-read-only-git-grep-no-index-as-ambiguous-push-target-tests`, `powershell-bash-guard-parity-tests` (two cases, `--help` and verbs), `continuity-result-bootstrap-tests` (N31r), `d3-signed-reconcile-commit-tests` (G20-66), `critic-route-v3-tests` (RC07C003, RC07C004).

## 6. Tests extracting source: 3 steps

`native-platform-process-observer-tests` (NPO004, `windowsSameArgvPath is not defined`), `pin-windows-requester-ancestors-above-repository-are-human-controlled-tests` (case B), `pin-outside-root-read-label-skips-option-value-file-tokens-tests` (mirror, `Unexpected token 'export'`). A helper moved or gained an export.

## 7. Antigravity restart after git init: 3 steps

`project-onboarding-e2e-tests`, `pin-greenfield-approval-policy-applies-after-intake-transition-tests`, `pin-unasked-advisor-export-consent-in-fresh-seed-tests`. The driver now returns `runner-restart-required` for Antigravity when onboarding created the repository, and the tests expect the first question round. Intended behaviour, the tests are stale. Only the Antigravity variant is affected.

## 8. Other: 3 steps

- `install-agy-tests` (G6, two cases): `ATR-UNAVAILABLE` from the refresh, cause not yet read.
- `native-goldfish-host-stop-pair-tests`: NGSP7 in the Verify run and NGSP1 in a re-run, plus group 1. A different case failing per run points to load, unproven.
- `security-scan`: `remote-ambiguous`. The clone has `origin` and `upstream`; `resolveSecurityRemoteIdentity` needs exactly one remote when none is named, and neither Verify nor Close passes `--remote`. In this clone an environment effect, but **any project with two remotes hits the same refusal at Verify and Close**, a product gap since `537d5c85d`.

## What a green run means

One run record with exit 0. Groups 1 to 8 need changes, so that record will be on a later commit than `329ac8327`, in a candidate 28 chain applied by the PO.
