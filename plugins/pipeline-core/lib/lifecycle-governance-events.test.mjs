// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { LIFECYCLE_EXTENSION_NAMESPACES, LifecycleGovernanceEventError, isRegisteredLifecycleExtensionNamespace, validateLifecycleGovernanceEvent } from "./lifecycle-governance-events.mjs";

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
  const accepted = validateLifecycleGovernanceEvent(event({ extensions: { "pipeline.remote-execution": { runnerId: "codex", attempt: 2, degraded: false, outcomeCode: "SANDBOX_UNAVAILABLE" } } }));
  assert.equal(accepted.extensions["pipeline.remote-execution"].runnerId, "codex");
  assert.equal(Object.isFrozen(accepted.extensions), true);
  assert.equal(Object.isFrozen(accepted.extensions["pipeline.remote-execution"]), true);
  for (const registered of LIFECYCLE_EXTENSION_NAMESPACES) assert.equal(validateLifecycleGovernanceEvent(event({ extensions: { [registered]: {} } })).extensions[registered].runnerId, undefined);
  for (const unknown of ["provider.injected", "pipeline.unregistered", "PIPELINE.CREDENTIALS", "pipeline", "__proto__", ""]) {
    assert.equal(isRegisteredLifecycleExtensionNamespace(unknown), false);
    assert.throws(() => validateLifecycleGovernanceEvent(event({ extensions: { [unknown]: {} } })), (error) => error instanceof LifecycleGovernanceEventError, `admitted namespace ${unknown}`);
  }
});

// A durable lifecycle record is written once and later exported, so the one
// field a provider controls must not be closable only by shape. These are the
// values the previous identifier/code/object-id grammar admitted.
test("L-AC-03 admits no namespace under which a credential could be filed", () => {
  assert.equal(isRegisteredLifecycleExtensionNamespace("pipeline.credentials"), false);
  assert.throws(() => validateLifecycleGovernanceEvent(event({ extensions: { "pipeline.credentials": {} } })), (error) => error instanceof LifecycleGovernanceEventError);
});

test("L-AC-03 admits no value that could carry a secret or an opaque digest", () => {
  const namespace = "pipeline.remote-execution";
  for (const detail of [
    // Credential-shaped: every one of these satisfied the identifier or reason-code grammar.
    { runnerId: "AKIAIOSFODNN7EXAMPLE" },
    { runnerId: "ghp_0123456789abcdefghijklmnopqrstuvwxyz" },
    { outcomeCode: "AKIAIOSFODNN7EXAMPLE" },
    // A 64-hex object id is a digest of arbitrary private text.
    { runnerId: "c".repeat(64) },
    { outcomeCode: "C".repeat(64) },
    // Off-vocabulary values of the right shape are refused, not just malformed ones.
    { runnerId: "cursor" },
    { outcomeCode: "SANDBOX_MISSING" },
    // Unregistered keys are refused rather than silently dropped.
    { tree: "c".repeat(64) },
    { detail: null },
    { transcript: "a full session transcript" },
    { path: "/home/fixture/secret" },
    { nested: { runnerId: "codex" } },
    { list: ["codex"] },
    { attempt: 1.5 },
    { attempt: -1 },
    { attempt: 1025 },
    { degraded: "false" },
    // Parsed rather than written as a literal: only JSON.parse gives this an
    // own key, which is exactly how an untrusted payload would arrive.
    JSON.parse('{"__proto__":"codex"}'),
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
