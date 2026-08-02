// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryGovernanceExportCollector } from "./governance-export-adapter.mjs";
import { deliverGovernanceExportBatch } from "./governance-export-delivery.mjs";
import { createGovernanceExportOutbox, enqueueGovernanceExport } from "./governance-export-outbox.mjs";

const sha = (character) => character.repeat(64);
const profile = { schema: "pipeline.governance-export-adapter-profile.v1", profileId: "audit", format: "ndjson", adapterVersion: "v1", maxBatchEvents: 10, maxPayloadBytes: 10_000, acknowledgement: "per-event", ordering: "per-stream", deduplication: true };
function projection(seed) { return { schema: "pipeline.governance-export-event.v1", destinationEventId: sha(seed), destinationProfile: "audit", format: "ndjson", policyRevision: sha("b"), sourceEventDigest: sha(seed === "a" ? "c" : "d"), fields: { eventType: "lifecycle.dispatch", eventId: `event-${seed}`, occurredAtEpochMs: 1 } }; }
function queue() { return enqueueGovernanceExport(enqueueGovernanceExport(createGovernanceExportOutbox({ destinationProfile: "audit", policyRevision: sha("b") }), projection("a")), projection("e")); }

test("local conformance collector delivers a bounded mapped batch and advances the acknowledged cursor", async () => {
  const collector = createInMemoryGovernanceExportCollector({ profile }); const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter: collector, batchId: "batch-1", maxEvents: 1, attempt: 1 });
  assert.equal(result.outbox.cursor, 1); assert.equal(result.receipt.terminalDisposition, "delivered"); assert.equal(collector.readback()[0].mappings[0].payload.endsWith("\n"), true);
});
test("forged or out-of-batch acknowledgements fail before a local outbox transition", async () => {
  const adapter = { profile, async deliver() { return { schema: "pipeline.governance-export-acknowledgement.v1", profileId: "audit", batchId: "batch-1", acceptedDestinationEventIds: [sha("f")], rejectedDestinationEventIds: [], receiptId: null }; } };
  await assert.rejects(() => deliverGovernanceExportBatch({ outbox: queue(), profile, adapter, batchId: "batch-1", maxEvents: 1, attempt: 1 }), (error) => error.code === "GED-ACK-UNKNOWN");
});
test("partial acknowledgement leaves an independent recoverable suffix with explicit receipt state", async () => {
  const adapter = { profile, async deliver() { return { schema: "pipeline.governance-export-acknowledgement.v1", profileId: "audit", batchId: "batch-2", acceptedDestinationEventIds: [sha("a")], rejectedDestinationEventIds: [], receiptId: null }; } };
  const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter, batchId: "batch-2", maxEvents: 2, attempt: 2 });
  assert.equal(result.outbox.cursor, 1); assert.equal(result.outbox.entries[1].status, "pending"); assert.equal(result.receipt.terminalDisposition, "retryable-failure");
});
