// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatchElephantAgyImplementation, parseArgs } from "./elephant-agy-implementation-dispatch.mjs";

const sha = "a".repeat(64);
const packet = (role = "pipeline-core:goldfish-implementor") => ({
  schema: "pipeline.role-dispatch-request.v1", dispatchId: "agy-implementation-1", transport: "antigravity", role,
  prompt: "bounded implementation", candidate: { commit: "b".repeat(40), tree: "c".repeat(40) }, requiredPaths: ["input.txt"], requiredPathSha256: { "input.txt": "d".repeat(64) }, resultDestination: { kind: "return" },
});

function fixture(role) {
  const root = mkdtempSync(join(tmpdir(), "elephant-agy-"));
  const request = join(root, "request.json");
  writeFileSync(request, JSON.stringify(packet(role)));
  const stored = { subjectSha256: sha, mode: "chat", subject: { fallbackPolicy: "none" } };
  const common = {
    routeAuthority: () => ({ runner: "antigravity", provider: "google", requestedModel: "gemini-3.8-flash-high", effort: "high", routePolicySha256: "e".repeat(64) }),
    preflightRoleDispatch: ({ packet: value }) => ({ status: "prepared", packet: value, candidate: value.candidate }),
    loadLiveSession: () => ({ ok: true, session: { id: "session-1", descriptorSha256: sha }, descriptor: { repo: { primaryRoot: root, commonDir: root } } }),
    loadStoredConsent: () => ({ record: stored, descriptor: { repo: { primaryRoot: root, commonDir: root } } }),
    validateConsentRecord: () => ({ ok: true }),
    validateDispatchBinding: () => ({ ok: true }),
  };
  return { root, request, common };
}

test("closed CLI omits caller authority flags", () => {
  assert.deepEqual(parseArgs(["dispatch", "--root", "/repo", "--request", "/repo/request.json", "--result-path", "results/out.json", "--session-id", "session-1", "--descriptor-sha256", sha]), { root: "/repo", dispatchRequestPath: "/repo/request.json", resultPath: "results/out.json", sessionId: "session-1", descriptorSha256: sha });
  assert.throws(() => parseArgs(["dispatch", "--root", "/repo", "--model", "x"]), /usage/u);
});

test("forbidden roles and missing consent never reach the live host", async () => {
  const forbidden = fixture("pipeline-core:critic"); let launches = 0;
  const blocked = await dispatchElephantAgyImplementation({ root: forbidden.root, dispatchRequestPath: forbidden.request, resultPath: "results/out.json", sessionId: "session-1", descriptorSha256: sha }, { ...forbidden.common, runLiveHost: async () => { launches += 1; } });
  assert.equal(blocked.code, "AGY-ELEPHANT-ROLE-FORBIDDEN"); assert.equal(launches, 0);
  const missing = fixture();
  const denied = await dispatchElephantAgyImplementation({ root: missing.root, dispatchRequestPath: missing.request, resultPath: "results/out.json", sessionId: "session-1", descriptorSha256: sha }, { ...missing.common, loadStoredConsent: () => ({ record: null }), runLiveHost: async () => { launches += 1; } });
  assert.equal(denied.code, "AGY-SESSION-CONSENT-REQUIRED"); assert.equal(launches, 0);
});

test("sealed route derives every execution choice and binds its closed receipt", async () => {
  const value = fixture(); let sealed = null;
  const result = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request, resultPath: "results/out.json", sessionId: "session-1", descriptorSha256: sha }, {
    ...value.common,
    runLiveHost: async (request) => { sealed = request; return { status: "succeeded", code: "AGY-SESSION-COMPLETED", observed: { provider: null, model: "gemini-3.8-flash-high", effectiveSandbox: "unknown" }, result: { path: "results/out.json", sha256: "f".repeat(64) }, launcherCalls: 1, modelCalls: 1 }; },
  });
  assert.equal(sealed.requestedModel, "gemini-3.8-flash-high"); assert.equal(sealed.effort, "high"); assert.equal(sealed.consent, "stored"); assert.equal(sealed.scope.role, "pipeline-core:goldfish-implementor");
  assert.equal(result.status, "succeeded"); assert.equal(result.route.provider, "google"); assert.equal(result.binding.inputSha256.length, 64); assert.equal(result.authority.fallbackPolicy, "none");
});

test("route, session, binding and live unavailability stay typed with zero invented fallback", async () => {
  const value = fixture(); let calls = 0;
  const route = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request, resultPath: "results/out.json", sessionId: "session-1", descriptorSha256: sha }, { ...value.common, routeAuthority: () => null, runLiveHost: async () => { calls += 1; } });
  assert.equal(route.code, "AGY-ELEPHANT-ROUTE-UNAVAILABLE"); assert.equal(calls, 0);
  const unready = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request, resultPath: "results/next.json", sessionId: "session-1", descriptorSha256: sha }, { ...value.common, validateDispatchBinding: () => ({ ok: false, code: "AGY-CONSENT-SCOPE-MISMATCH" }), runLiveHost: async () => { calls += 1; } });
  assert.equal(unready.code, "AGY-CONSENT-SCOPE-MISMATCH"); assert.equal(calls, 0);
});
