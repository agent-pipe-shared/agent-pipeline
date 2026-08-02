// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { mapGovernanceExportProjection, validateGovernanceExportAcknowledgement, validateGovernanceExportAdapterProfile } from "./governance-export-adapter.mjs";

const sha = (character) => character.repeat(64);
function projection(format, fields = { eventType: "lifecycle.dispatch", occurredAtEpochMs: 1, eventId: "event-1" }) { return { schema: "pipeline.governance-export-event.v1", destinationEventId: sha("a"), destinationProfile: "audit", format, policyRevision: sha("b"), sourceEventDigest: sha("c"), fields }; }
function profile(format, overrides = {}) { return { schema: "pipeline.governance-export-adapter-profile.v1", profileId: "audit", format, adapterVersion: "v1", maxBatchEvents: 10, maxPayloadBytes: 10_000, acknowledgement: "per-event", ordering: "per-stream", deduplication: true, ...overrides }; }

test("maps sanitized projections deterministically into all supported interchange profiles", () => {
  const cloud = mapGovernanceExportProjection({ profile: profile("cloudevents-json"), projection: projection("cloudevents-json") });
  assert.equal(cloud.payload.specversion, "1.0"); assert.equal(cloud.payload.data.fields.eventId, "event-1");
  const logs = mapGovernanceExportProjection({ profile: profile("otlp-json"), projection: projection("otlp-json") });
  assert.equal(logs.payload.resourceLogs[0].scopeLogs[0].logRecords[0].attributes[0].value.stringValue, "lifecycle.dispatch");
  const ndjson = mapGovernanceExportProjection({ profile: profile("ndjson"), projection: projection("ndjson") });
  assert.match(ndjson.payload, /\n$/u); assert.equal(JSON.parse(ndjson.payload).sourceEventDigest, sha("c"));
  const syslog = mapGovernanceExportProjection({ profile: profile("rfc5424"), projection: projection("rfc5424") });
  assert.match(syslog.payload, /^<14>1 /u); assert.doesNotMatch(syslog.payload, /\r|\n/u);
});
test("maps only the already-sanitized projection and rejects profile or payload mismatch", () => {
  const item = projection("ndjson", { eventType: "safe" });
  const mapped = mapGovernanceExportProjection({ profile: profile("ndjson"), projection: item });
  assert.doesNotMatch(mapped.payload, /canonical|payloadDigest|credential/u);
  assert.throws(() => mapGovernanceExportProjection({ profile: profile("otlp-json"), projection: item }), (error) => error.code === "GEA-MAP");
  assert.throws(() => mapGovernanceExportProjection({ profile: profile("ndjson"), projection: projection("ndjson", { eventType: "safe", rationale: "never export this" }) }), (error) => error.code === "GEA-MAP");
  assert.throws(() => mapGovernanceExportProjection({ profile: profile("ndjson", { maxPayloadBytes: 256 }), projection: projection("ndjson", { eventType: "x".repeat(1_000) }) }), (error) => error.code === "GEA-PAYLOAD-LIMIT");
});
test("profile and acknowledgements are closed, non-authoritative and deduplicated", () => {
  assert.equal(validateGovernanceExportAdapterProfile(profile("ndjson")).ordering, "per-stream");
  const ack = validateGovernanceExportAcknowledgement({ schema: "pipeline.governance-export-acknowledgement.v1", profileId: "audit", batchId: "batch-1", acceptedDestinationEventIds: [sha("a")], rejectedDestinationEventIds: [], receiptId: "opaque-1" });
  assert.equal(ack.receiptId, "opaque-1");
  assert.throws(() => validateGovernanceExportAcknowledgement({ ...ack, acceptedDestinationEventIds: [sha("a"), sha("a")] }), (error) => error.code === "GEA-ACK");
});
