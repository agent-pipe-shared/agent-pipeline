// SPDX-License-Identifier: SUL-1.0
// Pure logic for verify.mjs's optional `verifyManualStatus` calibration field
// (NVA-R26-VERIFYPREP / NVA-CF-ITEM25EXTRACT,
// backlog/items/2026-08-29-mandatory-verify-gate-has-no-path-for-a-project-with-no-tests-yet.md).
// Extracted out of harness/scripts/verify.mjs (TP-3 protected, and with no
// isDirectInvocation guard -- importing it for its exports would trigger the
// entire ~500-suite run as a side effect) into this new, unprotected sibling
// module so the logic is independently unit-testable. No file I/O, no console
// output: this file is pure by design -- verify.mjs itself reads the
// calibration file and owns the console.error side effect at its call site.
// pipeline.reject-unreplaced-manual-check-placeholder
export const UNREPLACED_MANUAL_CHECK_PLACEHOLDER = "Manual check required.";

export function containsUnreplacedManualCheckPlaceholder(text) {
  return typeof text === "string" && text.includes(UNREPLACED_MANUAL_CHECK_PLACEHOLDER);
}

// pipeline.verify-manual-check-placeholder-detection
export const VERIFY_NOT_CONFIGURED_YET = "not-configured-yet";

/**
 * Given a calibration object (the parsed project/pipeline.json shape) compute
 * the synthetic verify step (or null, meaning "no field declared, unchanged
 * behavior") and the evidence fragment recorded alongside it. This is the
 * exact function body previously inline in verify.mjs itself.
 */
export function computeManualVerifyStep(calibration) {
  const declared = calibration && typeof calibration.verifyManualStatus === "string" ? calibration.verifyManualStatus : null;
  if (declared === null) return { step: null, evidence: null };
  if (declared === VERIFY_NOT_CONFIGURED_YET) {
    return { step: { name: "verify-not-configured-yet", exitCode: 0 }, evidence: { status: VERIFY_NOT_CONFIGURED_YET } };
  }
  if (containsUnreplacedManualCheckPlaceholder(declared)) {
    return { step: { name: "verify-manual-check-placeholder-rejected", exitCode: 1 }, evidence: { status: "placeholder-rejected" } };
  }
  return { step: { name: "verify-manual-check-declared", exitCode: 0 }, evidence: { status: "declared", note: declared.slice(0, 256) } };
}
