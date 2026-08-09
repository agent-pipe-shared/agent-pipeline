// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { buildGovernanceReplayViewModel } from "./governance-replay-view.mjs";
import { renderGovernanceReplayView } from "./governance-replay-view-renderer.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
function event(sequence, overrides = {}) { return { sequence, eventDigest: String(sequence).repeat(64), occurredAtEpochMs: sequence, kind: "status", status: "active", reasonCode: "OBSERVED", correlation: { packageId: "phoenix-17", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1", correlationId: "correlation-1", queueRevision: 0 }, candidate, eventId: `event-${sequence}`, invalidatesEventId: null, supersedesEventId: null, ...overrides }; }
function observed(timelines = [{ schema: "pipeline.governance-replay.v1", authority: "non-authoritative", dispatchId: "dispatch-1", status: "observed", events: [event(1), event(2, { status: "completed", reasonCode: "DONE" })] }]) { return { schema: "pipeline.governance-replay-readback.v1", status: "observed", authority: "non-authoritative", reason: null, checkpoint: { sequence: 2 }, timelines }; }

test("builds a topology and ordered timeline without granting authority", () => {
  const model = buildGovernanceReplayViewModel(observed());
  assert.equal(model.authority, "non-authoritative");
  assert.equal(model.state, "observed");
  assert.deepEqual(model.topology[0].dispatchIds, ["dispatch-1"]);
  assert.equal(model.topology[0].eventCount, 2);
  const html = renderGovernanceReplayView(model);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /Cyborg proof is not inferred from replay/);
  assert.match(html, /Package, worker and attempt topology/);
});

test("keeps unavailable distinct and refuses a topology that does not match its dispatch", () => {
  const unavailable = buildGovernanceReplayViewModel({ schema: "pipeline.governance-replay-readback.v1", status: "unavailable", authority: "non-authoritative", reason: "stream-unverified", timelines: [] });
  assert.equal(unavailable.state, "unavailable");
  assert.match(renderGovernanceReplayView(unavailable), /No partial timeline is rendered/);
  const broken = observed([{ schema: "pipeline.governance-replay.v1", authority: "non-authoritative", dispatchId: "dispatch-1", status: "observed", events: [event(1, { correlation: { packageId: "phoenix-17", dispatchId: "other-dispatch", attemptId: "attempt-1", workerId: "worker-1", correlationId: "correlation-1", queueRevision: 0 } })] }]);
  assert.throws(() => buildGovernanceReplayViewModel(broken), (error) => error.code === "GRV-DISPATCH");
});

test("rejects extra event data instead of exposing raw lifecycle bodies", () => {
  const unsafe = observed([{ schema: "pipeline.governance-replay.v1", authority: "non-authoritative", dispatchId: "dispatch-1", status: "observed", events: [{ ...event(1), prompt: "not allowlisted" }] }]);
  assert.throws(() => buildGovernanceReplayViewModel(unsafe), (error) => error.code === "GRV-EVENT");
});

// L-AC-02: replay's independent re-validation must also require correlationId and a non-negative integer queueRevision.
test("L-AC-02 rejects a replay event whose correlation is missing correlationId or carries an invalid queueRevision", () => {
  const { correlationId, ...withoutCorrelationId } = event(1).correlation;
  const { queueRevision, ...withoutQueueRevision } = event(1).correlation;
  for (const correlation of [withoutCorrelationId, withoutQueueRevision, { ...event(1).correlation, queueRevision: -1 }, { ...event(1).correlation, queueRevision: 1.5 }]) {
    const invalid = observed([{ schema: "pipeline.governance-replay.v1", authority: "non-authoritative", dispatchId: "dispatch-1", status: "observed", events: [event(1, { correlation })] }]);
    assert.throws(() => buildGovernanceReplayViewModel(invalid), (error) => error.code === "GRV-CORRELATION");
  }
});

function timelineOf(...events) { return [{ schema: "pipeline.governance-replay.v1", authority: "non-authoritative", dispatchId: "dispatch-1", status: "observed", events }]; }
// Counts only the rendered <span class="..."> markers, not the embedded <style> stylesheet, which also contains
// the bare `.value-record-<class>{...}` selector text once and would otherwise inflate every count by one.
function markerCount(html, cssClass) { return (html.match(new RegExp(`class="value ${cssClass}"`, "g")) ?? []).length; }

test("marks human-authority kinds (gate, review) with the value-record-human class", () => {
  const html = renderGovernanceReplayView(buildGovernanceReplayViewModel(observed(timelineOf(event(1, { kind: "gate" }), event(2, { kind: "review" })))));
  assert.equal(markerCount(html, "value-record-human"), 2);
});

test("marks agent-remediation kinds (recovery, reconciliation) with the value-record-agent class", () => {
  const html = renderGovernanceReplayView(buildGovernanceReplayViewModel(observed(timelineOf(event(1, { kind: "recovery" }), event(2, { kind: "reconciliation" })))));
  assert.equal(markerCount(html, "value-record-agent"), 2);
});

test("marks deterministically computed kinds (verification, candidate-invalidation) with the value-record-deterministic class", () => {
  const html = renderGovernanceReplayView(buildGovernanceReplayViewModel(observed(timelineOf(event(1, { kind: "verification" }), event(2, { kind: "candidate-invalidation" })))));
  assert.equal(markerCount(html, "value-record-deterministic"), 2);
});

test("marks raw runner-reported kinds (dispatch, status, cancellation) with the value-record-runner-observed class", () => {
  const html = renderGovernanceReplayView(buildGovernanceReplayViewModel(observed(timelineOf(event(1, { kind: "dispatch" }), event(2, { kind: "status" }), event(3, { kind: "cancellation" })))));
  assert.equal(markerCount(html, "value-record-runner-observed"), 3);
});

test("gives different L-AC-04 record classes visibly distinct CSS classes within the same rendered timeline", () => {
  const html = renderGovernanceReplayView(buildGovernanceReplayViewModel(observed(timelineOf(event(1, { kind: "gate" }), event(2, { kind: "dispatch" })))));
  assert.match(html, /value-record-human/);
  assert.match(html, /value-record-runner-observed/);
  const gateRow = html.split("<tr>").find((row) => row.includes("event-1<"));
  assert.match(gateRow, /value-record-human/);
  assert.doesNotMatch(gateRow, /value-record-runner-observed/);
});
