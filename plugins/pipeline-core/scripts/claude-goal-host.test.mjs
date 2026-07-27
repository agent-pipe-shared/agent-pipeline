// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { reconcileClaudeGoal, reconcileClaudeNativeContinuation } from "./claude-goal-host.mjs";

let passed = 0;
function check(name, fn) { return Promise.resolve(fn()).then(() => { passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }); }
const input = { action: "set", sessionId: "session-1", objective: "Bounded continuation.", generation: 1 };
const D = "d".repeat(64);
function continuity() {
  return { schema: "pipeline.continuity.v0", featureId: "nova-b", revision: 3, runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: { path: "specs/prd.md", sha256: D }, plan: { path: "specs/plan.md", sha256: D }, spec: { path: "specs/spec.md", sha256: D }, result: { path: "specs/result.md", sha256: D } }, queueHead: { packageId: "b0", actionId: "implement", nextAction: "verify", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 3, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, closeTransition: null, capacity: { concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
}

await check("missing native capability is typed unavailable", async () => {
  assert.deepEqual(await reconcileClaudeGoal(input), { ok: false, code: "CLG-CAPABILITY", status: "unavailable", readback: null });
});
await check("matching native readback activates the goal", async () => {
  let goal = null; let sets = 0;
  const client = { setGoal: async (value) => { goal = value; sets += 1; }, getGoal: async () => goal, clearGoal: async () => { goal = null; } };
  const active = await reconcileClaudeGoal(input, { client }); assert.equal(active.status, "active"); assert.match(active.readback.observedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  await reconcileClaudeGoal(input, { client }); assert.equal(sets, 1);
  assert.equal((await reconcileClaudeGoal({ ...input, action: "clear" }, { client })).status, "cleared");
});
await check("mismatched native readback is never success", async () => {
  const client = { setGoal: async () => {}, getGoal: async () => ({ sessionId: "session-1", objective: "other", status: "active" }), clearGoal: async () => {} };
  assert.deepEqual(await reconcileClaudeGoal(input, { client }), { ok: false, code: "CLG-READBACK", status: "unavailable", readback: null });
});
await check("continuity host binding never substitutes missing Claude capability", async () => {
  const result = await reconcileClaudeNativeContinuation({ continuity: continuity(), activeFeature: { id: "nova-b", phase: "implementation" }, continuationId: "nova-b0", runner: { runnerId: "claude", adapterVersion: "v1", capability: "available" }, event: { kind: "activate", atRevision: 3 } }, { sessionId: "session-1", client: {} });
  assert.equal(result.ok, true); assert.equal(result.next.nativeContinuation.status, "unavailable");
});
process.stdout.write(`1..${passed}\n`);
