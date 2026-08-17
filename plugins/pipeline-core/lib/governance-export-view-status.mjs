// SPDX-License-Identifier: SUL-1.0
/**
 * Pure translator from the real outbox/receipt/boundary-gate state
 * `deliverGovernanceExportBatch` and `evaluateGovernanceExportBoundaryGate`
 * (governance-export-delivery.mjs / governance-export-outbox.mjs) actually
 * produce into the closed evidence-viewer export-status shape `exportStatus()`
 * in evidence-view-model.mjs validates. No filesystem, no network: every
 * value here is a pure function of its caller-supplied input.
 */
import { createGovernanceDeliveryReceipt } from "./governance-event-projection.mjs";
import { validateGovernanceExportOutbox } from "./governance-export-outbox.mjs";

function fail(code) { const error = new Error("Governance export view status input is invalid."); error.code = code; throw error; }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function freeze(value) { return Object.freeze(value); }

// `createGovernanceDeliveryReceipt`'s own input contract is the ten
// substantive receipt fields; the `schema` tag on `deliveryResult.receipt` is
// a value the function stamps onto its OUTPUT (governance-event-projection.mjs),
// never part of its input allowlist. Re-validating a supplied receipt through
// the same function therefore means re-offering it only the ten fields it
// actually accepts -- not the schema tag it would add back itself -- or even
// a genuinely valid, previously-produced receipt would spuriously fail.
function receiptInputOf(value) {
  if (!record(value)) return value;
  const { schema: _schema, ...rest } = value;
  return rest;
}

function boundaryGateIsValid(value, destinationProfile) {
  if (!record(value) || value.schema !== "pipeline.governance-export-boundary-gate.v1" || typeof value.destinationProfile !== "string" || value.destinationProfile !== destinationProfile) return false;
  if (value.blocked === false) return exact(value, ["schema", "boundary", "destinationProfile", "blocked"]);
  if (value.blocked === true) return exact(value, ["schema", "boundary", "destinationProfile", "blocked", "range", "recovery"]) && record(value.recovery) && Object.keys(value.recovery).length > 0;
  return false;
}

/**
 * E-AC-19: turns one real delivery result -- optionally paired with a real
 * boundary-gate evaluation for the same destination -- into the closed
 * `pipeline.governance-export-view-status.v1` shape. `integrityGaps` is
 * always `null` here: no integrity-gap detector exists anywhere in this
 * codebase, and inventing one is out of scope for this producer; this is a
 * disclosed absence, not an incompleteness to silently fix.
 */
export function projectGovernanceExportViewStatus({ deliveryResult, boundaryGate = null } = {}) {
  if (!exact(deliveryResult, ["schema", "outbox", "mappings", "acknowledgement", "receipt", "advisory"]) || deliveryResult.schema !== "pipeline.governance-export-delivery-result.v1") fail("GEVS-DELIVERY");
  const outbox = validateGovernanceExportOutbox(deliveryResult.outbox);
  const receipt = createGovernanceDeliveryReceipt(receiptInputOf(deliveryResult.receipt));
  if (receipt.destinationProfile !== outbox.destinationProfile) fail("GEVS-BINDING");

  let recoveryState = null;
  if (boundaryGate !== null && boundaryGate !== undefined) {
    if (!boundaryGateIsValid(boundaryGate, outbox.destinationProfile)) fail("GEVS-BOUNDARY");
    // Object.values on the real `recovery` object preserves its own
    // construction order (`pending` then `quarantined` when both are
    // present, evaluateGovernanceExportBoundaryGate) -- never re-sorted or
    // re-worded here.
    recoveryState = boundaryGate.blocked
      ? { blocked: true, guidance: Object.values(boundaryGate.recovery) }
      : { blocked: false, guidance: null };
  }

  // A real, currently-retryable failure: attempted at least once, still
  // neither acknowledged nor quarantined.
  const failureCount = outbox.entries.filter((entry) => entry.status === "pending" && entry.attempts > 0).length;
  const quarantineCount = outbox.entries.filter((entry) => entry.status === "quarantined").length;

  return freeze({
    schema: "pipeline.governance-export-view-status.v1",
    destinationProfile: receipt.destinationProfile,
    state: receipt.terminalDisposition,
    cursor: receipt.cursor,
    lag: receipt.lag,
    receipt: freeze({ batchId: receipt.batchId, acknowledgementClass: receipt.acknowledgementClass, terminalDisposition: receipt.terminalDisposition }),
    failureCount,
    quarantineCount,
    integrityGaps: null,
    recoveryState: recoveryState === null ? null : freeze({ ...recoveryState, guidance: recoveryState.guidance === null ? null : freeze([...recoveryState.guidance]) }),
  });
}
