// SPDX-License-Identifier: SUL-1.0
/** Builds an offline, non-authoritative human view from the verified replay readback. */
import { validateGovernanceActionEvent } from "./governance-action-events.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const KINDS = new Set(["dispatch", "status", "candidate-invalidation", "verification", "review", "gate", "recovery", "reconciliation"]);
const STATUSES = new Set(["proposed", "active", "completed", "failed", "cancelled", "unknown", "unavailable", "invalidated"]);
const ACTION_KINDS = new Set(["verification", "review", "gate", "recovery", "reconciliation"]);
const ACTION_STATUSES = new Set(["completed", "failed", "unknown", "unavailable"]);
const NOT_APPLICABLE = (value) => exact(value, ["state"]) && value.state === "not-applicable";

function fail(code) { const error = new Error("Governance replay view is invalid."); error.code = code; throw error; }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function nullableId(value) { return value === null || (typeof value === "string" && ID.test(value)); }
function sourceIdentity(value) { return (typeof value === "string" && ID.test(value)) || NOT_APPLICABLE(value); }
function validCheckpoint(value) { return exact(value, ["repositoryFingerprint", "streamId", "sequence", "eventDigest", "candidateCommit", "candidateTree"]) && /^[a-f0-9]{64}$/u.test(value.repositoryFingerprint) && value.streamId === "lifecycle" && Number.isSafeInteger(value.sequence) && value.sequence >= 1 && /^[a-f0-9]{64}$/u.test(value.eventDigest) && OID.test(value.candidateCommit) && OID.test(value.candidateTree); }

function validateEvent(event) {
  const keys = ["sequence", "eventDigest", "occurredAtEpochMs", "kind", "status", "reasonCode", "correlation", "candidate", "eventId", "invalidatesEventId", "supersedesEventId"];
  if (!exact(event, keys) || !Number.isSafeInteger(event.sequence) || event.sequence < 1 || typeof event.eventDigest !== "string" || !/^[a-f0-9]{64}$/u.test(event.eventDigest) || !Number.isSafeInteger(event.occurredAtEpochMs) || !KINDS.has(event.kind) || !STATUSES.has(event.status) || typeof event.reasonCode !== "string" || !/^[A-Z][A-Z0-9._:-]{0,127}$/u.test(event.reasonCode) || !ID.test(event.eventId) || !nullableId(event.invalidatesEventId) || !nullableId(event.supersedesEventId)) fail("GRV-EVENT");
  if (!exact(event.correlation, ["packageId", "dispatchId", "attemptId", "workerId", "correlationId", "queueRevision"]) || !["packageId", "dispatchId", "attemptId", "workerId", "correlationId"].every((key) => typeof event.correlation[key] === "string" && ID.test(event.correlation[key])) || !Number.isSafeInteger(event.correlation.queueRevision) || event.correlation.queueRevision < 0) fail("GRV-CORRELATION");
  if (!exact(event.candidate, ["commit", "tree"]) || !OID.test(event.candidate.commit) || !OID.test(event.candidate.tree)) fail("GRV-CANDIDATE");
  return Object.freeze({ ...event, correlation: Object.freeze({ ...event.correlation }), candidate: Object.freeze({ ...event.candidate }) });
}

function validateTimeline(timeline) {
  if (!exact(timeline, ["schema", "authority", "dispatchId", "status", "events"]) || timeline.schema !== "pipeline.governance-replay.v1" || timeline.authority !== "non-authoritative" || !ID.test(timeline.dispatchId) || !["observed", "invalidated"].includes(timeline.status) || !Array.isArray(timeline.events)) fail("GRV-TIMELINE");
  const events = timeline.events.map(validateEvent);
  if (events.some((event) => event.correlation.dispatchId !== timeline.dispatchId)) fail("GRV-DISPATCH");
  return Object.freeze({ dispatchId: timeline.dispatchId, status: timeline.status, events: Object.freeze(events) });
}

function validateActionEvent(event) {
  const keys = ["sequence", "eventDigest", "occurredAtEpochMs", "kind", "status", "reasonCode", "correlation", "candidate", "eventId"];
  if (!exact(event, keys) || !Number.isSafeInteger(event.sequence) || event.sequence < 1 || typeof event.eventDigest !== "string" || !/^[a-f0-9]{64}$/u.test(event.eventDigest) || !Number.isSafeInteger(event.occurredAtEpochMs) || !ACTION_KINDS.has(event.kind) || !ACTION_STATUSES.has(event.status) || typeof event.reasonCode !== "string" || !/^[A-Z][A-Z0-9._:-]{0,127}$/u.test(event.reasonCode) || typeof event.eventId !== "string" || !/^[a-f0-9]{64}$/u.test(event.eventId)) fail("GRV-ACTION-EVENT");
  if (!exact(event.correlation, ["actionId", "featureId", "requestId", "sessionId"]) || typeof event.correlation.actionId !== "string" || !/^[a-f0-9]{64}$/u.test(event.correlation.actionId) || typeof event.correlation.requestId !== "string" || !ID.test(event.correlation.requestId) || !sourceIdentity(event.correlation.featureId) || !sourceIdentity(event.correlation.sessionId)) fail("GRV-ACTION-CORRELATION");
  if (!exact(event.candidate, ["commit", "tree"]) || !OID.test(event.candidate.commit) || !OID.test(event.candidate.tree)) fail("GRV-CANDIDATE");
  let payload; try { payload = validateGovernanceActionEvent({ eventId: event.eventId, kind: event.kind, status: event.status, reasonCode: event.reasonCode, correlation: event.correlation, candidate: event.candidate }); } catch { fail("GRV-ACTION-EVENT"); }
  return Object.freeze({ sequence: event.sequence, eventDigest: event.eventDigest, occurredAtEpochMs: event.occurredAtEpochMs, ...payload });
}

function validateActionTimeline(timeline) {
  if (!exact(timeline, ["schema", "authority", "actionId", "status", "events"]) || timeline.schema !== "pipeline.governance-action-replay.v1" || timeline.authority !== "non-authoritative" || typeof timeline.actionId !== "string" || !/^[a-f0-9]{64}$/u.test(timeline.actionId) || timeline.status !== "observed" || !Array.isArray(timeline.events)) fail("GRV-ACTION-TIMELINE");
  const events = timeline.events.map(validateActionEvent);
  if (events.some((event) => event.correlation.actionId !== timeline.actionId)) fail("GRV-ACTION-ID");
  return Object.freeze({ actionId: timeline.actionId, status: timeline.status, events: Object.freeze(events) });
}
function validateV2History(checkpoint, dispatchTimelines, actionTimelines) {
  const events = [...dispatchTimelines, ...actionTimelines].flatMap((timeline) => timeline.events).sort((left, right) => left.sequence - right.sequence);
  if (events.length === 0 || events.some((event, index) => index > 0 && events[index - 1].sequence === event.sequence)) fail("GRV-SEQUENCE-FORK");
  const last = events.at(-1);
  if (checkpoint.sequence !== last.sequence || checkpoint.eventDigest !== last.eventDigest || checkpoint.candidateCommit !== last.candidate.commit || checkpoint.candidateTree !== last.candidate.tree) fail("GRV-CHECKPOINT");
}

/**
 * Converts the read-only replay result to a closed, static view model.
 * This remains a display-only integration point: a future Cyborg attestation
 * must be verified by its dedicated human-authority verifier before it can
 * appear as a separately labelled fact.
 */
export function buildGovernanceReplayViewModel(readback) {
  if (!record(readback) || !["pipeline.governance-replay-readback.v1", "pipeline.governance-replay-readback.v2"].includes(readback.schema) || readback.authority !== "non-authoritative" || !["observed", "unavailable"].includes(readback.status)) fail("GRV-READBACK");
  const legacy = readback.schema === "pipeline.governance-replay-readback.v1";
  if (legacy ? !Array.isArray(readback.timelines) : !Array.isArray(readback.dispatchTimelines) || !Array.isArray(readback.actionTimelines)) fail("GRV-READBACK");
  if (readback.status === "unavailable") {
    const keys = legacy ? ["schema", "status", "authority", "reason", "timelines"] : ["schema", "status", "authority", "reason", "dispatchTimelines", "actionTimelines"];
    if (!exact(readback, keys) || typeof readback.reason !== "string" || (legacy ? readback.timelines.length !== 0 : readback.dispatchTimelines.length !== 0 || readback.actionTimelines.length !== 0)) fail("GRV-UNAVAILABLE");
    return Object.freeze({ schema: "pipeline.governance-replay-view.v2", authority: "non-authoritative", state: "unavailable", reason: readback.reason, dispatchTimelines: Object.freeze([]), actionTimelines: Object.freeze([]), topology: Object.freeze([]) });
  }
  const keys = legacy ? ["schema", "status", "authority", "reason", "checkpoint", "timelines"] : ["schema", "status", "authority", "reason", "checkpoint", "dispatchTimelines", "actionTimelines"];
  if (!exact(readback, keys) || readback.reason !== null || (legacy ? !record(readback.checkpoint) : !validCheckpoint(readback.checkpoint))) fail("GRV-READBACK");
  const timelines = (legacy ? readback.timelines : readback.dispatchTimelines).map(validateTimeline).sort((left, right) => left.dispatchId.localeCompare(right.dispatchId));
  const actionTimelines = (legacy ? [] : readback.actionTimelines).map(validateActionTimeline).sort((left, right) => left.actionId.localeCompare(right.actionId));
  if (!legacy) validateV2History(readback.checkpoint, timelines, actionTimelines);
  const topology = new Map();
  for (const timeline of timelines) for (const event of timeline.events) {
    const key = `${event.correlation.packageId}\u0000${event.correlation.workerId}\u0000${event.correlation.attemptId}`;
    const entry = topology.get(key) ?? { packageId: event.correlation.packageId, workerId: event.correlation.workerId, attemptId: event.correlation.attemptId, dispatchIds: new Set(), eventCount: 0 };
    entry.dispatchIds.add(timeline.dispatchId); entry.eventCount += 1; topology.set(key, entry);
  }
  const nodes = [...topology.values()].map((entry) => Object.freeze({ packageId: entry.packageId, workerId: entry.workerId, attemptId: entry.attemptId, dispatchIds: Object.freeze([...entry.dispatchIds].sort()), eventCount: entry.eventCount })).sort((left, right) => `${left.packageId}:${left.workerId}:${left.attemptId}`.localeCompare(`${right.packageId}:${right.workerId}:${right.attemptId}`));
  return Object.freeze({ schema: "pipeline.governance-replay-view.v2", authority: "non-authoritative", state: "observed", reason: null, dispatchTimelines: Object.freeze(timelines), actionTimelines: Object.freeze(actionTimelines), topology: Object.freeze(nodes) });
}
