// SPDX-License-Identifier: SUL-1.0
/** Pure lifecycle replay projection; never an authority input. */
import { GOVERNANCE_ACTION_EVENT_SCHEMA, validateGovernanceActionEvent } from "./governance-action-events.mjs";
import { validateLifecycleGovernanceEvent } from "./lifecycle-governance-events.mjs";

const LIFECYCLE_SCHEMA = "pipeline.lifecycle-governance-event.v1";
const SHA = /^[a-f0-9]{64}$/u;
function fail(code) { const error = new Error("Governance replay is invalid."); error.code = code; throw error; }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function sameCandidate(left, right) { return left?.commit === right?.commit && left?.tree === right?.tree; }
function payloadSchemaOf(envelope) {
  const legacy = exact(envelope, ["sequence", "eventDigest", "occurredAtEpochMs", "candidate", "payload"]);
  const current = exact(envelope, ["sequence", "eventDigest", "occurredAtEpochMs", "candidate", "payloadSchema", "payload"]);
  if ((!legacy && !current) || !Number.isSafeInteger(envelope.sequence) || envelope.sequence < 1
    || typeof envelope.eventDigest !== "string" || !SHA.test(envelope.eventDigest)
    || !Number.isSafeInteger(envelope.occurredAtEpochMs)) fail("GR-ENVELOPE");
  const schema = legacy ? LIFECYCLE_SCHEMA : envelope.payloadSchema;
  if (![LIFECYCLE_SCHEMA, GOVERNANCE_ACTION_EVENT_SCHEMA].includes(schema)) fail("GR-PAYLOAD-SCHEMA");
  return schema;
}

/**
 * Projects validated lifecycle envelopes into separate dispatch and action
 * timelines. An omitted discriminator is accepted only as legacy lifecycle-v1.
 *
 * Cyborg's future human-authority attestation may be correlated beside a replay
 * event at a separate, signed authority boundary.  It must never be inferred
 * from this projection or from an event's displayed status.
 */
export function projectGovernanceReplay(events) {
  if (!Array.isArray(events)) fail("GR-INPUT");
  const dispatches = new Map(); const actions = new Map(); const sequences = new Set();
  for (const envelope of events) {
    const payloadSchema = payloadSchemaOf(envelope);
    if (sequences.has(envelope.sequence)) fail("GR-SEQUENCE-FORK");
    sequences.add(envelope.sequence);
    if (payloadSchema === GOVERNANCE_ACTION_EVENT_SCHEMA) {
      let payload; try { payload = validateGovernanceActionEvent(envelope.payload); } catch { fail("GR-ACTION"); }
      if (!sameCandidate(payload.candidate, envelope.candidate)) fail("GR-CANDIDATE");
      const key = payload.correlation.actionId;
      const timeline = actions.get(key) ?? { actionId: key, events: [] };
      timeline.events.push(Object.freeze({ sequence: envelope.sequence, eventDigest: envelope.eventDigest, occurredAtEpochMs: envelope.occurredAtEpochMs, kind: payload.kind, status: payload.status, reasonCode: payload.reasonCode, correlation: payload.correlation, candidate: payload.candidate, eventId: payload.eventId }));
      actions.set(key, timeline);
      continue;
    }
    let payload; try { payload = validateLifecycleGovernanceEvent(envelope.payload); } catch { fail("GR-LIFECYCLE"); }
    if (!sameCandidate(payload.candidate, envelope.candidate)) fail("GR-CANDIDATE");
    const key = payload.correlation.dispatchId;
    const timeline = dispatches.get(key) ?? { dispatchId: key, invalidated: false, events: [] };
    timeline.events.push(Object.freeze({ sequence: envelope.sequence, eventDigest: envelope.eventDigest, occurredAtEpochMs: envelope.occurredAtEpochMs, kind: payload.kind, status: payload.status, reasonCode: payload.reasonCode, correlation: payload.correlation, candidate: payload.candidate, eventId: payload.eventId, invalidatesEventId: payload.invalidatesEventId, supersedesEventId: payload.supersedesEventId }));
    if (payload.kind === "candidate-invalidation") timeline.invalidated = true;
    dispatches.set(key, timeline);
  }
  const projected = [...dispatches.values()].map((timeline) => {
    timeline.events.sort((left, right) => left.sequence - right.sequence);
    for (let index = 1; index < timeline.events.length; index += 1) {
      const previous = timeline.events[index - 1]; const current = timeline.events[index];
      const candidateChanged = !sameCandidate(previous.candidate, current.candidate);
      if (candidateChanged && current.kind !== "candidate-invalidation") fail("GR-CANDIDATE-DRIFT");
    }
    return Object.freeze({ schema: "pipeline.governance-replay.v1", authority: "non-authoritative", dispatchId: timeline.dispatchId, status: timeline.invalidated ? "invalidated" : "observed", events: Object.freeze(timeline.events) });
  });
  const actionTimelines = [...actions.values()].map((timeline) => {
    timeline.events.sort((left, right) => left.sequence - right.sequence);
    return Object.freeze({ schema: "pipeline.governance-action-replay.v1", authority: "non-authoritative", actionId: timeline.actionId, status: "observed", events: Object.freeze(timeline.events) });
  }).sort((left, right) => left.actionId.localeCompare(right.actionId));
  return Object.freeze({ schema: "pipeline.governance-replay.v2", authority: "non-authoritative", dispatchTimelines: Object.freeze(projected.sort((left, right) => left.dispatchId.localeCompare(right.dispatchId))), actionTimelines: Object.freeze(actionTimelines) });
}
