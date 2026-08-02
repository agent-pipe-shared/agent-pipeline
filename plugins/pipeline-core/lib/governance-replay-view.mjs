// SPDX-License-Identifier: SUL-1.0
/** Builds an offline, non-authoritative human view from the verified replay readback. */

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const KINDS = new Set(["dispatch", "status", "cancellation", "candidate-invalidation", "verification", "review", "gate", "recovery", "reconciliation"]);
const STATUSES = new Set(["proposed", "active", "completed", "failed", "cancelled", "unknown", "unavailable", "invalidated"]);

function fail(code) { const error = new Error("Governance replay view is invalid."); error.code = code; throw error; }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function nullableId(value) { return value === null || (typeof value === "string" && ID.test(value)); }

function validateEvent(event) {
  const keys = ["sequence", "eventDigest", "occurredAtEpochMs", "kind", "status", "reasonCode", "correlation", "candidate", "eventId", "invalidatesEventId", "supersedesEventId"];
  if (!exact(event, keys) || !Number.isSafeInteger(event.sequence) || event.sequence < 1 || typeof event.eventDigest !== "string" || !/^[a-f0-9]{64}$/u.test(event.eventDigest) || !Number.isSafeInteger(event.occurredAtEpochMs) || !KINDS.has(event.kind) || !STATUSES.has(event.status) || typeof event.reasonCode !== "string" || !/^[A-Z][A-Z0-9._:-]{0,127}$/u.test(event.reasonCode) || !ID.test(event.eventId) || !nullableId(event.invalidatesEventId) || !nullableId(event.supersedesEventId)) fail("GRV-EVENT");
  if (!exact(event.correlation, ["packageId", "dispatchId", "attemptId", "workerId"]) || !Object.values(event.correlation).every((value) => typeof value === "string" && ID.test(value))) fail("GRV-CORRELATION");
  if (!exact(event.candidate, ["commit", "tree"]) || !OID.test(event.candidate.commit) || !OID.test(event.candidate.tree)) fail("GRV-CANDIDATE");
  return Object.freeze({ ...event, correlation: Object.freeze({ ...event.correlation }), candidate: Object.freeze({ ...event.candidate }) });
}

function validateTimeline(timeline) {
  if (!exact(timeline, ["schema", "authority", "dispatchId", "status", "events"]) || timeline.schema !== "pipeline.governance-replay.v1" || timeline.authority !== "non-authoritative" || !ID.test(timeline.dispatchId) || !["observed", "invalidated"].includes(timeline.status) || !Array.isArray(timeline.events)) fail("GRV-TIMELINE");
  const events = timeline.events.map(validateEvent);
  if (events.some((event) => event.correlation.dispatchId !== timeline.dispatchId)) fail("GRV-DISPATCH");
  return Object.freeze({ dispatchId: timeline.dispatchId, status: timeline.status, events: Object.freeze(events) });
}

/**
 * Converts the read-only replay result to a closed, static view model.
 * This remains a display-only integration point: a future Cyborg attestation
 * must be verified by its dedicated human-authority verifier before it can
 * appear as a separately labelled fact.
 */
export function buildGovernanceReplayViewModel(readback) {
  if (!record(readback) || readback.schema !== "pipeline.governance-replay-readback.v1" || readback.authority !== "non-authoritative" || !["observed", "unavailable"].includes(readback.status) || !Array.isArray(readback.timelines)) fail("GRV-READBACK");
  if (readback.status === "unavailable") {
    if (!exact(readback, ["schema", "status", "authority", "reason", "timelines"]) || typeof readback.reason !== "string" || readback.timelines.length !== 0) fail("GRV-UNAVAILABLE");
    return Object.freeze({ schema: "pipeline.governance-replay-view.v1", authority: "non-authoritative", state: "unavailable", reason: readback.reason, timelines: Object.freeze([]), topology: Object.freeze([]) });
  }
  if (!exact(readback, ["schema", "status", "authority", "reason", "checkpoint", "timelines"]) || readback.reason !== null || !record(readback.checkpoint)) fail("GRV-READBACK");
  const timelines = readback.timelines.map(validateTimeline).sort((left, right) => left.dispatchId.localeCompare(right.dispatchId));
  const topology = new Map();
  for (const timeline of timelines) for (const event of timeline.events) {
    const key = `${event.correlation.packageId}\u0000${event.correlation.workerId}\u0000${event.correlation.attemptId}`;
    const entry = topology.get(key) ?? { packageId: event.correlation.packageId, workerId: event.correlation.workerId, attemptId: event.correlation.attemptId, dispatchIds: new Set(), eventCount: 0 };
    entry.dispatchIds.add(timeline.dispatchId); entry.eventCount += 1; topology.set(key, entry);
  }
  const nodes = [...topology.values()].map((entry) => Object.freeze({ packageId: entry.packageId, workerId: entry.workerId, attemptId: entry.attemptId, dispatchIds: Object.freeze([...entry.dispatchIds].sort()), eventCount: entry.eventCount })).sort((left, right) => `${left.packageId}:${left.workerId}:${left.attemptId}`.localeCompare(`${right.packageId}:${right.workerId}:${right.attemptId}`));
  return Object.freeze({ schema: "pipeline.governance-replay-view.v1", authority: "non-authoritative", state: "observed", reason: null, timelines: Object.freeze(timelines), topology: Object.freeze(nodes) });
}
