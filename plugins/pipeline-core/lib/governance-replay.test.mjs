// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { projectGovernanceReplay } from "./governance-replay.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
function event(sequence, overrides = {}) { const payload = { eventId: `event-${sequence}`, kind: "dispatch", status: "active", reasonCode: "DISPATCHED", correlation: { packageId: "phoenix-3", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1" }, candidate, invalidatesEventId: null, supersedesEventId: null, ...overrides }; return { sequence, eventDigest: String(sequence).repeat(64), occurredAtEpochMs: sequence, candidate, payload }; }

test("replay groups and orders lifecycle records without claiming authority", () => {
  const replay = projectGovernanceReplay([event(2), event(1)]);
  assert.equal(replay[0].authority, "non-authoritative");
  assert.deepEqual(replay[0].events.map((entry) => entry.sequence), [1, 2]);
});

test("candidate invalidation remains visible and duplicate sequences fail closed", () => {
  const invalidated = projectGovernanceReplay([event(1), event(2, { kind: "candidate-invalidation", status: "invalidated", invalidatesEventId: "event-1" })]);
  assert.equal(invalidated[0].status, "invalidated");
  assert.throws(() => projectGovernanceReplay([event(1), event(1)]), (error) => error.code === "GR-SEQUENCE-FORK");
});

test("replay refuses an uncorrelated candidate change", () => {
  const changed = { commit: "c".repeat(40), tree: "d".repeat(40) };
  const second = event(2, { eventId: "event-2", candidate: changed });
  assert.throws(() => projectGovernanceReplay([event(1), { ...second, candidate: changed }]), (error) => error.code === "GR-CANDIDATE-DRIFT");
});
