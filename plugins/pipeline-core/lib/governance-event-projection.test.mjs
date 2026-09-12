// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { buildGovernanceActionEvent } from "./governance-action-events.mjs";
import { createGovernanceDeliveryReceipt, projectGovernanceEvent } from "./governance-event-projection.mjs";
import { sealGovernanceEvent } from "./governance-event.mjs";

const fingerprint = "f".repeat(64); const unavailable = { state: "not-applicable" };
function event(overrides = {}) { return sealGovernanceEvent({ schema: "pipeline.governance-event-envelope.v1", payloadSchema: "pipeline.lifecycle-governance-event.v1", canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventId: "event-1", idempotencyKey: "event-1", origin: "lifecycle", authorityClass: "non-authoritative", eventType: "lifecycle.started", occurredAtEpochMs: 1, observedAtEpochMs: 1, timeAssurance: "unknown", repositoryFingerprint: fingerprint, sourceUri: `urn:pipeline:repository:${fingerprint}`, streamId: "lifecycle", sequence: 1, previousEventDigest: null, eventDigest: "a".repeat(64), correlation: { featureId: unavailable, packageId: unavailable, requestId: unavailable, sessionId: unavailable, dispatchId: unavailable, traceId: unavailable }, candidate: unavailable, artifacts: [unavailable], policy: { policyDigest: unavailable, configurationDigest: unavailable, capturePolicyDigest: unavailable, redactionPolicyDigest: unavailable }, classification: "repository-public-safe", storageProfile: "repository-public-safe", retentionCompatibility: "repository-retained", disclosureClass: "repository-visible", payloadDigest: "b".repeat(64), payload: { rationale: "never export this" }, ...overrides }); }
function actionEvent({ kind = "verification", reasonCode = "VERIFICATION_PASSED", requestId = "verify-request-1" } = {}) { const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) }; const payload = buildGovernanceActionEvent({ kind, status: "completed", reasonCode, requestId, featureId: unavailable, sessionId: unavailable, candidate }); return event({ payloadSchema: "pipeline.governance-action-event.v1", eventId: payload.eventId, idempotencyKey: payload.correlation.actionId, eventType: `lifecycle.action.${kind}`, correlation: { featureId: unavailable, packageId: unavailable, requestId: payload.correlation.requestId, sessionId: unavailable, dispatchId: unavailable, traceId: payload.correlation.actionId }, candidate, payload }); }
function policy(overrides = {}) { return { schema: "pipeline.governance-export-policy.v1", policyId: "siem-minimal", revision: "c".repeat(64), destinationProfile: "test-siem", format: "ndjson", allowedFields: ["eventId", "eventType", "eventDigest"], ...overrides }; }
test("denies policy-less exports and projects only explicitly allowed canonical fields", () => {
  assert.equal(projectGovernanceEvent({ event: event(), policy: null }).status, "denied"); const result = projectGovernanceEvent({ event: event(), policy: policy() }); assert.equal(result.status, "projected"); assert.deepEqual(Object.keys(result.projection.fields), ["eventDigest", "eventId", "eventType"]); assert.doesNotMatch(JSON.stringify(result.projection), /rationale|never export this|payload/);
});
test("rejects invalid source events and policy attempts to permit unknown/raw fields", () => {
  assert.equal(projectGovernanceEvent({ event: { bad: true }, policy: policy() }).status, "rejected"); assert.throws(() => projectGovernanceEvent({ event: event(), policy: policy({ allowedFields: ["payload"] }) }), (error) => error.code === "GEP-POLICY");
});
test("creates sanitized delivery receipts without destination coordinates or authority claims", () => {
  const receipt = createGovernanceDeliveryReceipt({ destinationProfile: "test-siem", policyRevision: "c".repeat(64), projectionDigest: "d".repeat(64), batchId: "batch-1", eventCount: 2, attempt: 1, acknowledgementClass: "partial", terminalDisposition: "retryable-failure", cursor: 1, lag: 1 }); assert.equal(receipt.schema, "pipeline.governance-delivery-receipt.v1"); assert.doesNotMatch(JSON.stringify(receipt), /endpoint|token|authority/);
});
test("projects action envelopes through the unchanged envelope-only allowlist", () => {
  for (const action of [
    actionEvent(),
    actionEvent({ kind: "gate", reasonCode: "PUSH_APPROVED", requestId: "approval-subject-digest" }),
    actionEvent({ kind: "recovery", reasonCode: "RECOVERY_COMPLETED", requestId: "recovery-plan-digest" }),
    actionEvent({ kind: "reconciliation", reasonCode: "RECONCILIATION_COMPLETED", requestId: "reconciliation-plan-digest" }),
  ]) {
    const result = projectGovernanceEvent({ event: action, policy: policy() });
    assert.equal(result.status, "projected");
    assert.deepEqual(Object.keys(result.projection.fields), ["eventDigest", "eventId", "eventType"]);
    assert.doesNotMatch(JSON.stringify(result.projection), /verify-request-1|approval-subject-digest|recovery-plan-digest|reconciliation-plan-digest|actionId|reasonCode|VERIFICATION_PASSED|PUSH_APPROVED|RECOVERY_COMPLETED|RECONCILIATION_COMPLETED|payload/);
  }
});
