// SPDX-License-Identifier: SUL-1.0
/** Pure per-destination outbox state machine; persistence is an adapter concern. */
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u; const SHA = /^[a-f0-9]{64}$/u;
function fail(code) { const error = new Error("Governance export outbox is invalid."); error.code = code; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function projection(value) { return exact(value, ["schema", "destinationEventId", "destinationProfile", "format", "policyRevision", "sourceEventDigest", "fields"]) && value.schema === "pipeline.governance-export-event.v1" && SHA.test(value.destinationEventId) && ID.test(value.destinationProfile) && SHA.test(value.policyRevision) && SHA.test(value.sourceEventDigest) && value.fields !== null && typeof value.fields === "object" && !Array.isArray(value.fields); }
function state(value) { return exact(value, ["schema", "destinationProfile", "policyRevision", "cursor", "entries"]) && value.schema === "pipeline.governance-export-outbox.v1" && ID.test(value.destinationProfile) && SHA.test(value.policyRevision) && Number.isSafeInteger(value.cursor) && value.cursor >= 0 && Array.isArray(value.entries) && value.entries.every((entry, index) => exact(entry, ["sequence", "projection", "attempts", "status"]) && entry.sequence === index + 1 && projection(entry.projection) && Number.isSafeInteger(entry.attempts) && entry.attempts >= 0 && new Set(["pending", "acknowledged", "quarantined"]).has(entry.status)); }
function relaxedProjectionShape(value) { return exact(value, ["schema", "destinationEventId", "destinationProfile", "format", "policyRevision", "sourceEventDigest", "fields"]) && value.schema === "pipeline.governance-export-event.v1" && typeof value.destinationEventId === "string" && ID.test(value.destinationProfile) && typeof value.policyRevision === "string" && typeof value.sourceEventDigest === "string" && value.fields !== null && typeof value.fields === "object" && !Array.isArray(value.fields); }
function relaxedEntriesShape(value) { return Array.isArray(value.entries) && value.entries.every((entry, index) => exact(entry, ["sequence", "projection", "attempts", "status"]) && entry.sequence === index + 1 && relaxedProjectionShape(entry.projection) && Number.isSafeInteger(entry.attempts) && entry.attempts >= 0 && new Set(["pending", "acknowledged", "quarantined"]).has(entry.status)); }
function cursorWithinBounds(value) { return value.cursor <= value.entries.length; }
function hasSourceFork(value) { const seen = new Set(); for (const entry of value.entries) { if (seen.has(entry.projection.sourceEventDigest)) return true; seen.add(entry.projection.sourceEventDigest); } return false; }
function hasInvalidDigest(value) { return value.entries.some((entry) => !SHA.test(entry.projection.destinationEventId) || !SHA.test(entry.projection.policyRevision) || !SHA.test(entry.projection.sourceEventDigest)); }
/** Detects three E-AC-08 defect classes with their own typed code before the generic GEO-STATE check runs; a value that is not otherwise structurally sound (wrong schema, wrong fields, ...) falls through untouched to the generic check. */
function checkStateDetail(value) { if (!exact(value, ["schema", "destinationProfile", "policyRevision", "cursor", "entries"]) || value.schema !== "pipeline.governance-export-outbox.v1" || !ID.test(value.destinationProfile) || !SHA.test(value.policyRevision) || !Number.isSafeInteger(value.cursor) || value.cursor < 0 || !relaxedEntriesShape(value)) return; if (hasInvalidDigest(value)) fail("GEO-INVALID-DIGEST"); if (!cursorWithinBounds(value)) fail("GEO-CURSOR-BOUND"); if (hasSourceFork(value)) fail("GEO-FORK"); }
function freeze(value) { return Object.freeze(value); }
function frozenState(value) { return freeze({ ...value, entries: freeze(value.entries.map((entry) => freeze({ ...entry, projection: freeze({ ...entry.projection, fields: freeze({ ...entry.projection.fields }) }) }))) }); }
export function validateGovernanceExportOutbox(value) { checkStateDetail(value); if (!state(value)) fail("GEO-STATE"); return frozenState(value); }
export function createGovernanceExportOutbox({ destinationProfile, policyRevision } = {}) { if (!ID.test(destinationProfile ?? "") || !SHA.test(policyRevision ?? "")) fail("GEO-CREATE"); return frozenState({ schema: "pipeline.governance-export-outbox.v1", destinationProfile, policyRevision, cursor: 0, entries: [] }); }
export function enqueueGovernanceExport(outbox, item) {
  checkStateDetail(outbox); if (!state(outbox) || !projection(item) || item.destinationProfile !== outbox.destinationProfile || item.policyRevision !== outbox.policyRevision) fail("GEO-ENQUEUE"); if (outbox.entries.some((entry) => entry.projection.sourceEventDigest === item.sourceEventDigest)) return outbox;
  return frozenState({ ...outbox, entries: [...outbox.entries, { sequence: outbox.entries.length + 1, projection: item, attempts: 0, status: "pending" }] });
}
/** Acknowledgements advance only the contiguous confirmed prefix; all other entries remain recoverable. */
export function applyGovernanceExportDelivery(outbox, { attempt, acceptedDestinationEventIds, quarantinedDestinationEventIds = [] } = {}) {
  checkStateDetail(outbox); if (!state(outbox) || !Number.isSafeInteger(attempt) || attempt < 1 || !Array.isArray(acceptedDestinationEventIds) || !Array.isArray(quarantinedDestinationEventIds) || new Set(acceptedDestinationEventIds).size !== acceptedDestinationEventIds.length || new Set(quarantinedDestinationEventIds).size !== quarantinedDestinationEventIds.length || [...acceptedDestinationEventIds, ...quarantinedDestinationEventIds].some((id) => !SHA.test(id))) fail("GEO-DELIVERY");
  const accepted = new Set(acceptedDestinationEventIds); const quarantined = new Set(quarantinedDestinationEventIds); if ([...accepted].some((id) => quarantined.has(id))) fail("GEO-DELIVERY"); const known = new Set(outbox.entries.map((entry) => entry.projection.destinationEventId)); if ([...accepted, ...quarantined].some((id) => !known.has(id))) fail("GEO-DELIVERY");
  const entries = outbox.entries.map((entry) => entry.status !== "pending" ? entry : { ...entry, attempts: Math.max(entry.attempts, attempt), status: accepted.has(entry.projection.destinationEventId) ? "acknowledged" : quarantined.has(entry.projection.destinationEventId) ? "quarantined" : "pending" }); let cursor = outbox.cursor;
  while (entries[cursor]?.status === "acknowledged") cursor += 1;
  return frozenState({ ...outbox, cursor, entries });
}
export function nextGovernanceExportBatch(outbox, { maxEvents } = {}) { if (!state(outbox) || !Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 1000) fail("GEO-BATCH"); return freeze(outbox.entries.filter((entry) => entry.status === "pending").slice(0, maxEvents).map((entry) => freeze({ sequence: entry.sequence, projection: entry.projection, attempts: entry.attempts }))); }
/**
 * E-AC-10: a pure, read-only gate for one named lifecycle boundary
 * (release/promotion/publication/...). Blocks only when entries at/after
 * the outbox cursor are not yet "acknowledged" -- the exact prefix
 * applyGovernanceExportDelivery already maintains, never a second mutation
 * path. Never mutates the outbox and never blocks any boundary other than
 * the one it was asked to evaluate.
 */
export function evaluateGovernanceExportBoundaryGate(outbox, { boundary } = {}) {
  const queue = validateGovernanceExportOutbox(outbox); if (!ID.test(boundary ?? "")) fail("GEO-BOUNDARY");
  let cursor = queue.cursor; while (queue.entries[cursor]?.status === "acknowledged") cursor += 1;
  const unacknowledged = queue.entries.slice(cursor).filter((entry) => entry.status !== "acknowledged");
  if (unacknowledged.length === 0) return freeze({ schema: "pipeline.governance-export-boundary-gate.v1", boundary, destinationProfile: queue.destinationProfile, blocked: false });
  const entries = freeze(unacknowledged.map((entry) => freeze({ sequence: entry.sequence, status: entry.status, destinationEventId: entry.projection.destinationEventId, sourceEventDigest: entry.projection.sourceEventDigest })));
  const statuses = new Set(entries.map((entry) => entry.status));
  const recovery = freeze({
    ...(statuses.has("pending") ? { pending: "Pending entries advance to acknowledged only via applyGovernanceExportDelivery (this module), driven by an adapter's accepted acknowledgement -- see deliverGovernanceExportBatch in governance-export-delivery.mjs for the end-to-end path." } : {}),
    ...(statuses.has("quarantined") ? { quarantined: "No mechanism in this module or its siblings currently moves a quarantined entry to acknowledged -- disclosed residual, out of scope for E-AC-10." } : {}),
  });
  return freeze({ schema: "pipeline.governance-export-boundary-gate.v1", boundary, destinationProfile: queue.destinationProfile, blocked: true, range: freeze({ fromSequence: entries[0].sequence, toSequence: entries[entries.length - 1].sequence, count: entries.length, entries }), recovery });
}
