// SPDX-License-Identifier: SUL-1.0
/** Pure PHX-3 lifecycle replay projection; never an authority input. */
import { validateLifecycleGovernanceEvent } from "./lifecycle-governance-events.mjs";

function fail(code) { const error = new Error("Governance replay is invalid."); error.code = code; throw error; }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }

/**
 * Projects only validated lifecycle envelopes into per-dispatch, non-authoritative timelines.
 *
 * Cyborg's future human-authority attestation may be correlated beside a replay
 * event at a separate, signed authority boundary.  It must never be inferred
 * from this projection or from an event's displayed status.
 */
export function projectGovernanceReplay(events) {
  if (!Array.isArray(events)) fail("GR-INPUT");
  const dispatches = new Map();
  for (const envelope of events) {
    if (!exact(envelope, ["sequence", "eventDigest", "occurredAtEpochMs", "candidate", "payload"])
      || !Number.isSafeInteger(envelope.sequence) || envelope.sequence < 1
      || typeof envelope.eventDigest !== "string" || !/^[a-f0-9]{64}$/u.test(envelope.eventDigest)
      || !Number.isSafeInteger(envelope.occurredAtEpochMs)) fail("GR-ENVELOPE");
    const payload = validateLifecycleGovernanceEvent(envelope.payload);
    if (payload.candidate.commit !== envelope.candidate?.commit || payload.candidate.tree !== envelope.candidate?.tree) fail("GR-CANDIDATE");
    const key = payload.correlation.dispatchId;
    const timeline = dispatches.get(key) ?? { dispatchId: key, invalidated: false, events: [] };
    timeline.events.push(Object.freeze({ sequence: envelope.sequence, eventDigest: envelope.eventDigest, occurredAtEpochMs: envelope.occurredAtEpochMs, kind: payload.kind, status: payload.status, reasonCode: payload.reasonCode, correlation: payload.correlation, candidate: payload.candidate, eventId: payload.eventId, invalidatesEventId: payload.invalidatesEventId, supersedesEventId: payload.supersedesEventId }));
    if (payload.kind === "candidate-invalidation") timeline.invalidated = true;
    dispatches.set(key, timeline);
  }
  const projected = [...dispatches.values()].map((timeline) => {
    timeline.events.sort((left, right) => left.sequence - right.sequence);
    for (let index = 1; index < timeline.events.length; index += 1) if (timeline.events[index - 1].sequence === timeline.events[index].sequence) fail("GR-SEQUENCE-FORK");
    for (let index = 1; index < timeline.events.length; index += 1) {
      const previous = timeline.events[index - 1]; const current = timeline.events[index];
      const candidateChanged = previous.candidate.commit !== current.candidate.commit || previous.candidate.tree !== current.candidate.tree;
      if (candidateChanged && current.kind !== "candidate-invalidation") fail("GR-CANDIDATE-DRIFT");
    }
    return Object.freeze({ schema: "pipeline.governance-replay.v1", authority: "non-authoritative", dispatchId: timeline.dispatchId, status: timeline.invalidated ? "invalidated" : "observed", events: Object.freeze(timeline.events) });
  });
  return Object.freeze(projected.sort((left, right) => left.dispatchId.localeCompare(right.dispatchId)));
}
