// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalJson, createControlExecutionExchange } from "./control-execution-exchange.mjs";
import { validateLifecycleGovernanceEvent } from "./lifecycle-governance-events.mjs";
import {
  ControlExecutionLifecycleEventError,
  LIFECYCLE_DISPATCH_PROJECTION,
  LIFECYCLE_DISPATCH_SOURCE_CLASS,
  buildLifecycleDispatchEvent,
} from "./control-execution-lifecycle-event.mjs";

const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64), D = "d".repeat(64), O = "1".repeat(40), P = "2".repeat(40);
const dispatch = { featureId: "feature-1", queueRevision: 2, packageId: "pkg-1", actionId: "act-1", dispatchId: "dispatch-1", attemptId: "attempt-1", authorityDigests: { prdSha256: A, specSha256: B, resultSha256: C }, routeRequestSha256: D, mayDelegate: false };
const continuityState = { schema: "pipeline.continuity.v0", featureId: "feature-1", revision: 2, runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: { path: "prd.md", sha256: A }, spec: { path: "spec.md", sha256: B }, result: { path: "result.md", sha256: C } }, queueHead: { packageId: "pkg-1", actionId: "act-1", nextAction: "poll", productRetryCount: 0, environmentRerouteCount: 0, dispatch }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 2, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, closeTransition: null, capacity: { concurrencyLimit: 2, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
const base = { continuityState, gitBinding: { baseCommit: O, candidateCommit: P, candidateTree: O }, orchestrationAssignment: { parentOrchestrationId: "parent-1", workerId: "worker-1", correlationId: "corr-1" }, invalidation: { state: "valid", reasonCode: null, supersededByQueueRevision: null }, event: { class: "admission", status: "admitted", observedAt: "2026-08-17T00:00:00Z", evidenceSha256: A }, extensions: {} };
const exchange = createControlExecutionExchange(base);

// --- L-AC-01: an admission projects through the closed lifecycle schema -------
const event = buildLifecycleDispatchEvent({ exchange });
assert.equal(event.kind, "dispatch");
assert.equal(event.status, "active");
assert.equal(event.reasonCode, "DISPATCH_ADMITTED");
// The validator itself is the admissibility oracle, not this test's opinion.
assert.deepEqual(validateLifecycleGovernanceEvent(structuredClone(event)), event);
assert.equal(Object.isFrozen(event), true);
assert.equal(Object.isFrozen(event.correlation), true);
assert.equal(Object.isFrozen(event.candidate), true);
assert.deepEqual(Object.keys(event).sort(), ["candidate", "correlation", "eventId", "invalidatesEventId", "kind", "reasonCode", "status", "supersedesEventId"]);

// --- L-AC-02 shape: exactly the exchange's identity set is retained -----------
assert.deepEqual(event.correlation, { packageId: "pkg-1", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1", correlationId: "corr-1", queueRevision: 2 });
assert.deepEqual(event.candidate, { commit: P, tree: O });

// --- a lifecycle record is never authority and starts no chain ---------------
assert.equal(event.invalidatesEventId, null);
assert.equal(event.supersedesEventId, null);

// --- determinism: one admission is one event, twice --------------------------
assert.equal(buildLifecycleDispatchEvent({ exchange }).eventId, event.eventId);
assert.equal(event.eventId, `lge-${createHash("sha256").update(`pipeline.lifecycle-dispatch-event.v1\0${canonicalJson({ kind: "dispatch", status: "active", reasonCode: "DISPATCH_ADMITTED", correlation: event.correlation, candidate: event.candidate })}`, "utf8").digest("hex")}`);
// A different dispatch cannot collide with it.
const otherState = structuredClone(continuityState);
otherState.queueHead.dispatch.dispatchId = "dispatch-2";
assert.notEqual(buildLifecycleDispatchEvent({ exchange: createControlExecutionExchange({ ...base, continuityState: otherState }) }).eventId, event.eventId);
// An injected id is honoured and still validated.
assert.equal(buildLifecycleDispatchEvent({ exchange, eventId: "lge-injected-1" }).eventId, "lge-injected-1");
assert.throws(() => buildLifecycleDispatchEvent({ exchange, eventId: "not a valid id" }), (error) => error.code === "LGE-SHAPE");

// --- every admission status has an honest projection, none invents an outcome -
assert.deepEqual(Object.keys(LIFECYCLE_DISPATCH_PROJECTION).sort(), ["admitted", "rejected", "unavailable", "unknown"]);
for (const [status, projection] of Object.entries(LIFECYCLE_DISPATCH_PROJECTION)) {
  const projected = buildLifecycleDispatchEvent({ exchange: { ...exchange, event: { ...exchange.event, status } } });
  assert.equal(projected.status, projection.status);
  assert.equal(projected.reasonCode, projection.reasonCode);
  assert.equal(projected.kind, "dispatch");
  // No admission status may ever read as a completed dispatch.
  assert.notEqual(projected.status, "completed");
}

// --- refusals are by name, never a coerced result ----------------------------
assert.equal(LIFECYCLE_DISPATCH_SOURCE_CLASS, "admission");
for (const klass of ["progress", "terminal", "cancellation", "verification", "review-handoff"]) {
  const status = klass === "progress" ? "running" : klass === "terminal" ? "succeeded" : klass === "cancellation" ? "requested" : klass === "verification" ? "passed" : "ready";
  assert.throws(() => buildLifecycleDispatchEvent({ exchange: { ...exchange, event: { ...exchange.event, class: klass, status } } }), (error) => error instanceof ControlExecutionLifecycleEventError && error.code === "CLE-CLASS-UNSUPPORTED");
}
for (const reasonCode of ["queue-advanced", "authority-drift", "base-drift", "candidate-superseded", "cancelled"]) {
  const invalidation = { state: "invalidated", reasonCode, supersededByQueueRevision: null };
  assert.throws(() => buildLifecycleDispatchEvent({ exchange: { ...exchange, package: { ...exchange.package, invalidation } } }), (error) => error.code === "CLE-EXCHANGE-INVALIDATED");
}
for (const broken of [undefined, null, {}, { ...exchange, schema: "other" }, { ...exchange, orchestration: { ...exchange.orchestration, workerId: "not valid" } }, { ...exchange, foo: 1 }]) {
  assert.throws(() => buildLifecycleDispatchEvent({ exchange: broken }), (error) => error.code === "CLE-EXCHANGE-INVALID");
}
assert.throws(() => buildLifecycleDispatchEvent(), (error) => error.code === "CLE-EXCHANGE-INVALID");

// --- drift guard: the projection stays inside the target schema's vocabulary --
const lifecycleSource = await import("node:fs").then(({ readFileSync }) => readFileSync(new URL("./lifecycle-governance-events.mjs", import.meta.url), "utf8"));
for (const projection of Object.values(LIFECYCLE_DISPATCH_PROJECTION)) {
  assert.equal(lifecycleSource.includes(`"${projection.status}"`), true, `status ${projection.status} is no longer in the lifecycle vocabulary`);
}
assert.equal(lifecycleSource.includes('"dispatch"'), true);

console.log("control-execution-lifecycle-event: ok");
