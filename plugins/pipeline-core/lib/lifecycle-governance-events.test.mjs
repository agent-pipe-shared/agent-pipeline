// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { LifecycleGovernanceEventError, validateLifecycleGovernanceEvent } from "./lifecycle-governance-events.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
function event(overrides = {}) {
  return { eventId: "lifecycle-1", kind: "dispatch", status: "active", reasonCode: "DISPATCHED", correlation: { packageId: "phoenix-3", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1" }, candidate, invalidatesEventId: null, supersedesEventId: null, ...overrides };
}

test("accepts a closed correlated non-authoritative lifecycle event", () => {
  const value = validateLifecycleGovernanceEvent(event());
  assert.equal(value.kind, "dispatch");
  assert.equal(Object.isFrozen(value), true);
});

test("requires explicit, exclusive invalidation semantics", () => {
  assert.deepEqual(validateLifecycleGovernanceEvent(event({ kind: "candidate-invalidation", status: "invalidated", invalidatesEventId: "prior-event" })).invalidatesEventId, "prior-event");
  for (const invalid of [
    event({ kind: "candidate-invalidation", status: "completed", invalidatesEventId: "prior-event" }),
    event({ kind: "candidate-invalidation", status: "invalidated" }),
    event({ invalidatesEventId: "prior-event" }),
    event({ invalidatesEventId: "prior-event", supersedesEventId: "other-event" }),
  ]) assert.throws(() => validateLifecycleGovernanceEvent(invalid), (error) => error instanceof LifecycleGovernanceEventError);
});

test("rejects open payloads, free text, private-shaped correlations, and invalid candidates", () => {
  for (const invalid of [
    { ...event(), note: "do not persist me" },
    event({ reasonCode: "free text" }),
    event({ correlation: { ...event().correlation, workerId: "/private/path" } }),
    event({ candidate: { commit: "a".repeat(40), tree: "not-an-oid" } }),
  ]) assert.throws(() => validateLifecycleGovernanceEvent(invalid), (error) => error instanceof LifecycleGovernanceEventError);
});
