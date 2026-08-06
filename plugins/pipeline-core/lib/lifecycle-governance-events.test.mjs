// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { EXTENSION_NAMESPACES, isRegisteredExtensionNamespace } from "./extension-namespaces.mjs";
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

// L-AC-03: runner-specific detail belongs under a registered namespaced
// extension, and an unknown namespace is rejected rather than retained.
test("L-AC-03 retains runner detail only under a registered namespace", () => {
  const namespace = EXTENSION_NAMESPACES[0];
  const accepted = validateLifecycleGovernanceEvent(event({ extensions: { [namespace]: { runnerId: "codex", attempt: 2, degraded: false, outcomeCode: "SANDBOX_UNAVAILABLE", tree: "c".repeat(64), detail: null } } }));
  assert.equal(accepted.extensions[namespace].runnerId, "codex");
  assert.equal(Object.isFrozen(accepted.extensions), true);
  assert.equal(Object.isFrozen(accepted.extensions[namespace]), true);
  // Every registered namespace is admissible; nothing else is.
  for (const registered of EXTENSION_NAMESPACES) assert.equal(validateLifecycleGovernanceEvent(event({ extensions: { [registered]: {} } })).extensions[registered].runnerId, undefined);
  for (const unknown of ["provider.injected", "pipeline.unregistered", "PIPELINE.CREDENTIALS", "pipeline", "__proto__", ""]) {
    assert.equal(isRegisteredExtensionNamespace(unknown), false);
    assert.throws(() => validateLifecycleGovernanceEvent(event({ extensions: { [unknown]: {} } })), (error) => error instanceof LifecycleGovernanceEventError, `admitted namespace ${unknown}`);
  }
});

test("L-AC-03 keeps a namespace from becoming a free-text or unbounded escape hatch", () => {
  const namespace = EXTENSION_NAMESPACES[0];
  for (const detail of [
    { transcript: "a full session transcript" },
    { path: "/home/fixture/secret" },
    { nested: { runnerId: "codex" } },
    { list: ["codex"] },
    { size: 1.5 },
    // Parsed rather than written as a literal: only JSON.parse gives this an
    // own key, which is exactly how an untrusted payload would arrive.
    JSON.parse('{"__proto__":"codex"}'),
    Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`entry${index}`, "value"])),
  ]) assert.throws(() => validateLifecycleGovernanceEvent(event({ extensions: { [namespace]: detail } })), (error) => error instanceof LifecycleGovernanceEventError, `admitted ${JSON.stringify(detail)}`);
  for (const value of [null, [], "codex", 1]) assert.throws(() => validateLifecycleGovernanceEvent(event({ extensions: value })), (error) => error instanceof LifecycleGovernanceEventError);
  // An event that retains no runner detail keeps the base shape exactly.
  assert.equal(Object.hasOwn(validateLifecycleGovernanceEvent(event()), "extensions"), false);
});

test("rejects open payloads, free text, private-shaped correlations, and invalid candidates", () => {
  for (const invalid of [
    { ...event(), note: "do not persist me" },
    event({ reasonCode: "free text" }),
    event({ correlation: { ...event().correlation, workerId: "/private/path" } }),
    event({ candidate: { commit: "a".repeat(40), tree: "not-an-oid" } }),
  ]) assert.throws(() => validateLifecycleGovernanceEvent(invalid), (error) => error instanceof LifecycleGovernanceEventError);
});
