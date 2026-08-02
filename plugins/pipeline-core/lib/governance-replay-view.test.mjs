// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { buildGovernanceReplayViewModel } from "./governance-replay-view.mjs";
import { renderGovernanceReplayView } from "./governance-replay-view-renderer.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
function event(sequence, overrides = {}) { return { sequence, eventDigest: String(sequence).repeat(64), occurredAtEpochMs: sequence, kind: "status", status: "active", reasonCode: "OBSERVED", correlation: { packageId: "phoenix-17", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1" }, candidate, eventId: `event-${sequence}`, invalidatesEventId: null, supersedesEventId: null, ...overrides }; }
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
  const broken = observed([{ schema: "pipeline.governance-replay.v1", authority: "non-authoritative", dispatchId: "dispatch-1", status: "observed", events: [event(1, { correlation: { packageId: "phoenix-17", dispatchId: "other-dispatch", attemptId: "attempt-1", workerId: "worker-1" } })] }]);
  assert.throws(() => buildGovernanceReplayViewModel(broken), (error) => error.code === "GRV-DISPATCH");
});

test("rejects extra event data instead of exposing raw lifecycle bodies", () => {
  const unsafe = observed([{ schema: "pipeline.governance-replay.v1", authority: "non-authoritative", dispatchId: "dispatch-1", status: "observed", events: [{ ...event(1), prompt: "not allowlisted" }] }]);
  assert.throws(() => buildGovernanceReplayViewModel(unsafe), (error) => error.code === "GRV-EVENT");
});
