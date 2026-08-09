// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { applyGovernanceExportDelivery, createGovernanceExportOutbox, enqueueGovernanceExport, evaluateGovernanceExportBoundaryGate, nextGovernanceExportBatch, validateGovernanceExportOutbox } from "./governance-export-outbox.mjs";
const policyRevision = "a".repeat(64); const make = (id, source) => ({ schema: "pipeline.governance-export-event.v1", destinationEventId: id.repeat(64).slice(0, 64), destinationProfile: "test-siem", format: "ndjson", policyRevision, sourceEventDigest: source.repeat(64).slice(0, 64), fields: { eventId: source } });
test("keeps destination queues independent and idempotently enqueues one source event", () => { const base = createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision }); const one = enqueueGovernanceExport(base, make("b", "c")); assert.equal(enqueueGovernanceExport(one, make("b", "c")), one); assert.throws(() => enqueueGovernanceExport(base, { ...make("b", "c"), destinationProfile: "other" }), (error) => error.code === "GEO-ENQUEUE"); });
test("advances only the safely acknowledged prefix after partial delivery", () => { let outbox = createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision }); outbox = enqueueGovernanceExport(outbox, make("b", "c")); outbox = enqueueGovernanceExport(outbox, make("d", "e")); const partial = applyGovernanceExportDelivery(outbox, { attempt: 1, acceptedDestinationEventIds: [make("d", "e").destinationEventId] }); assert.equal(partial.cursor, 0); assert.equal(nextGovernanceExportBatch(partial, { maxEvents: 2 }).length, 1); const completed = applyGovernanceExportDelivery(partial, { attempt: 2, acceptedDestinationEventIds: [make("b", "c").destinationEventId] }); assert.equal(completed.cursor, 2); });
test("preserves retryable and quarantined entries without source-history mutation", () => { let outbox = createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision }); outbox = enqueueGovernanceExport(outbox, make("b", "c")); const result = applyGovernanceExportDelivery(outbox, { attempt: 1, acceptedDestinationEventIds: [], quarantinedDestinationEventIds: [make("b", "c").destinationEventId] }); assert.equal(result.entries[0].status, "quarantined"); assert.equal(result.cursor, 0); assert.equal(nextGovernanceExportBatch(result, { maxEvents: 2 }).length, 0); });
// E-AC-08 (2 of 8 named classes attempted here): event gap and schema
// downgrade must both fail typed before either becomes valid outbox state.
// destination-mismatch and forged-acknowledgement are already pinned
// elsewhere in this file (GEO-ENQUEUE above) and in delivery.test.mjs
// (GED-ACK-UNKNOWN). Three more classes are now closed below: the bound
// half of "cursor rollback" (GEO-CURSOR-BOUND), "source fork"
// (GEO-FORK), and "invalid hash" (GEO-INVALID-DIGEST). "outbox
// truncation" remains explicitly out of scope: it needs comparing a new
// outbox state against a PRIOR one, a two-argument capability this
// module does not have.
test("E-AC-08 detects an event-gap and a schema-downgrade before either becomes valid outbox state", async () => {
  const { validateGovernanceExportOutbox } = await import("./governance-export-outbox.mjs");
  const one = enqueueGovernanceExport(createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision }), make("b", "c"));
  const gapped = { ...one, entries: [{ ...one.entries[0], sequence: 2 }] };
  assert.throws(() => validateGovernanceExportOutbox(gapped), (error) => error.code === "GEO-STATE");
  const downgraded = { ...one, schema: "pipeline.governance-export-outbox.v0" };
  assert.throws(() => validateGovernanceExportOutbox(downgraded), (error) => error.code === "GEO-STATE");
});
test("E-AC-08 detects a cursor pointing past the end of the entries array", () => {
  const one = enqueueGovernanceExport(createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision }), make("b", "c"));
  const rolledForward = { ...one, cursor: one.entries.length + 1 };
  assert.throws(() => validateGovernanceExportOutbox(rolledForward), (error) => error.code === "GEO-CURSOR-BOUND");
});
test("E-AC-08 detects a source fork: two entries tracking the same source event under different destination identities", () => {
  let outbox = createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision });
  outbox = enqueueGovernanceExport(outbox, make("b", "c"));
  const forked = { ...outbox, entries: [...outbox.entries, { sequence: 2, projection: make("d", "c"), attempts: 0, status: "pending" }] };
  assert.throws(() => validateGovernanceExportOutbox(forked), (error) => error.code === "GEO-FORK");
});
test("E-AC-08 detects an invalid hash on an entry's digest field", () => {
  const one = enqueueGovernanceExport(createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision }), make("b", "c"));
  const malformed = { ...one, entries: [{ ...one.entries[0], projection: { ...one.entries[0].projection, sourceEventDigest: "not-a-sha-digest" } }] };
  assert.throws(() => validateGovernanceExportOutbox(malformed), (error) => error.code === "GEO-INVALID-DIGEST");
});
// E-AC-10: the boundary gate is a pure query over the same acknowledged-prefix
// cursor applyGovernanceExportDelivery maintains -- it must name the exact
// unacknowledged range (not a count), start it at the right entry regardless
// of prior acknowledged history, and never silently drop a quarantined entry.
test("E-AC-10 boundary gate reports not blocked on an empty outbox and on a fully-acknowledged one", () => {
  const empty = createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision });
  assert.deepEqual(evaluateGovernanceExportBoundaryGate(empty, { boundary: "release" }), { schema: "pipeline.governance-export-boundary-gate.v1", boundary: "release", destinationProfile: "test-siem", blocked: false });
  let outbox = enqueueGovernanceExport(empty, make("b", "c"));
  outbox = applyGovernanceExportDelivery(outbox, { attempt: 1, acceptedDestinationEventIds: [make("b", "c").destinationEventId] });
  assert.equal(evaluateGovernanceExportBoundaryGate(outbox, { boundary: "release" }).blocked, false);
});
test("E-AC-10 boundary gate blocks and names the exact unacknowledged range at the tail", () => {
  let outbox = createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision });
  outbox = enqueueGovernanceExport(outbox, make("b", "c"));
  outbox = enqueueGovernanceExport(outbox, make("d", "e"));
  const gate = evaluateGovernanceExportBoundaryGate(outbox, { boundary: "release" });
  assert.equal(gate.blocked, true); assert.equal(gate.boundary, "release");
  assert.deepEqual(gate.range, { fromSequence: 1, toSequence: 2, count: 2, entries: [
    { sequence: 1, status: "pending", destinationEventId: make("b", "c").destinationEventId, sourceEventDigest: make("b", "c").sourceEventDigest },
    { sequence: 2, status: "pending", destinationEventId: make("d", "e").destinationEventId, sourceEventDigest: make("d", "e").sourceEventDigest },
  ] });
  assert.equal(gate.recovery.quarantined, undefined); assert.ok(gate.recovery.pending);
});
test("E-AC-10 boundary gate's range starts at the first unacknowledged entry, not from zero", () => {
  let outbox = createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision });
  outbox = enqueueGovernanceExport(outbox, make("b", "c"));
  outbox = applyGovernanceExportDelivery(outbox, { attempt: 1, acceptedDestinationEventIds: [make("b", "c").destinationEventId] });
  outbox = enqueueGovernanceExport(outbox, make("d", "e"));
  assert.equal(outbox.cursor, 1);
  const gate = evaluateGovernanceExportBoundaryGate(outbox, { boundary: "promotion" });
  assert.equal(gate.blocked, true); assert.equal(gate.range.fromSequence, 2); assert.equal(gate.range.toSequence, 2); assert.equal(gate.range.count, 1);
});
test("E-AC-10 boundary gate counts a quarantined entry as part of the unacknowledged range instead of silently excluding it", () => {
  let outbox = createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision });
  outbox = enqueueGovernanceExport(outbox, make("b", "c"));
  outbox = applyGovernanceExportDelivery(outbox, { attempt: 1, acceptedDestinationEventIds: [], quarantinedDestinationEventIds: [make("b", "c").destinationEventId] });
  const gate = evaluateGovernanceExportBoundaryGate(outbox, { boundary: "release" });
  assert.equal(gate.blocked, true); assert.equal(gate.range.count, 1); assert.equal(gate.range.entries[0].status, "quarantined");
  assert.equal(gate.recovery.pending, undefined); assert.ok(gate.recovery.quarantined);
});
test("E-AC-10 boundary gate rejects a malformed boundary identifier", () => {
  const outbox = createGovernanceExportOutbox({ destinationProfile: "test-siem", policyRevision });
  assert.throws(() => evaluateGovernanceExportBoundaryGate(outbox, { boundary: "" }), (error) => error.code === "GEO-BOUNDARY");
});
