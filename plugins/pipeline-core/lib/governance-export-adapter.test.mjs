// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryGovernanceExportCollector, mapGovernanceExportProjection, validateGovernanceExportAcknowledgement, validateGovernanceExportAdapterProfile } from "./governance-export-adapter.mjs";

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
// E-AC-18: portable export intent and evidence must exclude destination
// credentials, endpoints, certificates, tokens and private organization
// coordinates while preserving the typed local bindings. Exclusion rests on a
// closed profile/projection shape plus the EXPORT_FIELDS allowlist rather than
// on a denylist; this proves both halves -- nothing prohibited survives any
// boundary, and everything typed does.
test("E-AC-18 excludes destination secrets from every portable export record while keeping typed local bindings", async () => {
  const secrets = { endpoint: "internal-endpoint-fixture", credential: "redacted-fixture", certificate: "redacted-fixture", token: "redacted-fixture", organizationId: "tenant-fixture" };
  for (const [field, value] of Object.entries(secrets)) {
    assert.throws(() => validateGovernanceExportAdapterProfile(profile("ndjson", { [field]: value })), (error) => error.code === "GEA-PROFILE");
    assert.throws(() => mapGovernanceExportProjection({ profile: profile("ndjson"), projection: { ...projection("ndjson"), [field]: value } }), (error) => error.code === "GEA-MAP");
    assert.throws(() => mapGovernanceExportProjection({ profile: profile("ndjson"), projection: projection("ndjson", { eventType: "safe", [field]: value }) }), (error) => error.code === "GEA-MAP");
    assert.throws(() => validateGovernanceExportAcknowledgement({ schema: "pipeline.governance-export-acknowledgement.v1", profileId: "audit", batchId: "batch-1", acceptedDestinationEventIds: [sha("a")], rejectedDestinationEventIds: [], receiptId: "opaque-1", [field]: value }), (error) => error.code === "GEA-ACK");
  }
  const bindings = { eventId: "event-1", eventType: "lifecycle.dispatch", occurredAtEpochMs: 1, eventDigest: sha("d"), repositoryFingerprint: sha("e"), candidate: sha("f"), policyDigest: sha("0") };
  const values = [...Object.values(secrets)];
  for (const format of ["cloudevents-json", "otlp-json", "ndjson", "rfc5424"]) {
    const mapped = mapGovernanceExportProjection({ profile: profile(format), projection: projection(format, bindings) });
    const serialized = JSON.stringify(mapped);
    for (const value of values) assert.equal(serialized.includes(value), false, `${format} leaked ${value}`);
    assert.equal(mapped.sourceEventDigest, sha("c")); assert.equal(mapped.destinationEventId, sha("a"));
  }
  const ndjson = mapGovernanceExportProjection({ profile: profile("ndjson"), projection: projection("ndjson", bindings) });
  assert.deepEqual(JSON.parse(ndjson.payload).fields, bindings);
  const collector = createInMemoryGovernanceExportCollector({ profile: profile("ndjson") });
  const receipt = await collector.deliver({ batchId: "batch-1", mappings: [ndjson] });
  const delivered = JSON.stringify({ receipt, readback: collector.readback() });
  for (const value of values) assert.equal(delivered.includes(value), false);
  assert.deepEqual(receipt.acceptedDestinationEventIds, [sha("a")]);
});
test("profile and acknowledgements are closed, non-authoritative and deduplicated", () => {
  assert.equal(validateGovernanceExportAdapterProfile(profile("ndjson")).ordering, "per-stream");
  const ack = validateGovernanceExportAcknowledgement({ schema: "pipeline.governance-export-acknowledgement.v1", profileId: "audit", batchId: "batch-1", acceptedDestinationEventIds: [sha("a")], rejectedDestinationEventIds: [], receiptId: "opaque-1" });
  assert.equal(ack.receiptId, "opaque-1");
  assert.throws(() => validateGovernanceExportAcknowledgement({ ...ack, acceptedDestinationEventIds: [sha("a"), sha("a")] }), (error) => error.code === "GEA-ACK");
});
