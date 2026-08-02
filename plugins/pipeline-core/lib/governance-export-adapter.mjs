// SPDX-License-Identifier: SUL-1.0
/**
 * Provider-neutral, outbound-only governance-export profile mapping.
 *
 * This is intentionally below the default-deny projection boundary: it only
 * accepts a sanitized projection, never a canonical payload or an endpoint.
 * A future Cyborg human-authority proof is not consumed here: an external
 * acknowledgement remains observation evidence and must never authorize work.
 */
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const FORMATS = new Set(["cloudevents-json", "otlp-json", "ndjson", "rfc5424"]);
const ACKNOWLEDGEMENTS = new Set(["per-event", "per-batch"]);
const ORDERING = new Set(["per-stream", "none"]);
const EXPORT_FIELDS = new Set(["eventId", "eventType", "occurredAtEpochMs", "eventDigest", "repositoryFingerprint", "correlation", "candidate", "policyDigest"]);

function fail(code) { const error = new Error("Governance export adapter input is invalid."); error.code = code; throw error; }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function projection(value) {
  return exact(value, ["schema", "destinationEventId", "destinationProfile", "format", "policyRevision", "sourceEventDigest", "fields"])
    && value.schema === "pipeline.governance-export-event.v1"
    && SHA.test(value.destinationEventId) && ID.test(value.destinationProfile) && FORMATS.has(value.format)
    && SHA.test(value.policyRevision) && SHA.test(value.sourceEventDigest) && object(value.fields);
}
function freeze(value) { return Object.freeze(value); }
function string(value, fallback = "unknown") { return typeof value === "string" && value !== "" ? value : fallback; }
function isoTime(value) { return Number.isSafeInteger(value) && value >= 0 ? new Date(value).toISOString() : null; }
function escapedSyslog(value) { return string(value).replace(/[\\"][\r\n]/gu, (character) => ({ "\\": "\\\\", "\"": "\\\"", "\r": "", "\n": "" })[character]); }

/** Describes a non-secret adapter capability; endpoint/authentication stay operator-local. */
export function validateGovernanceExportAdapterProfile(profile) {
  const keys = ["schema", "profileId", "format", "adapterVersion", "maxBatchEvents", "maxPayloadBytes", "acknowledgement", "ordering", "deduplication"];
  if (!exact(profile, keys) || profile.schema !== "pipeline.governance-export-adapter-profile.v1" || !ID.test(profile.profileId)
    || !FORMATS.has(profile.format) || !ID.test(profile.adapterVersion)
    || !Number.isSafeInteger(profile.maxBatchEvents) || profile.maxBatchEvents < 1 || profile.maxBatchEvents > 1000
    || !Number.isSafeInteger(profile.maxPayloadBytes) || profile.maxPayloadBytes < 256 || profile.maxPayloadBytes > 10_000_000
    || !ACKNOWLEDGEMENTS.has(profile.acknowledgement) || !ORDERING.has(profile.ordering)
    || typeof profile.deduplication !== "boolean") fail("GEA-PROFILE");
  return freeze({ ...profile });
}

function cloudEvents(item) {
  const fields = item.fields;
  const time = isoTime(fields.occurredAtEpochMs);
  return {
    specversion: "1.0",
    id: item.destinationEventId,
    source: `urn:pipeline:governance-export:${item.destinationProfile}`,
    type: string(fields.eventType, "pipeline.governance.unknown"),
    subject: `urn:pipeline:source-event:${item.sourceEventDigest}`,
    ...(time === null ? {} : { time }),
    dataschema: "pipeline.governance-export-event.v1",
    data: clone(item),
  };
}
function otlp(item) {
  const fields = item.fields;
  const time = Number.isSafeInteger(fields.occurredAtEpochMs) && fields.occurredAtEpochMs >= 0 ? String(BigInt(fields.occurredAtEpochMs) * 1_000_000n) : undefined;
  return {
    resourceLogs: [{
      resource: { attributes: [{ key: "service.name", value: { stringValue: "agent-pipeline" } }, { key: "pipeline.destination_profile", value: { stringValue: item.destinationProfile } }] },
      scopeLogs: [{
        scope: { name: "pipeline.governance-export", version: "v1" },
        logRecords: [{
          ...(time === undefined ? {} : { timeUnixNano: time }),
          severityText: "INFO",
          body: { stringValue: JSON.stringify(clone(item.fields)) },
          attributes: [
            { key: "event.name", value: { stringValue: string(fields.eventType, "pipeline.governance.unknown") } },
            { key: "pipeline.destination_event_id", value: { stringValue: item.destinationEventId } },
            { key: "pipeline.source_event_digest", value: { stringValue: item.sourceEventDigest } },
            { key: "pipeline.policy_revision", value: { stringValue: item.policyRevision } },
          ],
        }],
      }],
    }],
  };
}
function rfc5424(item) {
  const fields = item.fields;
  const timestamp = isoTime(fields.occurredAtEpochMs) ?? "-";
  const message = escapedSyslog(fields.eventType);
  return `<14>1 ${timestamp} pipeline - - ${item.destinationEventId} [pipeline@32473 destination_profile="${escapedSyslog(item.destinationProfile)}" source_event_digest="${item.sourceEventDigest}" policy_revision="${item.policyRevision}"] ${message}`;
}

/** Maps one already-sanitized event into a standards-aligned interchange shape. */
export function mapGovernanceExportProjection({ profile, projection: item } = {}) {
  const active = validateGovernanceExportAdapterProfile(profile);
  if (!projection(item) || Object.keys(item.fields).some((field) => !EXPORT_FIELDS.has(field)) || item.destinationProfile !== active.profileId || item.format !== active.format) fail("GEA-MAP");
  const payload = active.format === "cloudevents-json" ? cloudEvents(item)
    : active.format === "otlp-json" ? otlp(item)
      : active.format === "ndjson" ? `${JSON.stringify(clone(item))}\n`
        : rfc5424(item);
  const bytes = Buffer.byteLength(typeof payload === "string" ? payload : JSON.stringify(payload), "utf8");
  if (bytes > active.maxPayloadBytes) fail("GEA-PAYLOAD-LIMIT");
  return freeze({ schema: "pipeline.governance-export-mapping.v1", profileId: active.profileId, format: active.format, sourceEventDigest: item.sourceEventDigest, destinationEventId: item.destinationEventId, payload: freeze(clone(payload)), payloadBytes: bytes, loss: freeze([]) });
}

/** Validates an untrusted adapter acknowledgement before it can update the local outbox. */
export function validateGovernanceExportAcknowledgement(receipt) {
  const keys = ["schema", "profileId", "batchId", "acceptedDestinationEventIds", "rejectedDestinationEventIds", "receiptId"];
  if (!exact(receipt, keys) || receipt.schema !== "pipeline.governance-export-acknowledgement.v1" || !ID.test(receipt.profileId) || !ID.test(receipt.batchId)
    || !Array.isArray(receipt.acceptedDestinationEventIds) || !Array.isArray(receipt.rejectedDestinationEventIds)
    || ![...receipt.acceptedDestinationEventIds, ...receipt.rejectedDestinationEventIds].every((id) => SHA.test(id))
    || new Set(receipt.acceptedDestinationEventIds).size !== receipt.acceptedDestinationEventIds.length
    || new Set(receipt.rejectedDestinationEventIds).size !== receipt.rejectedDestinationEventIds.length
    || receipt.acceptedDestinationEventIds.some((id) => receipt.rejectedDestinationEventIds.includes(id))
    || (receipt.receiptId !== null && !ID.test(receipt.receiptId))) fail("GEA-ACK");
  return freeze({ ...receipt, acceptedDestinationEventIds: freeze([...receipt.acceptedDestinationEventIds]), rejectedDestinationEventIds: freeze([...receipt.rejectedDestinationEventIds]) });
}

/**
 * A local conformance collector. It is deliberately observational: this
 * acknowledgement only advances an outbound outbox and cannot become Cyborg or
 * human authority for a Pipeline decision, release, or lifecycle transition.
 */
export function createInMemoryGovernanceExportCollector({ profile } = {}) {
  const active = validateGovernanceExportAdapterProfile(profile); const batches = [];
  return freeze({
    profile: active,
    async deliver({ batchId, mappings } = {}) {
      if (!ID.test(batchId ?? "") || !Array.isArray(mappings) || mappings.length > active.maxBatchEvents || mappings.some((mapping) => mapping?.profileId !== active.profileId || mapping?.format !== active.format || !SHA.test(mapping?.destinationEventId ?? ""))) fail("GEA-DELIVER");
      batches.push(freeze({ batchId, mappings: freeze(mappings.map((mapping) => freeze(clone(mapping)))) }));
      return validateGovernanceExportAcknowledgement({ schema: "pipeline.governance-export-acknowledgement.v1", profileId: active.profileId, batchId, acceptedDestinationEventIds: mappings.map((mapping) => mapping.destinationEventId), rejectedDestinationEventIds: [], receiptId: `memory-${batchId}` });
    },
    readback() { return freeze(batches.map((batch) => freeze(clone(batch)))); },
  });
}
