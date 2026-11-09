# w305 — The security scan shows what really ran, and the push names an unfilled threat model and a stale repository mode (candidate 22)

Delta on the candidate 22 chain (clone base 6fa9369d0). Closest accepted criterion: AC-108 (PRD and Spec unchanged). Built by a Goldfish in a clone that carries the chain; delivered as a held patch. STATE: code and tests for all three findings are green in the five suites below; the neighbouring suites listed under "Not proven" were mostly NOT run (tool budget).

## Why

Three findings of the Claude and Codex greenfield reports: CGR-10 (open half: a scan on the frozen candidate showed a report-only v2 verdict, plan source `catalog-unavailable`, and no visible semgrep rule path), CGR-18 / CGF-19 (the push threat model stayed the unchanged template and still passed), CGR-19 (`repositoryMode` is written once at onboarding and nothing read it, so a project that said `local-only` was pushed).

## What it changes (all under plugins/pipeline-core/)

1. CGR-10 rule provenance (`scripts/security-scan.mjs`, `lib/security-close-status.mjs`)
   - Measured why a normal greenfield lands on `catalog-unavailable`: `sourceCapabilityPlan()` reads `governance/security-controls/catalog.json` from the SCANNED project; that file exists only in the Pipeline's own repository and the plugin ships none (checked: one catalog.json in the tree, at the repo root). A consumer therefore always gets the empty plan. It is by design (the existing "fresh consumer" case in `security-scan.test.mjs` already pins it), not a defect, so it is labelled, not fixed: the v2 verdict's `plan` carries a new `sourceNote` and the CLI prints `v2 plan source: <source> -- <what it means>`. Shipping a catalog copy would change what the verdict means and is a separate decision.
   - Every scanner entry that was invoked now carries `ruleSet` `{source, ref, sha256, description, ruleIds?, ruleCount?}`, built from the config the adapter was handed (not re-derived): semgrep names the rule file (`plugin:security/semgrep/pipeline.yml` or the project rules path), its digest and the rule ids it lists; gitleaks names its config (plugin default or the repository config) and says it extends the built-in default set; osv-scanner says it uses the advisory database and has no rule file; license-check names the allowlist (project or plugin default). Plugin files are named `plugin:<path>`, so no machine path is recorded.
   - The scan output gets a "Rules that ran:" block (`formatRuleSetLines`), and the close summary lines (`formatSecurityCloseStatus`, used by the scan and the close check) append `[rules: ...]` for a scanner that passed or failed. A scanner that did not execute reads "no rules ran (scanner did not execute)". `formatScannerLine` is unchanged (a pinned exact string).
2. CGR-18 / CGF-19 threat model (`lib/push-threat-model-materialize.mjs` new, `lib/push-threat-model-gate.mjs`, `scripts/pipeline-state.mjs`, `scripts/push-prepare.mjs`, `scripts/push-init.mjs`)
   - `materialize-push-threat-model` writes the shipped template whole and first, then a "Project facts" block filled from the project (project name, stakes, repository mode, push approval gate, how the human clears it, destination namespace, branch, remote NAMES only, never URLs) and one "Project judgement" section with four questions behind one marker line. The agent's remaining work is the judgement; deleting the marker line is its statement that it is written.
   - The gate reports a file that still carries the marker, or still equals the shipped template (line endings aside), as `template-unchanged`: in the verdict (`templateState`, `notice`), in the `push-threat-model` check of the push-prepare report (`code: "template-unchanged"`, ok), in the report's new `notices` array, in the push-init result (`notices`, also on a refused preparation), in the `submit-plan` stderr and in the output of the materialize verb. It blocks only in the critical profile (stakes in the calibration, `isCriticalStakes`, the precedent of a scanner that did not execute): `PUSH-THREAT-MODEL-TEMPLATE-UNCHANGED`, with a repair that does not offer the verb that refuses while a file exists. With no active push approval it is a notice in every profile.
3. CGR-19 repository mode (`scripts/push-prepare.mjs`, `scripts/repository-freshness.mjs`, `scripts/push-init.mjs`)
   - `declaredRepositoryMode` (the one reader, now exported) is compared at push preparation with the real target: calibrated `local-only` and the remote named in `--remote` exists in this repository gives one notice, `PUSH-REPOSITORY-MODE-MISMATCH`, in `report.notices` and in the push-init result. It names the value to set (`remote-tracked`), the file (and the byte-equal mirror when both exist), and the route. Advice only: `ready` does not move, nothing is written, nothing is refused; any other mode, an absent mode or a remote the repository does not have gives no notice.
   - MEASURED, open item: there is NO sanctioned writer (no verb) for `repositoryMode` after onboarding. The calibration is gate-strength protected, so the notice names the guard override route (`guard-human-override.mjs plan`) and that the change is a commit that belongs before the candidate is fixed. A dedicated verb would need a row in `lib/guard/sanctioned-args-scripts.mjs` (a guard surface, outside this briefing).

## Tests (test-first: written first, RED on the original code, then GREEN)

- `scripts/security-scan.test.mjs`: new block (rule provenance per scanner, printed lines, close lines, plan source note). RED: 6 FAIL lines and `formatRuleSetLines is not a function`. GREEN: suite passes.
- `scripts/register-feature-package-readback.test.mjs`: PTG8 to PTG10 (unchanged template named and CRLF, critical refusal, materialised facts and marker). RED: suite did not load (missing module). GREEN: 13 tests, 13 pass.
- `scripts/push-prepare.test.mjs`: CGR-19 and CGF-19 cases. RED: 2 fail. GREEN: 99 tests, 99 pass.
- `scripts/push-init.test.mjs`: notices carried. RED not run separately (the field did not exist). GREEN: 45 tests, 45 pass.
- `scripts/pipeline-state.test.mjs`: one block (the verb fills the facts, keeps the template first, names template-unchanged). GREEN: 1 test, 1 pass (script-style suite).
- Nothing restated, nothing weakened. One assertion in the security block compares the printed semgrep line with the evidence ref and is labelled "agrees with the v2 rule pack ref"; it does not read the v2 ref (that ref stays `semgrep:plugin-default`, a pinned string), so the label overstates it.

## Deliberately not changed

- `close-coordinator.mjs`, `finish-feature.mjs` and the other files other dispatches own. The coordinator calls the shared verdict, so a critical project is refused there automatically, but outside the critical profile it shows no notice (it prints only refusals).
- The v2 `rulePack.ref` (`semgrep:plugin-default` etc.) and `digest: null`, `formatScannerLine`, the control catalog and the order of scan and close; no catalog copy is shipped.
- `driveCheckpointPushInit` (its own checks, no prepare report): no notices there.
- Every guard hook, the Critic preimage files, PRD and Spec.

## Not proven

- Neighbouring suites run GREEN one at a time after the change: `security-completeness-gate` (11), `check-close-security-completeness` (1), `pins/security-scanner-failure-provenance` (13), `security-scan-v2-integration` (9), `security-evidence-v1-migration-fixture` (2), `push-gate-satisfiability` (36), `repository-freshness` (1), `close-path-e2e` (1), `close-coordinator` (54).
- NOT run: `security-scanner-diagnostics.test.mjs`, `project-onboarding-v3.test.mjs` (materialises the model, very large), `push-release-flow-docs-contract.test.mjs`, the `guard-push*` suites (they read the threat-model file). A fixture with critical stakes that materialises the model and expects a pass would now see `template-unchanged`; that needs a restated fixture with a comment (QG-04).
- No live scan with the real scanner binaries, no real greenfield push, no Windows run (paths use `path.sep` normalisation and CRLF is normalised in the detector, but only POSIX ran).
- No Full Verify, no Critic review (batch gates, not this item's).
