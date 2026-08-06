// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createInMemoryGovernanceExportCollector, mapGovernanceExportProjection } from "./governance-export-adapter.mjs";
import { deliverGovernanceExportBatch } from "./governance-export-delivery.mjs";
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
import { createGovernanceExportOutbox, enqueueGovernanceExport } from "./governance-export-outbox.mjs";

const sha = (character) => character.repeat(64);
const profile = { schema: "pipeline.governance-export-adapter-profile.v1", profileId: "audit", format: "ndjson", adapterVersion: "v1", maxBatchEvents: 10, maxPayloadBytes: 10_000, acknowledgement: "per-event", ordering: "per-stream", deduplication: true };
const policy = (overrides = {}) => ({ schema: "pipeline.governance-export-delivery-policy.v1", profileId: "audit", maxBatchEvents: 2, compression: "none", minIntervalMs: 100, maxAttempts: 3, initialBackoffMs: 50, backoffFactor: 2, maxBackoffMs: 400, maxPendingEntries: 3, ...overrides });
const projection = (seed) => ({ schema: "pipeline.governance-export-event.v1", destinationEventId: sha(seed), destinationProfile: "audit", format: "ndjson", policyRevision: sha("b"), sourceEventDigest: sha(seed), fields: { eventType: "lifecycle.dispatch", eventId: `event-${seed}`, occurredAtEpochMs: 1 } });
const queue = (...seeds) => seeds.reduce((outbox, seed) => enqueueGovernanceExport(outbox, projection(seed)), createGovernanceExportOutbox({ destinationProfile: "audit", policyRevision: sha("b") }));
const session = () => createGovernanceExportDeliverySession({ policy: policy(), profile });
const planOf = (overrides = {}) => planGovernanceExportDelivery({ session: session(), outbox: queue("a"), policy: policy(), profile, nowEpochMs: 1_000, ...overrides });

// E-AC-16 enumerates nine behaviours the exporter must apply under retryable
// failure or shutdown. Each is asserted here against the destination profile's
// own bounds rather than against a hard-coded default.
test("E-AC-16 bounds batching and rejects a policy that exceeds the destination profile", () => {
  assert.equal(validateGovernanceExportDeliveryPolicy(policy(), { profile }).maxBatchEvents, 2);
  // The batch never exceeds the policy bound, and never exceeds what is pending.
  assert.equal(planOf({ outbox: queue("a", "b", "c", "d") }).maxEvents, 2);
  assert.equal(planOf({ outbox: queue("a") }).maxEvents, 1);
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
  const mappings = ["a", "b"].map((seed) => mapGovernanceExportProjection({ profile, projection: projection(seed) }));
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
  const relieved = planOf({ outbox: queue("a", "b", "c") });
  assert.equal(relieved.backpressure, false);
  const overloaded = planOf({ outbox: queue("a", "b", "c", "d") });
  assert.equal(overloaded.action, "deliver");
  assert.equal(overloaded.backpressure, true);
  assert.equal(overloaded.pending, 4);
  assert.equal(overloaded.maxEvents, 2);
  assert.equal(planOf({ outbox: queue() }).action, "idle");
});

test("E-AC-16 lets flush drain a shutdown without waiving the retry budget or cancellation", () => {
  const delivered = advanceGovernanceExportDeliverySession({ session: session(), policy: policy(), profile, disposition: "delivered", eventCount: 1, nowEpochMs: 1_000 });
  assert.equal(planOf({ session: delivered, nowEpochMs: 1_010 }).action, "rate-limited");
  const flushing = flushGovernanceExportDeliverySession(delivered);
  const flushed = planOf({ session: flushing, nowEpochMs: 1_010 });
  assert.equal(flushed.action, "deliver");
  assert.equal(flushed.reason, "flush");
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
  // A wait beyond one full backoff -- clock skew or a tampered file -- is
  // capped rather than allowed to stall the exporter forever.
  const skewed = restoreGovernanceExportDeliverySession({ ...persisted, nextAttemptAtEpochMs: 9_000_000 }, { policy: policy(), profile, nowEpochMs: 1_000 });
  assert.equal(skewed.nextAttemptAtEpochMs, 1_400);
  for (const invalid of [{ ...persisted, profileId: "other" }, { ...persisted, extra: true }, { ...persisted, cancelled: true }, { ...persisted, attempt: 0 }])
    assert.throws(() => restoreGovernanceExportDeliverySession(invalid, { policy: policy(), profile, nowEpochMs: 1_000 }), (error) => error.code === "GEP-RESTORE", JSON.stringify(invalid));
});

test("E-AC-16 replays only what the outbox still owes after a failed delivery", async () => {
  const outbox = queue("a", "b", "c");
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
