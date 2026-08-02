// SPDX-License-Identifier: SUL-1.0
/** Default-deny sanitation boundary before every export queue or transport. */
import { createHash } from "node:crypto";
import { validateGovernanceEventEnvelope } from "./governance-event.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u; const SHA = /^[a-f0-9]{64}$/u; const FORMATS = new Set(["cloudevents-json", "otlp-json", "ndjson", "rfc5424"]); const FIELDS = new Set(["eventId", "eventType", "occurredAtEpochMs", "eventDigest", "repositoryFingerprint", "correlation", "candidate", "policyDigest"]);
function fail(code) { const error = new Error("Governance export input is invalid."); error.code = code; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function safeValue(value) { return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || (value !== null && typeof value === "object") ? JSON.parse(JSON.stringify(value)) : null; }
export function validateGovernanceExportPolicy(policy) {
  if (!exact(policy, ["schema", "policyId", "revision", "destinationProfile", "format", "allowedFields"]) || policy.schema !== "pipeline.governance-export-policy.v1" || !ID.test(policy.policyId) || !SHA.test(policy.revision) || !ID.test(policy.destinationProfile) || !FORMATS.has(policy.format) || !Array.isArray(policy.allowedFields) || policy.allowedFields.length === 0 || new Set(policy.allowedFields).size !== policy.allowedFields.length || policy.allowedFields.some((field) => !FIELDS.has(field))) fail("GEP-POLICY");
  return Object.freeze({ ...policy, allowedFields: Object.freeze([...policy.allowedFields].sort()) });
}
/** A missing policy denies the destination; payloads, free text and credentials never cross this API. */
export function projectGovernanceEvent({ event, policy } = {}) {
  const validated = validateGovernanceEventEnvelope(event); if (!validated.valid) return Object.freeze({ schema: "pipeline.governance-export-projection.v1", status: "rejected", reason: "invalid-source", projection: null });
  if (policy === null || policy === undefined) return Object.freeze({ schema: "pipeline.governance-export-projection.v1", status: "denied", reason: "policy-absent", projection: null });
  const active = validateGovernanceExportPolicy(policy); const values = { eventId: event.eventId, eventType: event.eventType, occurredAtEpochMs: event.occurredAtEpochMs, eventDigest: event.eventDigest, repositoryFingerprint: event.repositoryFingerprint, correlation: event.correlation, candidate: event.candidate, policyDigest: event.policy.policyDigest };
  const fields = Object.fromEntries(active.allowedFields.map((field) => [field, safeValue(values[field])])); const destinationEventId = createHash("sha256").update(`pipeline.export.v1\0${active.destinationProfile}\0${event.eventDigest}`).digest("hex");
  return Object.freeze({ schema: "pipeline.governance-export-projection.v1", status: "projected", reason: null, projection: Object.freeze({ schema: "pipeline.governance-export-event.v1", destinationEventId, destinationProfile: active.destinationProfile, format: active.format, policyRevision: active.revision, sourceEventDigest: event.eventDigest, fields: Object.freeze(fields) }) });
}
export function createGovernanceDeliveryReceipt(input) {
  if (!exact(input, ["destinationProfile", "policyRevision", "batchId", "eventCount", "attempt", "acknowledgementClass", "terminalDisposition", "cursor", "lag"]) || !ID.test(input.destinationProfile) || !SHA.test(input.policyRevision) || !ID.test(input.batchId) || !Number.isSafeInteger(input.eventCount) || input.eventCount < 0 || !Number.isSafeInteger(input.attempt) || input.attempt < 1 || !new Set(["none", "partial", "accepted"]).has(input.acknowledgementClass) || !new Set(["pending", "delivered", "retryable-failure", "quarantined"]).has(input.terminalDisposition) || !Number.isSafeInteger(input.cursor) || input.cursor < 0 || !Number.isSafeInteger(input.lag) || input.lag < 0) fail("GEP-RECEIPT");
  return Object.freeze({ schema: "pipeline.governance-delivery-receipt.v1", ...input });
}
