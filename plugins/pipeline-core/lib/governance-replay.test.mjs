// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { buildGovernanceActionEvent } from "./governance-action-events.mjs";
import { projectGovernanceReplay } from "./governance-replay.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
function event(sequence, overrides = {}) { const payload = { eventId: `event-${sequence}`, kind: "dispatch", status: "active", reasonCode: "DISPATCHED", correlation: { packageId: "phoenix-3", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1", correlationId: "correlation-1", queueRevision: 0 }, candidate, invalidatesEventId: null, supersedesEventId: null, ...overrides }; return { sequence, eventDigest: String(sequence).repeat(64), occurredAtEpochMs: sequence, candidate, payload }; }
function action(sequence, overrides = {}) { const payload = buildGovernanceActionEvent({ kind: "verification", status: "completed", reasonCode: "VERIFICATION_PASSED", requestId: `verify-${sequence}`, featureId: { state: "not-applicable" }, sessionId: { state: "not-applicable" }, candidate, ...overrides }); return { sequence, eventDigest: String(sequence).repeat(64), occurredAtEpochMs: sequence, candidate, payloadSchema: "pipeline.governance-action-event.v1", payload }; }

test("replay groups and orders lifecycle records without claiming authority", () => {
  const replay = projectGovernanceReplay([event(2), event(1)]);
  assert.equal(replay.schema, "pipeline.governance-replay.v2");
  assert.equal(replay.dispatchTimelines[0].authority, "non-authoritative");
  assert.deepEqual(replay.dispatchTimelines[0].events.map((entry) => entry.sequence), [1, 2]);
});

test("candidate invalidation remains visible and duplicate sequences fail closed", () => {
  const invalidated = projectGovernanceReplay([event(1), event(2, { kind: "candidate-invalidation", status: "invalidated", invalidatesEventId: "event-1" })]);
  assert.equal(invalidated.dispatchTimelines[0].status, "invalidated");
  assert.throws(() => projectGovernanceReplay([event(1), event(1)]), (error) => error.code === "GR-SEQUENCE-FORK");
});

test("replay refuses an uncorrelated candidate change", () => {
  const changed = { commit: "c".repeat(40), tree: "d".repeat(40) };
  const second = event(2, { eventId: "event-2", candidate: changed });
  assert.throws(() => projectGovernanceReplay([event(1), { ...second, candidate: changed }]), (error) => error.code === "GR-CANDIDATE-DRIFT");
});

test("L-AC-07 replays serial, parallel, retry, cancellation and recovery fixtures to identical bounded output on repeat, and rejects malicious fixtures deterministically", () => {
  const fixture = [
    event(1),
    event(2, { eventId: "event-2", status: "completed", reasonCode: "DONE" }),
    event(3, { eventId: "event-3", status: "active", reasonCode: "RETRIED", correlation: { packageId: "phoenix-3", dispatchId: "dispatch-1", attemptId: "attempt-2", workerId: "worker-1", correlationId: "correlation-1", queueRevision: 0 } }),
    event(4, { eventId: "event-4", correlation: { packageId: "phoenix-3", dispatchId: "dispatch-2", attemptId: "attempt-1", workerId: "worker-2", correlationId: "correlation-2", queueRevision: 0 } }),
    event(5, { eventId: "event-5", kind: "status", status: "cancelled", reasonCode: "CANCELLED", correlation: { packageId: "phoenix-3", dispatchId: "dispatch-2", attemptId: "attempt-1", workerId: "worker-2", correlationId: "correlation-2", queueRevision: 0 } }),
    event(6, { eventId: "event-6", kind: "recovery", status: "completed", reasonCode: "RECOVERED", correlation: { packageId: "phoenix-3", dispatchId: "dispatch-3", attemptId: "attempt-1", workerId: "worker-3", correlationId: "correlation-3", queueRevision: 0 } }),
  ];
  const first = projectGovernanceReplay(fixture);
  const second = projectGovernanceReplay(fixture);
  const third = projectGovernanceReplay(fixture);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(second), JSON.stringify(third));
  assert.equal(first.dispatchTimelines.length, 3);
  assert.deepEqual(first.dispatchTimelines.map((timeline) => timeline.events.length), [3, 2, 1]);

  const malicious = [event(1), event(1, { eventId: "event-1b" })];
  assert.throws(() => projectGovernanceReplay(malicious), (error) => error.code === "GR-SEQUENCE-FORK");
  assert.throws(() => projectGovernanceReplay(malicious), (error) => error.code === "GR-SEQUENCE-FORK");
});

test("routes action payloads separately without inventing dispatch or worker topology", () => {
  const replay = projectGovernanceReplay([event(1), action(2)]);
  assert.equal(replay.dispatchTimelines.length, 1);
  assert.equal(replay.actionTimelines.length, 1);
  assert.equal(replay.actionTimelines[0].actionId, replay.actionTimelines[0].events[0].correlation.actionId);
  assert.deepEqual(Object.keys(replay.actionTimelines[0].events[0].correlation), ["actionId", "featureId", "requestId", "sessionId"]);
  assert.doesNotMatch(JSON.stringify(replay.actionTimelines), /workerId|attemptId|dispatchId|packageId/);
});

test("mixed replay rejects unknown schemas, malformed actions, and forks across timeline families", () => {
  assert.throws(() => projectGovernanceReplay([{ ...event(1), payloadSchema: "pipeline.unknown.v1" }]), (error) => error.code === "GR-PAYLOAD-SCHEMA");
  assert.throws(() => projectGovernanceReplay([{ ...action(1), payload: { ...action(1).payload, runner: "codex" } }]), (error) => error.code === "GR-ACTION");
  assert.throws(() => projectGovernanceReplay([event(1), action(1)]), (error) => error.code === "GR-SEQUENCE-FORK");
});
