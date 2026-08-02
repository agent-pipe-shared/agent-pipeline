// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { createGovernanceDeliveryReceipt, projectGovernanceEvent } from "./governance-event-projection.mjs";
import { sealGovernanceEvent } from "./governance-event.mjs";

const fingerprint = "f".repeat(64); const unavailable = { state: "not-applicable" };
function event() { return sealGovernanceEvent({ schema: "pipeline.governance-event-envelope.v1", payloadSchema: "pipeline.lifecycle-governance-event.v1", canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventId: "event-1", idempotencyKey: "event-1", origin: "lifecycle", authorityClass: "non-authoritative", eventType: "lifecycle.started", occurredAtEpochMs: 1, observedAtEpochMs: 1, timeAssurance: "unknown", repositoryFingerprint: fingerprint, sourceUri: `urn:pipeline:repository:${fingerprint}`, streamId: "lifecycle", sequence: 1, previousEventDigest: null, eventDigest: "a".repeat(64), correlation: { featureId: unavailable, packageId: unavailable, requestId: unavailable, sessionId: unavailable, dispatchId: unavailable, traceId: unavailable }, candidate: unavailable, artifacts: [unavailable], policy: { policyDigest: unavailable, configurationDigest: unavailable, capturePolicyDigest: unavailable, redactionPolicyDigest: unavailable }, classification: "repository-public-safe", storageProfile: "repository-public-safe", retentionCompatibility: "repository-retained", disclosureClass: "repository-visible", payloadDigest: "b".repeat(64), payload: { rationale: "never export this" } }); }
function policy(overrides = {}) { return { schema: "pipeline.governance-export-policy.v1", policyId: "siem-minimal", revision: "c".repeat(64), destinationProfile: "test-siem", format: "ndjson", allowedFields: ["eventId", "eventType", "eventDigest"], ...overrides }; }
test("denies policy-less exports and projects only explicitly allowed canonical fields", () => {
  assert.equal(projectGovernanceEvent({ event: event(), policy: null }).status, "denied"); const result = projectGovernanceEvent({ event: event(), policy: policy() }); assert.equal(result.status, "projected"); assert.deepEqual(Object.keys(result.projection.fields), ["eventDigest", "eventId", "eventType"]); assert.doesNotMatch(JSON.stringify(result.projection), /rationale|never export this|payload/);
});
test("rejects invalid source events and policy attempts to permit unknown/raw fields", () => {
  assert.equal(projectGovernanceEvent({ event: { bad: true }, policy: policy() }).status, "rejected"); assert.throws(() => projectGovernanceEvent({ event: event(), policy: policy({ allowedFields: ["payload"] }) }), (error) => error.code === "GEP-POLICY");
});
test("creates sanitized delivery receipts without destination coordinates or authority claims", () => {
  const receipt = createGovernanceDeliveryReceipt({ destinationProfile: "test-siem", policyRevision: "c".repeat(64), batchId: "batch-1", eventCount: 2, attempt: 1, acknowledgementClass: "partial", terminalDisposition: "retryable-failure", cursor: 1, lag: 1 }); assert.equal(receipt.schema, "pipeline.governance-delivery-receipt.v1"); assert.doesNotMatch(JSON.stringify(receipt), /endpoint|token|authority/);
});
