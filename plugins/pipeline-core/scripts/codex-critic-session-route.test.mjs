// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { resolveSessionCodexCriticHighRiskRoute } from "./codex-critic-session-route.mjs";

const rootDir = "/fixture/repository";
const candidateCommit = "a".repeat(40);
const v3 = { dutyId: "critic_high_risk", runner: "codex", model: "v3-model",
  effort: "max", sourceSha256: "b".repeat(64), candidateCommit };
const selected = { ok: true, status: "ready", runner: "codex",
  taskRoute: "duty.critic_high_risk", modelId: "session-model", effort: "max",
  readbackSha256: "c".repeat(64), receiptSha256: "d".repeat(64) };
const base = { rootDir, candidateCommit, resolveV3: () => v3 };

test("selected high-risk Critic route binds the admitted exact model and receipt digests", () => {
  const calls = [];
  const result = resolveSessionCodexCriticHighRiskRoute({ ...base,
    env: { CODEX_SESSION_ID: "session" }, select: (request) => {
      calls.push(request); return selected;
    } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].taskRoute, "duty.critic_high_risk");
  assert.equal(result.model, "session-model");
  assert.equal(result.effort, v3.effort);
  assert.notEqual(result.sourceSha256, v3.sourceSha256);
  const differentReceipt = resolveSessionCodexCriticHighRiskRoute({ ...base,
    env: { CODEX_SESSION_ID: "session" }, select: () => ({ ...selected,
      receiptSha256: "e".repeat(64) }) });
  assert.notEqual(result.sourceSha256, differentReceipt.sourceSha256);
});

test("absent or defective optional selection leaves the valid V3 route usable", () => {
  assert.deepEqual(resolveSessionCodexCriticHighRiskRoute({ ...base,
    env: {}, select: () => { throw new Error("must not run"); } }), v3);
  for (const select of [() => { throw new Error("store unavailable"); },
    () => ({ ...selected, effort: "high" }),
    () => ({ ...selected, taskRoute: "duty.critic_normal" }),
    () => ({ ...selected, receiptSha256: "bad" })]) {
    assert.deepEqual(resolveSessionCodexCriticHighRiskRoute({ ...base,
      env: { CODEX_SESSION_ID: "session" }, select }), v3);
  }
});

test("invalid V3 authority cannot be masked by an admitted optional selection", () => {
  assert.throws(() => resolveSessionCodexCriticHighRiskRoute({ ...base,
    resolveV3: () => ({ ...v3, sourceSha256: "invalid" }),
    env: { CODEX_SESSION_ID: "session" }, select: () => selected }));
});

test("injected authority readers cannot replace the host's repository or candidate binding", () => {
  let observed;
  resolveSessionCodexCriticHighRiskRoute({ ...base,
    authorityDependencies: { rootDir: "/different/repository",
      candidateCommit: "f".repeat(40) },
    resolveV3: (request) => { observed = request; return v3; }, env: {} });
  assert.equal(observed.rootDir, rootDir);
  assert.equal(observed.candidateCommit, candidateCommit);
});
