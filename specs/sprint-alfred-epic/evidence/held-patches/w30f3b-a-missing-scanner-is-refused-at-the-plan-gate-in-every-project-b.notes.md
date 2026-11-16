# w30f3b — a missing required scanner is refused at the plan gate for every project that has not opted the security gate out, not only for critical (candidate 30f, dispatch C30F-G3B)

Applies after the 30e chain (it is the delta `20793081f..HEAD` of a slice clone started from that chain and edits files the chain also edits). Against the repository before the 30e chain it does not apply;
against the 30e chain clone `git apply --check` is exit 0. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.
PO decision 2026-11-16: move the refusal to the plan gate for every project that has not opted the security gate out; the start, onboarding and a design session are not blocked (only the two callers of
`securityScannerEntryCheck`, `present-plan` before the signature and `set-phase --phase implementation`, run the check).

## What it changes

- `lib/security-close-status.mjs`: `scannerEntryReadiness(report, { critical, exceptions, deferred })`. The two `critical` lines are untouched: a critical calibration gets the same refusal as before, honours only a valid committed
  exception, never a deferral and never the opt-out. For any other calibration (standard, or stakes unset: `isCriticalStakes` is false for both) a scanner in a repairable state (`binary_missing`, `incompatible_version`,
  `incompatible_capability`, `input_missing`, `untrusted_path`) is refused with the same code `SEC-CLOSE-SCANNER-NOT-EXECUTED` and a new text from `scannerMissingAtPlanGateRefusal`: it names the scanner, the toolchain document route
  (`toolchainDocPointer`, `docs/toolchain.md#<tool>`), the exact deferral command (`node <plugin-root>/scripts/toolchain-defer.mjs --tool <tool> --answer "<the person's answer>"`), the committed-exception route, and states
  "Nothing was written". It does not say "calibrated critical". Not refused, and given today's notice instead: the project opted out (`report.securityGate === "off"`; an absent key, `warn` and `blocking` are not opted out, as the
  preflight computes `gateMode ?? "blocking"`), a scanner answered by a valid committed exception or a machine-local deferral, and every `license-check` finding. The host-boundary states stay silent as before. A Trivy the preflight
  reports `not_required` (no tracked infrastructure or container files) is not a repairable state and never refuses: the applicability rule is the preflight's, no second rule.
- `scripts/pipeline-state.mjs` `securityScannerEntryCheck`: reads the committed exceptions for every calibration (was critical only) and passes `deferred` from `readToolDeferral` through a `deps.readToolDeferral` seam (like the preflight's).
  Still silent when the check cannot run.
- `lib/toolchain-doc.mjs`: the sentence of the required class states the new rule; `docs/toolchain.md` and `plugins/pipeline-core/docs/toolchain.md` regenerated with `harness/scripts/generate-toolchain-doc.mjs` and
  `harness/scripts/generate-vendored-canon.mjs` (1 file written), never by hand. Comments of `lib/toolchain-deferrals.mjs` and `scripts/toolchain-preflight.mjs` reworded (they said the plan gate refuses only critical).
- Tests: the unit pin `security-close-chain-is-hard-per-calibration` (one case restated, one new case with every behavior); the configure-verify pin (the old case "any other project gets a notice and enters" restated, fixture unchanged,
  two optional fixture parameters added, plus an opted-out case); `toolchain-registry.test.mjs` (the document states the new rule); `toolchain-preflight.test.mjs` (pins `securityGate` off / absent / warn and the Trivy applicability the gate relies on);
  `pipeline-state.test.mjs` (real `present-plan` gate, see below).

## Checks

- RED before the production edit, on the original code: `security-close-chain-is-hard-per-calibration.test.mjs` 31 of 33 (the restated case and the new case failed). GREEN after: 33 of 33.
- GREEN on the final state: `toolchain-registry.test.mjs` 11 of 11, the configure-verify pin 9 of 9, `toolchain-preflight.test.mjs` 55 of 55, `pipeline-state.test.mjs` 1 of 1 (one top-level script test, whole suite).
- Gate level in `pipeline-state.test.mjs`: after `submit-plan --profile feature`, `present-plan` with an injected missing gitleaks and no record exits 2, prints the new text with the install route and the deferral command, says nothing
  about "calibrated critical", and the State file is byte-identical. With an injected deferral the scanner refusal is gone and the notice is printed; with `securityGate: "off"` the same.
- Gate level in the configure-verify pin (real `set-phase --phase implementation`): critical refused even with a deferral recorded; the unset-stakes baseline refused; with the deferral it enters with the notice; an opted-out report enters with the notice.
- The deferral file is injected in every new and restated gate case (no result depends on the machine's file); no case uses the real scanner binaries.

## Not changed / not proven

- No change to the close-time checks, the scanner adapters, the registry's tool list or conditions, the deferral recording, or what critical does.
- Not proven RED on the original code for the configure-verify pin, the registry document case and the new `pipeline-state.test.mjs` block (restoring the original production files in the clone was refused by the shell guard; only the unit pin was run RED).
- Not proven: a complete `present-plan` pass in `pipeline-state.test.mjs`. That fixture has no review receipt chain, so other points of the gate stay open; the cases assert the scanner refusal is present or absent, not that the whole gate is ready.
  The full pass with a recorded deferral is shown at the real `set-phase` in the configure-verify pin.
- Not proven: other suites outside the write list whose fixtures enable scanners with the gate not off and run `present-plan` or `set-phase --phase implementation` without injecting `toolchainPreflight` now depend on the host's scanner
  binaries (my search was a name search for scanner-enabling fixtures, not exhaustive; `pipeline-state.test.mjs` is green here with scanners installed on this machine; a machine without them is not tried). The full Verify was not made.
