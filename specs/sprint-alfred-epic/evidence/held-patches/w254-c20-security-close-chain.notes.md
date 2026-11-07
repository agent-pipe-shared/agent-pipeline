# w254: the security close chain is hard per calibration and never reads like a passed scan (candidate 20, G20-25, AC-108)

Base: `a3e14b638` (the candidate-20 chain). Built in the slice clone `scratch/agent-out/s-sec`. One held patch. Closest criterion: AC-108
(PRD and Spec unchanged).

## What

- New `lib/security-close-status.mjs`: the four-state vocabulary (`passed`, `failed`, `not executed`, `not applicable`), the calibration rule
  and the typed refusal. `deriveReportStatus` moved here from `security-scan.mjs` (one mapping for the scan and the close chain).
- `lib/security-completeness-gate.mjs` (`checkSecurityCompleteness`, the one evaluator that push, close, the pre-push hook and the clean
  candidate run all call): when the project calibration is critical, every scanner of the envelope that did not execute is a failure
  `SEC-CLOSE-SCANNER-NOT-EXECUTED`, naming the scanner, the platform guidance command and the run command
  (`node <plugin-root>/scripts/security-scan.mjs`). Other calibrations keep the existing verdict as the whole decision.
- `scripts/security-scan.mjs`: prints a "Security close status" block (four states) in its summary; `--out-dir <dir under scratch/>` writes
  the evidence of an analysis run there instead of `evidence/` (refused with exit 1 and nothing written for any other target).

- `scripts/check-close-security-completeness.mjs` (close.pre entry): prints the four-state lines; a standard project with a scanner that
  did not execute ends in `ADMITTED, NOT COMPLETE` (never `GREEN`); a project without the gate prints `not applicable` instead of a silent exit 0.
- Delivery path: `scripts/consumer-verify-check.mjs` gets a `security` check and `scripts/verify-evidence-producer.mjs` registers it as the
  baseline suite `baseline-security`, so the normal Verify runs `security-scan.mjs --scan-mode snapshot` when the project configures the gate
  (not applicable otherwise); a critical calibration fails that suite for a scanner that did not execute. Restated in place (QG-04) in
  `verify-evidence-producer.test.mjs`: suite/receipt counts 5 -> 6 and the exact suite list gains `baseline-security`.
- New pin `lib/pins/security-close-chain-is-hard-per-calibration.test.mjs` (9 cases C1-C8; needs registration in the Verify suite list).

## Why

Calibration field: `stakes` of the project calibration (already written by onboarding as `standard`; this repo uses `hoch (...)`). No
new field, no schema change. critical/high/kritisch/hoch are critical; standard, any other value and an absent field are not.

## Not changed

- An absent or unrecognised `stakes` stays non-critical (today's behaviour, no new block). Raising it is a one-word change in
  `isCriticalStakes` if the PO wants fail-closed on an unset calibration.
- ERROR (an adapter that crashed) reads `not executed`; its existing blocking rule (SEC-06) is untouched.
- No scan exemption for any path or finding (PO decision 2026-11-04). `lib/path-spelling.mjs` and the separator-sweep sites untouched.

## Not proven

Full Verify of the applied chain, Critic review, PO acceptance, a run against real installed scanners.

## Tests (clone, one suite at a time, all green)

New pin 9/9 (RED first); close-quality-readback 11/11 (new case: the readback evidence carries the four-state reading when the scan result is
readable; written after the code, so not test-first); security-completeness-gate 11/11; security-scan 1/1; check-close-security-completeness 1/1;
guard-push-v2 1/1; guard-push 1/1; security-scan-v2-integration 9/9; security-scan-snapshot 4/4; verify-evidence-producer 57/57 (suite/receipt
counts 5 -> 6 restated in place, QG-04); generate-vendored-canon 8/8; w254 check test 2/2.

## Needs the Coordinator (outside the write scope)

- The documentation edit. `plugins/pipeline-core/docs/operating-model.md` and `plugins/pipeline-core/guardrails/security.md` are vendored copies:
  editing them alone makes `generate-vendored-canon.test.mjs` red (checked: AC-1, AC-1b, AC-7), so they are NOT in this patch. Edit the
  originals `docs/operating-model.md` (security paragraph, line ~392) and `guardrails/security.md` (SEC-06) and regenerate:
  four states `passed`/`failed`/`not executed`/`not applicable`; a skipped scanner is `not executed`, never `passed`; `stakes` critical (or
  high, kritisch, hoch) blocks with `SEC-CLOSE-SCANNER-NOT-EXECUTED`, any other calibration stays non-blocking but reads `not executed`;
  the normal Verify runs the scanners (`baseline-security`); `security-scan.mjs --out-dir scratch/<dir>` runs an analysis.
- Register the new pin in the Verify suite list.
- No push-time status line was added to `guard-push.mjs`: the critical refusal already reaches push through `checkSecurityCompleteness`.
- Not run: project-onboarding-ready-gate and greenfield end-to-end suites.
