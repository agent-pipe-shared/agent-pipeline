// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatchElephantImplementation, parseArgs } from "./elephant-implementation-dispatch.mjs";

const SHA = "a".repeat(64);
const packet = (overrides = {}) => ({
  schema: "pipeline.role-dispatch-request.v1",
  dispatchId: "agy-production-route-1",
  transport: "antigravity",
  role: "pipeline-core:goldfish-implementor",
  prompt: "bounded implementation",
  candidate: { commit: "b".repeat(40), tree: "c".repeat(40) },
  requiredPaths: ["input.txt"],
  requiredPathSha256: { "input.txt": "d".repeat(64) },
  resultDestination: { kind: "return" },
  ...overrides,
});

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "elephant-production-route-"));
  mkdirSync(join(root, "results"));
  const request = join(root, "request.json");
  writeFileSync(request, JSON.stringify(packet(overrides.packet)));
  let launches = 0;
  const dependencies = {
    routeAuthority: () => ({ runner: "antigravity", provider: "google", requestedModel: "gemini-3.8-flash-high", effort: "high", routePolicySha256: "e".repeat(64) }),
    preflightRoleDispatch: ({ packet: value }) => ({ status: "prepared", packet: value, candidate: value.candidate }),
    loadLiveSession: () => ({ ok: true, session: { id: "session-1", descriptorSha256: SHA }, descriptor: { repo: { primaryRoot: root, commonDir: root } } }),
    loadStoredConsent: () => ({ record: { subjectSha256: SHA, mode: "chat", subject: { fallbackPolicy: "none" } }, descriptor: { repo: { primaryRoot: root, commonDir: root } } }),
    validateConsentRecord: () => ({ ok: true }),
    validateDispatchBinding: () => ({ ok: true }),
    runLiveHost: async () => { launches += 1; return { status: "succeeded", code: "AGY-SESSION-COMPLETED", observed: { provider: "google", model: "gemini-3.8-flash-high", effectiveSandbox: "unknown" }, result: { path: "results/out.json", sha256: "f".repeat(64) }, launcherCalls: 1, modelCalls: 1 }; },
  };
  return { root, request, dependencies, launches: () => launches };
}

function input(value, overrides = {}) {
  return { root: value.root, dispatchRequestPath: value.request, resultPath: "results/out.json", sessionId: "session-1", descriptorSha256: SHA, ...overrides };
}

test("canonical Elephant route invokes the sealed AGY route and advertises no fallback", async () => {
  const value = fixture();
  const result = await dispatchElephantImplementation(input(value), value.dependencies);
  assert.equal(result.status, "succeeded");
  assert.equal(result.code, "AGY-SESSION-COMPLETED");
  assert.equal(result.selection.selectedRoute, "antigravity-session-consent");
  assert.equal(result.selection.fallback, "not-attempted");
  assert.equal(result.selection.fallbackRequirement, "new-po-decision");
  assert.equal(value.launches(), 1);
  assert.equal(result.inner.binding.role, "pipeline-core:goldfish-implementor");
});

test("outer route denies non-AGY selection, forbidden role and malformed request without a fallback", async () => {
  const nonAgy = fixture({ packet: { transport: "codex" } });
  const notSelected = await dispatchElephantImplementation(input(nonAgy), nonAgy.dependencies);
  assert.equal(notSelected.code, "ELEPHANT-IMPLEMENTATION-ROUTE-NOT-SELECTED");
  assert.equal(nonAgy.launches(), 0);
  const critic = fixture({ packet: { role: "pipeline-core:critic" } });
  const role = await dispatchElephantImplementation(input(critic), critic.dependencies);
  assert.equal(role.code, "ELEPHANT-IMPLEMENTATION-ROLE-FORBIDDEN");
  assert.equal(critic.launches(), 0);
  const malformed = fixture(); writeFileSync(malformed.request, "not-json");
  const invalid = await dispatchElephantImplementation(input(malformed), malformed.dependencies);
  assert.equal(invalid.code, "ELEPHANT-IMPLEMENTATION-REQUEST-JSON");
  assert.equal(malformed.launches(), 0);
});

test("absence, stale session, altered route, scope and request binding fail on the selected route before a model launch", async () => {
  const missing = fixture();
  const noConsent = await dispatchElephantImplementation(input(missing), { ...missing.dependencies, loadStoredConsent: () => ({ record: null }) });
  assert.equal(noConsent.code, "AGY-SESSION-CONSENT-REQUIRED");
  assert.equal(missing.launches(), 0);
  const stale = fixture();
  const noOwner = await dispatchElephantImplementation(input(stale), { ...stale.dependencies, loadLiveSession: () => ({ ok: false, code: "AGY-SESSION-OWNER-STALE" }) });
  assert.equal(noOwner.code, "AGY-SESSION-OWNER-STALE");
  assert.equal(stale.launches(), 0);
  for (const route of [
    { runner: "antigravity", provider: "other", requestedModel: "gemini-3.8-flash-high", effort: "high", routePolicySha256: "e".repeat(64) },
    { runner: "antigravity", provider: "google", requestedModel: "gemini-other", effort: "high", routePolicySha256: "e".repeat(64) },
    { runner: "antigravity", provider: "google", requestedModel: "gemini-3.8-flash-high", effort: "low", routePolicySha256: "e".repeat(64) },
  ]) {
    const changed = fixture();
    const result = await dispatchElephantImplementation(input(changed), { ...changed.dependencies, routeAuthority: () => route });
    assert.equal(result.code, "AGY-ELEPHANT-ROUTE-MISMATCH");
    assert.equal(changed.launches(), 0);
  }
  const scope = fixture();
  const mismatch = await dispatchElephantImplementation(input(scope), { ...scope.dependencies, validateDispatchBinding: () => ({ ok: false, code: "AGY-CONSENT-SCOPE-MISMATCH" }) });
  assert.equal(mismatch.code, "AGY-CONSENT-SCOPE-MISMATCH");
  assert.equal(scope.launches(), 0);
  const invalidInput = fixture();
  const badPath = await dispatchElephantImplementation(input(invalidInput, { resultPath: "../escape.json" }), invalidInput.dependencies);
  assert.equal(badPath.code, "AGY-ELEPHANT-ARGS");
  assert.equal(invalidInput.launches(), 0);
});

test("outer CLI has the same closed argument surface as the sealed implementation route", () => {
  assert.deepEqual(parseArgs(["dispatch", "--root", "/repo", "--request", "/repo/request.json", "--result-path", "results/out.json", "--session-id", "session-1", "--descriptor-sha256", SHA]), { root: "/repo", dispatchRequestPath: "/repo/request.json", resultPath: "results/out.json", sessionId: "session-1", descriptorSha256: SHA });
  assert.throws(() => parseArgs(["dispatch", "--root", "/repo", "--fallback", "codex"]), /usage/u);
});
