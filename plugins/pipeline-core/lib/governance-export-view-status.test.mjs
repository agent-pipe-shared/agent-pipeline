// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryGovernanceExportCollector } from "./governance-export-adapter.mjs";
import { deliverGovernanceExportBatch } from "./governance-export-delivery.mjs";
import { createGovernanceExportOutbox, enqueueGovernanceExport, evaluateGovernanceExportBoundaryGate } from "./governance-export-outbox.mjs";
import { projectGovernanceExportViewStatus } from "./governance-export-view-status.mjs";

const sha = (character) => character.repeat(64);
const profile = { schema: "pipeline.governance-export-adapter-profile.v1", profileId: "audit", format: "ndjson", adapterVersion: "v1", maxBatchEvents: 10, maxPayloadBytes: 10_000, acknowledgement: "per-event", ordering: "per-stream", deduplication: true, advisory: false };
function projection(seed) { return { schema: "pipeline.governance-export-event.v1", destinationEventId: sha(seed), destinationProfile: "audit", format: "ndjson", policyRevision: sha("b"), sourceEventDigest: sha(seed === "a" ? "c" : "d"), fields: { eventType: "lifecycle.dispatch", eventId: `event-${seed}`, occurredAtEpochMs: 1 } }; }
function queue() { return enqueueGovernanceExport(enqueueGovernanceExport(createGovernanceExportOutbox({ destinationProfile: "audit", policyRevision: sha("b") }), projection("a")), projection("e")); }

test("projects a real fully-delivered result with no boundary gate: real counts, recoveryState stays null", async () => {
  const collector = createInMemoryGovernanceExportCollector({ profile });
  const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter: collector, batchId: "batch-1", maxEvents: 2, attempt: 1 });
  const view = projectGovernanceExportViewStatus({ deliveryResult: result });
  assert.equal(view.schema, "pipeline.governance-export-view-status.v1");
  assert.equal(view.destinationProfile, "audit");
  assert.equal(view.state, "delivered");
  assert.equal(view.cursor, result.receipt.cursor);
  assert.equal(view.lag, result.receipt.lag);
  assert.deepEqual(view.receipt, { batchId: "batch-1", acknowledgementClass: "accepted", terminalDisposition: "delivered" });
  assert.equal(view.failureCount, 0);
  assert.equal(view.quarantineCount, 0);
  assert.equal(view.integrityGaps, null);
  assert.equal(view.recoveryState, null);
});

test("real failureCount and quarantineCount reflect per-entry outbox state after an unacknowledged attempt", async () => {
  const adapter = { profile, async deliver() { return { schema: "pipeline.governance-export-acknowledgement.v1", profileId: "audit", batchId: "batch-2", acceptedDestinationEventIds: [], rejectedDestinationEventIds: [], receiptId: null }; } };
  const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter, batchId: "batch-2", maxEvents: 2, attempt: 1 });
  const view = projectGovernanceExportViewStatus({ deliveryResult: result });
  // Both entries were attempted but neither accepted nor quarantined: both
  // stay pending with attempts > 0, a real currently-retryable failure signal.
  assert.equal(view.failureCount, 2);
  assert.equal(view.quarantineCount, 0);
});

test("a well-formed delivery result with a blocked:false boundary gate reports not-blocked recoveryState", async () => {
  const collector = createInMemoryGovernanceExportCollector({ profile });
  const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter: collector, batchId: "batch-3", maxEvents: 2, attempt: 1 });
  const gate = evaluateGovernanceExportBoundaryGate(result.outbox, { boundary: "release" });
  assert.equal(gate.blocked, false);
  const view = projectGovernanceExportViewStatus({ deliveryResult: result, boundaryGate: gate });
  assert.deepEqual(view.recoveryState, { blocked: false, guidance: null });
});

// E-AC-19: the guidance array is pinned to real evaluateGovernanceExportBoundaryGate
// output built for an outbox with one pending and one quarantined entry, not
// a hand-authored plausible-looking literal -- and its order/content must
// match `Object.values(gate.recovery)` verbatim (pending then quarantined).
test("a well-formed delivery result with a blocked:true boundary gate carries real pending+quarantined guidance in real order", async () => {
  const adapter = { profile, async deliver() { return { schema: "pipeline.governance-export-acknowledgement.v1", profileId: "audit", batchId: "batch-4", acceptedDestinationEventIds: [], rejectedDestinationEventIds: [projection("e").destinationEventId], receiptId: null }; } };
  const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter, batchId: "batch-4", maxEvents: 2, attempt: 1 });
  const gate = evaluateGovernanceExportBoundaryGate(result.outbox, { boundary: "release" });
  assert.equal(gate.blocked, true);
  assert.deepEqual(Object.keys(gate.recovery).sort(), ["pending", "quarantined"].sort(), "fixture must exercise both recovery guidance classes");
  const view = projectGovernanceExportViewStatus({ deliveryResult: result, boundaryGate: gate });
  assert.equal(view.recoveryState.blocked, true);
  assert.deepEqual(view.recoveryState.guidance, Object.values(gate.recovery));
  assert.equal(view.recoveryState.guidance[0], gate.recovery.pending);
  assert.equal(view.recoveryState.guidance[1], gate.recovery.quarantined);
  assert.equal(view.failureCount, 1);
  assert.equal(view.quarantineCount, 1);
});

test("a malformed deliveryResult (wrong schema, missing keys) fails GEVS-DELIVERY", async () => {
  const collector = createInMemoryGovernanceExportCollector({ profile });
  const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter: collector, batchId: "batch-5", maxEvents: 1, attempt: 1 });
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: { ...result, schema: "pipeline.governance-export-delivery-result.v0" } }), (error) => error.code === "GEVS-DELIVERY");
  const { advisory: _advisory, ...missingKey } = result;
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: missingKey }), (error) => error.code === "GEVS-DELIVERY");
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: null }), (error) => error.code === "GEVS-DELIVERY");
});

test("a mismatched destinationProfile between receipt and outbox fails GEVS-BINDING", async () => {
  const collector = createInMemoryGovernanceExportCollector({ profile });
  const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter: collector, batchId: "batch-6", maxEvents: 1, attempt: 1 });
  const tampered = { ...result, receipt: { ...result.receipt, destinationProfile: "other" } };
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: tampered }), (error) => error.code === "GEVS-BINDING");
});

test("a malformed or mismatched boundaryGate fails GEVS-BOUNDARY", async () => {
  const collector = createInMemoryGovernanceExportCollector({ profile });
  const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter: collector, batchId: "batch-7", maxEvents: 2, attempt: 1 });
  const gate = evaluateGovernanceExportBoundaryGate(result.outbox, { boundary: "release" });
  assert.equal(gate.blocked, false);
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: result, boundaryGate: { ...gate, schema: "pipeline.governance-export-boundary-gate.v0" } }), (error) => error.code === "GEVS-BOUNDARY");
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: result, boundaryGate: { ...gate, destinationProfile: "other" } }), (error) => error.code === "GEVS-BOUNDARY");
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: result, boundaryGate: { ...gate, extra: true } }), (error) => error.code === "GEVS-BOUNDARY");
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: result, boundaryGate: { ...gate, blocked: "maybe" } }), (error) => error.code === "GEVS-BOUNDARY");
});

test("a blocked boundary gate with a malformed recovery shape fails GEVS-BOUNDARY", async () => {
  const adapter = { profile, async deliver() { return { schema: "pipeline.governance-export-acknowledgement.v1", profileId: "audit", batchId: "batch-8", acceptedDestinationEventIds: [], rejectedDestinationEventIds: [], receiptId: null }; } };
  const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter, batchId: "batch-8", maxEvents: 2, attempt: 1 });
  const gate = evaluateGovernanceExportBoundaryGate(result.outbox, { boundary: "release" });
  assert.equal(gate.blocked, true);
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: result, boundaryGate: { ...gate, recovery: {} } }), (error) => error.code === "GEVS-BOUNDARY");
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: result, boundaryGate: { ...gate, recovery: [] } }), (error) => error.code === "GEVS-BOUNDARY");
  const { range: _range, ...withoutRange } = gate;
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: result, boundaryGate: withoutRange }), (error) => error.code === "GEVS-BOUNDARY");
});

test("an invalid outbox inside deliveryResult propagates the underlying GEO-* error unchanged", async () => {
  const collector = createInMemoryGovernanceExportCollector({ profile });
  const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter: collector, batchId: "batch-9", maxEvents: 1, attempt: 1 });
  const brokenOutbox = { ...result.outbox, cursor: result.outbox.entries.length + 1 };
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: { ...result, outbox: brokenOutbox } }), (error) => error.code === "GEO-CURSOR-BOUND");
});

test("a malformed receipt inside deliveryResult propagates the underlying GEP-RECEIPT error unchanged", async () => {
  const collector = createInMemoryGovernanceExportCollector({ profile });
  const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter: collector, batchId: "batch-10", maxEvents: 1, attempt: 1 });
  const { lag: _lag, ...brokenReceipt } = result.receipt;
  assert.throws(() => projectGovernanceExportViewStatus({ deliveryResult: { ...result, receipt: brokenReceipt } }), (error) => error.code === "GEP-RECEIPT");
});

test("the returned view status is deep-frozen", async () => {
  const adapter = { profile, async deliver() { return { schema: "pipeline.governance-export-acknowledgement.v1", profileId: "audit", batchId: "batch-11", acceptedDestinationEventIds: [], rejectedDestinationEventIds: [projection("e").destinationEventId], receiptId: null }; } };
  const result = await deliverGovernanceExportBatch({ outbox: queue(), profile, adapter, batchId: "batch-11", maxEvents: 2, attempt: 1 });
  const gate = evaluateGovernanceExportBoundaryGate(result.outbox, { boundary: "release" });
  const view = projectGovernanceExportViewStatus({ deliveryResult: result, boundaryGate: gate });
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.receipt));
  assert.ok(Object.isFrozen(view.recoveryState));
  assert.ok(Object.isFrozen(view.recoveryState.guidance));
});
