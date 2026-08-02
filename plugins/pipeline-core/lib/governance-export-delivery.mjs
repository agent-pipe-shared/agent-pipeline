// SPDX-License-Identifier: SUL-1.0
/** Outbound-only outbox delivery coordinator for provider-neutral adapters. */
import { applyGovernanceExportDelivery, nextGovernanceExportBatch, validateGovernanceExportOutbox } from "./governance-export-outbox.mjs";
import { createGovernanceDeliveryReceipt } from "./governance-event-projection.mjs";
import { mapGovernanceExportProjection, validateGovernanceExportAcknowledgement, validateGovernanceExportAdapterProfile } from "./governance-export-adapter.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
function fail(code) { const error = new Error("Governance export delivery is invalid."); error.code = code; throw error; }

/**
 * Sends one bounded batch. Adapter acknowledgements are untrusted transport
 * observations; this function only changes local non-authority outbox state.
 */
export async function deliverGovernanceExportBatch({ outbox, profile, adapter, batchId, maxEvents, attempt } = {}) {
  const queue = validateGovernanceExportOutbox(outbox); const active = validateGovernanceExportAdapterProfile(profile);
  if (!adapter || adapter.profile?.profileId !== active.profileId || typeof adapter.deliver !== "function" || !ID.test(batchId ?? "") || !Number.isSafeInteger(attempt) || attempt < 1) fail("GED-REQUEST");
  if (queue.destinationProfile !== active.profileId) fail("GED-BINDING");
  const entries = nextGovernanceExportBatch(queue, { maxEvents }); const mappings = entries.map((entry) => mapGovernanceExportProjection({ profile: active, projection: entry.projection }));
  const acknowledgement = validateGovernanceExportAcknowledgement(await adapter.deliver({ batchId, mappings }));
  if (acknowledgement.profileId !== active.profileId || acknowledgement.batchId !== batchId) fail("GED-ACK-BINDING");
  const known = new Set(entries.map((entry) => entry.projection.destinationEventId));
  if ([...acknowledgement.acceptedDestinationEventIds, ...acknowledgement.rejectedDestinationEventIds].some((id) => !known.has(id))) fail("GED-ACK-UNKNOWN");
  const next = applyGovernanceExportDelivery(queue, { attempt, acceptedDestinationEventIds: acknowledgement.acceptedDestinationEventIds, quarantinedDestinationEventIds: acknowledgement.rejectedDestinationEventIds });
  const accepted = acknowledgement.acceptedDestinationEventIds.length;
  const receipt = createGovernanceDeliveryReceipt({ destinationProfile: active.profileId, policyRevision: queue.policyRevision, batchId, eventCount: entries.length, attempt, acknowledgementClass: accepted === entries.length ? "accepted" : accepted === 0 ? "none" : "partial", terminalDisposition: entries.length === 0 || accepted === entries.length ? "delivered" : acknowledgement.rejectedDestinationEventIds.length > 0 ? "quarantined" : "retryable-failure", cursor: next.cursor, lag: next.entries.filter((entry) => entry.status === "pending").length });
  return Object.freeze({ schema: "pipeline.governance-export-delivery-result.v1", outbox: next, mappings: Object.freeze(mappings), acknowledgement, receipt });
}
