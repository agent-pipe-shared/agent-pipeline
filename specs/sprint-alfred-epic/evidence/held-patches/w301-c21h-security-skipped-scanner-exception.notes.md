# w301 — in a critical project a skipped scanner blocks the close unless a named, expiring exception was recorded (candidate 21h, CGF-05)

Delta on the candidate 21h chain (clone base ac727af4d). Closest accepted criterion: AC-108 (PRD and Spec unchanged). Built by a Goldfish in a clone that carries the chain; delivered as a held patch.

## Why

PO decision 2026-11-09 on finding CGF-05 of the Codex greenfield report: in the critical profile a `skipped` scanner blocks the close unless a named exception was recorded beforehand; `not applicable` stays allowed with a reason; every other profile stays unchanged. Two gaps were measured at the base:

- Gap 1: `deriveReportStatus` labels every skipped `license-check` `not-configured`, which `securityScannerState` read as `not applicable`, so a skipped licence check passed a critical close with no stated reason. A second, unseen part of the same gap: `license-check` is a control, so the v2 envelope never lists it (only capability-kind scanners); the scan records it in the verdict document's `controls`. The completeness gate walked only `envelope.capabilities`, so changing the label alone would not have reached the gate.
- Gap 2: no named-exception route existed.

## What it changes (all under plugins/pipeline-core/)

- `lib/security-close-status.mjs`: `securityScannerState(entry, {critical})` reads `not-configured` as `not executed` when critical (the persisted `reportStatus` label is untouched, osv-scanner "no package sources" stays `not applicable`); new `parseScannerExceptions` / `readScannerExceptions` for `project/security-scanner-exceptions.json` (schema `pipeline.security-scanner-exceptions.v1`, key `exceptions` holding entries `scanner` (one of SECURITY_ELEMENTS), `reason` (non-blank, at most 500 characters), `expires` (ISO-8601, in the future), `confirmedBy` (non-blank)); `securityCloseElements` / `elementsOfCompletedScan` take `{critical, exceptions}`; an excepted element keeps the state `not executed` (the four-state vocabulary is unchanged) and carries `exception`, which `formatSecurityCloseStatus` prints as `[named exception: <reason>; expires <date>; confirmed by <label>]`; `unexcusedNotExecuted` is the one filter the readers use; `scannerNotExecutedRefusal` now names both ways out (install or configure, or this exact file and shape, committed before the candidate is frozen) and lists every ignored entry with its reason.
- `lib/security-completeness-gate.mjs`: the critical loop also walks the verdict document's `controls` (so a skipped license-check blocks), skips a scanner that has a valid exception, and applies the same exception to the plan-required verdict line for that capability (the same refusal for the same scanner); a scanner that ran (`failed`) is never covered; non-critical calibrations never read the file.
- `scripts/check-close-security-completeness.mjs`, `scripts/security-close-check.mjs` (Verify), `scripts/security-scan.mjs` (status lines and `deriveSummaryVerdict(evidence, {critical})`: a skipped license-check is not resolved in a critical project), `lib/close-quality-readback.mjs` (reads stakes and the exception file through its injected `readBytes`): every reader of the element state and of SEC-CLOSE-SCANNER-NOT-EXECUTED now uses the same reading. The close prints `ADMITTED BY NAMED EXCEPTION`, never `GREEN`, when excepted scanners are the only ones that did not run.
- `skills/close-feature/SKILL.md`: one paragraph beside the scanner ignore routes names the exception file and shape.
- Tests: cases C13-C19 (C14b included) added at the end of `lib/pins/security-close-chain-is-hard-per-calibration.test.mjs`; one case restated in place (below).

## Deliberately not changed

- `reportStatus` (persisted evidence label) and `SECURITY_STATES`: unchanged; the exception is a field and a printed marker, not a fifth state.
- The guardrail text in `guardrails/security.md` and `docs/operating-model.md` (the plugin copies mirror root files outside this patch's reach): they still describe the rule without the exception route; the SKILL paragraph carries it. A doc sync is a follow-up for the coordinator.
- No signature, no new human terminal step; the strength matches the per-finding ignore (reason, expiry, listed in the close evidence, confirmed in chat).
- Standard, absent and unrecognised calibrations: the exception file is not read and every reading is as before.
- The exception does not stop the scan itself or move the candidate; it is read from the working tree at evaluation time.

## QG-04 restatement (one existing case)

`lib/pins/semgrep-console-coverage-note-has-no-test.test.mjs`, P4: its regex anchored on the exact signature `function printSummary(evidence) {`. `printSummary` gained two optional parameters, so the anchor now allows optional extra parameters; the assertion on the scanner-line loop is unchanged. Restated in place with a comment.

## Test-first record and checks

- RED against the clone base (before the first production edit): `security-close-chain-is-hard-per-calibration.test.mjs` 22 tests, 13 pass, 9 fail (C13, C13b, C14, C14b, C15, C16, C17, C18, C19).
- GREEN, one suite at a time in the clone (`test-in.mjs`): security-close-chain-is-hard-per-calibration 22/22; security-completeness-gate 11/11; close-quality-readback 11/11; security-scan 1/1; semgrep-console-coverage-note 7/7; check-close-security-completeness 1/1; security-scan-v2-integration 9/9; security-scanner-failure-provenance 13/13; release-version-plan 1/1; guard-push-v2 1/1; close-feature-names-reconcile-order-and-close-evidence 5/5; critic-round-cap-and-delta-scope 12/12; generate-elephant-role-prohibitions 13/13; greenfield-machine-output-and-skill-budget 15/15. w301 check test 2/2.
- Case changes after step 1, with the criterion tie: (1) C16 first matched a capability id in the refusal; the old fixture (also used by the existing C4) yields a verdict "not consistent" line, so the case now asserts that the failure list is identical with and without the exception (the exception changes nothing for a scanner that ran). (2) C17's scan list first held only two scanners, so osv-scanner and semgrep read "not executed" for lack of evidence; the fixture now lists all four enabled scanners as a real scan does. Neither change weakens a criterion; both were fixture defects.
- Journey coverage (AC-108): close gate, close.pre entry point, Verify check, scan status lines and quality readback each asserted for critical-skipped (refused, both ways out named), critical-with-valid-exception (admitted, shown, not GREEN), invalid entries (ignored, named), findings (never covered), standard (unchanged): covered.

## Not proven

- That the exception file was committed BEFORE the candidate: the gate never runs a version-control command, so this patch reads the file from the working tree and states the rule in the refusal and the SKILL text only.
- No new suite file, so no registration; a live critical-project close with a real skipped license-check was not run (fixtures inject the scan evidence).
- No Full Verify, no Critic review (batch gates, not this item's).
