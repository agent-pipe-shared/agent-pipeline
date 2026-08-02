// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { main } from "./governance-replay.mjs";
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
function event(sequence) { return { sequence, eventDigest: String(sequence).repeat(64), occurredAtEpochMs: sequence, candidate, payload: { eventId: `event-${sequence}`, kind: "dispatch", status: "active", reasonCode: "DISPATCHED", correlation: { packageId: "phoenix-3", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1" }, candidate, invalidatesEventId: null, supersedesEventId: null } }; }
test("projects only a verified lifecycle stream through the non-authoritative replay boundary", async () => { const result = await main(["--repo", "/repo", "--repository-fingerprint", "a".repeat(64)], { query: async () => ({ completeness: "verified", integrity: "valid", checkpoint: { sequence: 1 }, events: [event(1)] }) }); assert.equal(result.status, "observed"); assert.equal(result.timelines[0].authority, "non-authoritative"); });
test("does not project an incomplete or invalid canonical stream", async () => { const result = await main(["--repo", "/repo", "--repository-fingerprint", "a".repeat(64)], { query: async () => ({ completeness: "unknown", integrity: "prefix-valid", events: [event(1)] }) }); assert.equal(result.status, "unavailable"); assert.equal(result.timelines.length, 0); });
