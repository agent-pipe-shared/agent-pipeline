// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createInMemoryGovernanceExportCollector, mapGovernanceExportProjection } from "./governance-export-adapter.mjs";
import {
  advanceGovernanceExportDeliverySession,
  cancelGovernanceExportDeliverySession,
  createGovernanceExportDeliverySession,
  encodeGovernanceExportBatch,
  flushGovernanceExportDeliverySession,
  planGovernanceExportDelivery,
  restoreGovernanceExportDeliverySession,
  validateGovernanceExportDeliveryPolicy,
} from "./governance-export-delivery-policy.mjs";
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

const policy = (overrides = {}) => ({ schema: "pipeline.governance-export-delivery-policy.v1", profileId: "audit", maxBatchEvents: 2, compression: "none", minIntervalMs: 100, maxAttempts: 3, initialBackoffMs: 50, backoffFactor: 2, maxBackoffMs: 400, maxPendingEntries: 3, ...overrides });
const policyProjection = (seed) => ({ schema: "pipeline.governance-export-event.v1", destinationEventId: sha(seed), destinationProfile: "audit", format: "ndjson", policyRevision: sha("b"), sourceEventDigest: sha(seed), fields: { eventType: "lifecycle.dispatch", eventId: `event-${seed}`, occurredAtEpochMs: 1 } });
const policyQueue = (...seeds) => seeds.reduce((outbox, seed) => enqueueGovernanceExport(outbox, policyProjection(seed)), createGovernanceExportOutbox({ destinationProfile: "audit", policyRevision: sha("b") }));
const session = () => createGovernanceExportDeliverySession({ policy: policy(), profile });
const planOf = (overrides = {}) => planGovernanceExportDelivery({ session: session(), outbox: policyQueue("a"), policy: policy(), profile, nowEpochMs: 1_000, ...overrides });

// E-AC-16 enumerates nine behaviours the exporter must apply under retryable
// failure or shutdown. Each is asserted here against the destination profile's
// own bounds rather than against a hard-coded default.
test("E-AC-16 bounds batching and rejects a policy that exceeds the destination profile", () => {
  assert.equal(validateGovernanceExportDeliveryPolicy(policy(), { profile }).maxBatchEvents, 2);
  // The batch never exceeds the policy bound, and never exceeds what is pending.
  assert.equal(planOf({ outbox: policyQueue("a", "b", "c", "d") }).maxEvents, 2);
  assert.equal(planOf({ outbox: policyQueue("a") }).maxEvents, 1);
  for (const invalid of [
    policy({ maxBatchEvents: 11 }), // above the adapter profile's own bound
    policy({ maxBatchEvents: 0 }),
    policy({ profileId: "other" }),
    policy({ compression: "brotli" }),
    policy({ maxAttempts: 0 }),
    policy({ backoffFactor: 0 }),
    policy({ maxBackoffMs: 10 }), // below the initial backoff
    policy({ maxPendingEntries: 0 }),
    { ...policy(), extra: true },
  ]) assert.throws(() => validateGovernanceExportDeliveryPolicy(invalid, { profile }), (error) => error.code === "GEP-POLICY", JSON.stringify(invalid));
});

test("E-AC-16 applies compression only where the profile enables it, over the same events", () => {
  const mappings = ["a", "b"].map((seed) => mapGovernanceExportProjection({ profile, projection: policyProjection(seed) }));
  const plain = encodeGovernanceExportBatch({ mappings, policy: policy(), profile });
  assert.equal(plain.compression, "none");
  assert.equal(plain.encodedBytes, plain.rawBytes);
  assert.equal(plain.eventCount, 2);
  const gzipped = encodeGovernanceExportBatch({ mappings, policy: policy({ compression: "gzip" }), profile });
  assert.equal(gzipped.compression, "gzip");
  assert.notEqual(gzipped.encodedBytes, gzipped.rawBytes);
  assert.equal(gzipped.rawBytes, plain.rawBytes);
  // Compression is an encoding, never a change of content.
  assert.equal(gunzipSync(Buffer.from(gzipped.encodedBase64, "base64")).toString("utf8"), Buffer.from(plain.encodedBase64, "base64").toString("utf8"));
  assert.equal(gzipped.rawSha256, plain.rawSha256);
  assert.throws(() => encodeGovernanceExportBatch({ mappings: [...mappings, ...mappings], policy: policy(), profile }), (error) => error.code === "GEP-ENCODE");
  assert.throws(() => encodeGovernanceExportBatch({ mappings: [{ profileId: "other", payload: "x" }], policy: policy(), profile }), (error) => error.code === "GEP-ENCODE");
});

// The mapper bounds one event; nothing bounded their sum, so a batch of
// individually legal payloads could exceed what the destination declared it
// accepts. The bound belongs on what goes to the wire.
test("E-AC-16 holds a batch inside the destination's declared payload bound", () => {
  const tight = { ...profile, maxPayloadBytes: 512 };
  const one = mapGovernanceExportProjection({ profile: tight, projection: policyProjection("a") });
  assert.ok(one.payloadBytes < 512, "fixture must stay legal per event");
  assert.ok(one.payloadBytes * 2 > 512, "fixture must exceed the bound in aggregate");
  assert.equal(encodeGovernanceExportBatch({ mappings: [one], policy: policy(), profile: tight }).eventCount, 1);
  const two = [one, mapGovernanceExportProjection({ profile: tight, projection: policyProjection("b") })];
  assert.throws(() => encodeGovernanceExportBatch({ mappings: two, policy: policy(), profile: tight }), (error) => error.code === "GEP-ENCODE-PAYLOAD-LIMIT");
  // Compression counts in the caller's favour: the bound is on the wire bytes.
  assert.equal(encodeGovernanceExportBatch({ mappings: two, policy: policy({ compression: "gzip" }), profile: tight }).compression, "gzip");
});

test("E-AC-16 enforces the rate limit between successful deliveries", () => {
  const delivered = advanceGovernanceExportDeliverySession({ session: session(), policy: policy(), profile, disposition: "delivered", eventCount: 2, nowEpochMs: 1_000 });
  assert.equal(delivered.nextAttemptAtEpochMs, 1_100);
  assert.equal(delivered.deliveredEvents, 2);
  assert.equal(delivered.attempt, 1);
  const limited = planOf({ session: delivered, nowEpochMs: 1_050 });
  assert.equal(limited.action, "rate-limited");
  assert.equal(limited.reason, "rate-limit");
  assert.equal(limited.waitMs, 50);
  assert.equal(planOf({ session: delivered, nowEpochMs: 1_100 }).action, "deliver");
});

test("E-AC-16 spends a bounded retry budget with capped exponential backoff", () => {
  const current = policy();
  let state = session();
  const waits = [];
  for (let round = 0; round < 4; round += 1) {
    state = advanceGovernanceExportDeliverySession({ session: state, policy: current, profile, disposition: "retryable-failure", eventCount: 0, nowEpochMs: 1_000 });
    waits.push(state.nextAttemptAtEpochMs - 1_000);
  }
  // 50 -> 100 -> 200 -> capped at 400.
  assert.deepEqual(waits, [50, 100, 200, 400]);
  assert.equal(state.retryableFailures, 4);
  // The budget is spent: attempt 5 exceeds maxAttempts 3, and no further
  // delivery is planned even though work is pending.
  const exhausted = planOf({ session: state, nowEpochMs: 9_999 });
  assert.equal(exhausted.action, "exhausted");
  assert.equal(exhausted.reason, "retry-budget");
  assert.equal(exhausted.pending, 1);
  // While the budget lasts, a pending backoff is reported as backoff, not as a
  // plain rate limit -- the two are not interchangeable to an operator.
  const failedOnce = advanceGovernanceExportDeliverySession({ session: session(), policy: current, profile, disposition: "retryable-failure", eventCount: 0, nowEpochMs: 1_000 });
  assert.equal(planOf({ session: failedOnce, nowEpochMs: 1_010 }).action, "backoff");
  assert.equal(planOf({ session: failedOnce, nowEpochMs: 1_010 }).reason, "retry-backoff");
  // A destination that answers clears the budget instead of inheriting it.
  assert.equal(advanceGovernanceExportDeliverySession({ session: failedOnce, policy: current, profile, disposition: "delivered", eventCount: 1, nowEpochMs: 2_000 }).attempt, 1);
});

test("E-AC-16 signals backpressure without ever suppressing the drain", () => {
  const relieved = planOf({ outbox: policyQueue("a", "b", "c") });
  assert.equal(relieved.backpressure, false);
  const overloaded = planOf({ outbox: policyQueue("a", "b", "c", "d") });
  assert.equal(overloaded.action, "deliver");
  assert.equal(overloaded.backpressure, true);
  assert.equal(overloaded.pending, 4);
  assert.equal(overloaded.maxEvents, 2);
  assert.equal(planOf({ outbox: policyQueue() }).action, "idle");
});

test("E-AC-16 lets flush drain a shutdown without waiving the retry budget or cancellation", () => {
  const delivered = advanceGovernanceExportDeliverySession({ session: session(), policy: policy(), profile, disposition: "delivered", eventCount: 1, nowEpochMs: 1_000 });
  assert.equal(planOf({ session: delivered, nowEpochMs: 1_010 }).action, "rate-limited");
  const flushing = flushGovernanceExportDeliverySession(delivered);
  const flushed = planOf({ session: flushing, nowEpochMs: 1_010 });
  assert.equal(flushed.action, "deliver");
  assert.equal(flushed.reason, "flush");
  // Flush waives the rate limit and nothing else. A shutdown is a reason to
  // finish what is owed, not to hammer a destination that is already refusing
  // traffic -- so an outstanding backoff still holds under flush.
  const backingOff = advanceGovernanceExportDeliverySession({ session: session(), policy: policy(), profile, disposition: "retryable-failure", eventCount: 0, nowEpochMs: 1_000 });
  const flushedBackoff = planOf({ session: flushGovernanceExportDeliverySession(backingOff), nowEpochMs: 1_010 });
  assert.equal(flushedBackoff.action, "backoff");
  assert.equal(flushedBackoff.reason, "retry-backoff");
  // ...and it resumes on the backoff's own schedule, not immediately.
  assert.equal(planOf({ session: flushGovernanceExportDeliverySession(backingOff), nowEpochMs: 1_050 }).action, "deliver");
  // Flush does not buy a retry budget it has already spent.
  let spent = flushGovernanceExportDeliverySession(session());
  for (let round = 0; round < 3; round += 1) spent = advanceGovernanceExportDeliverySession({ session: spent, policy: policy(), profile, disposition: "retryable-failure", eventCount: 0, nowEpochMs: 1_000 });
  assert.equal(planOf({ session: spent, nowEpochMs: 9_999 }).action, "exhausted");
  // Cancellation outranks flush, and is terminal.
  const cancelled = cancelGovernanceExportDeliverySession(flushing, { reasonCode: "shutdown" });
  const stopped = planOf({ session: cancelled, nowEpochMs: 9_999 });
  assert.equal(stopped.action, "cancelled");
  assert.equal(stopped.reason, "shutdown");
  assert.equal(cancelGovernanceExportDeliverySession(cancelled, { reasonCode: "operator" }).cancelReason, "shutdown");
  assert.throws(() => cancelGovernanceExportDeliverySession(session(), { reasonCode: "because" }), (error) => error.code === "GEP-CANCEL");
});

test("E-AC-16 resumes a restart with its retry budget and outstanding wait intact", () => {
  const failed = advanceGovernanceExportDeliverySession({ session: session(), policy: policy(), profile, disposition: "retryable-failure", eventCount: 0, nowEpochMs: 1_000 });
  const persisted = JSON.parse(JSON.stringify(failed));
  const resumed = restoreGovernanceExportDeliverySession(persisted, { policy: policy(), profile, nowEpochMs: 1_010 });
  assert.deepEqual({ ...resumed }, { ...failed });
  // A restart is not a way to buy a fresh budget.
  assert.equal(planOf({ session: resumed, nowEpochMs: 1_010 }).action, "backoff");
  assert.equal(planOf({ session: resumed, nowEpochMs: 1_050 }).action, "deliver");
  // A flush is a concession to the process that asked for it. Carrying it over
  // a restart would hand the new process a standing rate-limit waiver.
  const flushedThenDelivered = advanceGovernanceExportDeliverySession({ session: flushGovernanceExportDeliverySession(session()), policy: policy(), profile, disposition: "delivered", eventCount: 1, nowEpochMs: 1_000 });
  assert.equal(flushedThenDelivered.flushing, true);
  const afterRestart = restoreGovernanceExportDeliverySession(JSON.parse(JSON.stringify(flushedThenDelivered)), { policy: policy(), profile, nowEpochMs: 1_010 });
  assert.equal(afterRestart.flushing, false);
  assert.equal(planOf({ session: afterRestart, nowEpochMs: 1_010 }).action, "rate-limited");
  // A wait beyond one full backoff -- clock skew or a tampered file -- is
  // capped rather than allowed to stall the exporter forever.
  const skewed = restoreGovernanceExportDeliverySession({ ...persisted, nextAttemptAtEpochMs: 9_000_000 }, { policy: policy(), profile, nowEpochMs: 1_000 });
  assert.equal(skewed.nextAttemptAtEpochMs, 1_400);
  for (const invalid of [{ ...persisted, profileId: "other" }, { ...persisted, extra: true }, { ...persisted, cancelled: true }, { ...persisted, attempt: 0 }])
    assert.throws(() => restoreGovernanceExportDeliverySession(invalid, { policy: policy(), profile, nowEpochMs: 1_000 }), (error) => error.code === "GEP-RESTORE", JSON.stringify(invalid));
});

test("E-AC-16 replays only what the outbox still owes after a failed delivery", async () => {
  const outbox = policyQueue("a", "b", "c");
  const first = planGovernanceExportDelivery({ session: session(), outbox, policy: policy(), profile, nowEpochMs: 1_000 });
  const collector = createInMemoryGovernanceExportCollector({ profile });
  const result = await deliverGovernanceExportBatch({ outbox, profile, adapter: collector, batchId: "batch-1", maxEvents: first.maxEvents, attempt: first.attempt });
  assert.equal(result.receipt.terminalDisposition, "delivered");
  const advanced = advanceGovernanceExportDeliverySession({ session: session(), policy: policy(), profile, disposition: result.receipt.terminalDisposition, eventCount: first.maxEvents, nowEpochMs: 1_000 });
  // The replay covers the untouched suffix only; the acknowledged prefix is
  // never re-sent, so a restart cannot duplicate governance history.
  const replay = planGovernanceExportDelivery({ session: advanced, outbox: result.outbox, policy: policy(), profile, nowEpochMs: 1_100 });
  assert.equal(replay.action, "deliver");
  assert.equal(replay.pending, 1);
  assert.equal(replay.maxEvents, 1);
  const drained = await deliverGovernanceExportBatch({ outbox: result.outbox, profile, adapter: collector, batchId: "batch-2", maxEvents: replay.maxEvents, attempt: replay.attempt });
  assert.equal(planGovernanceExportDelivery({ session: advanced, outbox: drained.outbox, policy: policy(), profile, nowEpochMs: 1_200 }).action, "idle");
  assert.deepEqual(collector.readback().map((batch) => batch.mappings.length), [2, 1]);
});
