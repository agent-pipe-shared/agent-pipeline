// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { applyGovernanceExportDelivery, createGovernanceExportOutbox, enqueueGovernanceExport, nextGovernanceExportBatch } from "./governance-export-outbox.mjs";
const policyRevision = "a".repeat(64); const make = (id, source) => ({ schema: "pipeline.governance-export-event.v1", destinationEventId: id.repeat(64).slice(0, 64), destinationProfile: "test-siem", format: "ndjson", policyRevision, sourceEventDigest: source.repeat(64).slice(0, 64), fields: { eventId: source } });
test("keeps destination queues independent and idempotently enqueues one source event", () => { const base = createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision }); const one = enqueueGovernanceExport(base, make("b", "c")); assert.equal(enqueueGovernanceExport(one, make("b", "c")), one); assert.throws(() => enqueueGovernanceExport(base, { ...make("b", "c"), destinationProfile: "other" }), (error) => error.code === "GEO-ENQUEUE"); });
test("advances only the safely acknowledged prefix after partial delivery", () => { let outbox = createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision }); outbox = enqueueGovernanceExport(outbox, make("b", "c")); outbox = enqueueGovernanceExport(outbox, make("d", "e")); const partial = applyGovernanceExportDelivery(outbox, { attempt: 1, acceptedDestinationEventIds: [make("d", "e").destinationEventId] }); assert.equal(partial.cursor, 0); assert.equal(nextGovernanceExportBatch(partial, { maxEvents: 2 }).length, 1); const completed = applyGovernanceExportDelivery(partial, { attempt: 2, acceptedDestinationEventIds: [make("b", "c").destinationEventId] }); assert.equal(completed.cursor, 2); });
test("preserves retryable and quarantined entries without source-history mutation", () => { let outbox = createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision }); outbox = enqueueGovernanceExport(outbox, make("b", "c")); const result = applyGovernanceExportDelivery(outbox, { attempt: 1, acceptedDestinationEventIds: [], quarantinedDestinationEventIds: [make("b", "c").destinationEventId] }); assert.equal(result.entries[0].status, "quarantined"); assert.equal(result.cursor, 0); assert.equal(nextGovernanceExportBatch(result, { maxEvents: 2 }).length, 0); });
// E-AC-08 (2 of 8 named classes attempted here): event gap and schema
// downgrade must both fail typed before either becomes valid outbox state.
// destination-mismatch and forged-acknowledgement are already pinned
// elsewhere in this file (GEO-ENQUEUE above) and in delivery.test.mjs
// (GED-ACK-UNKNOWN); the remaining four classes (cursor rollback, outbox
// truncation, source fork, invalid hash) are reported absent -- see the
// dispatch report for file:line evidence.
test("E-AC-08 detects an event-gap and a schema-downgrade before either becomes valid outbox state", async () => {
  const { validateGovernanceExportOutbox } = await import("./governance-export-outbox.mjs");
  const one = enqueueGovernanceExport(createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision }), make("b", "c"));
  const gapped = { ...one, entries: [{ ...one.entries[0], sequence: 2 }] };
  assert.throws(() => validateGovernanceExportOutbox(gapped), (error) => error.code === "GEO-STATE");
  const downgraded = { ...one, schema: "pipeline.governance-export-outbox.v0" };
  assert.throws(() => validateGovernanceExportOutbox(downgraded), (error) => error.code === "GEO-STATE");
});
