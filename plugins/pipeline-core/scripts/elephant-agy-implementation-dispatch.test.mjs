// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { functionalTaskRoutesForRunner, registeredFunctionalTaskRoutes } from "../lib/model-role-route-source.mjs";
import { admitModelRoleHostBootstrap, prepareModelRoleHostBootstrap } from "../lib/model-role-host-session.mjs";
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
    routeAuthority: () => ({ runner: "antigravity", provider: "google", requestedModel: "gemini-3.8-flash-medium", effort: "medium", routePolicySha256: "e".repeat(64) }),
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
    runLiveHost: async (request) => { sealed = request; return { status: "completed-undelivered", code: "AGY-SESSION-FINAL-UNDELIVERED", observed: { provider: null, model: "gemini-3.8-flash-medium", effectiveSandbox: "unknown" }, result: { path: "results/out.json", sha256: "f".repeat(64) }, record: { target: `evidence/dispatch-record-${request.packet.dispatchId}.json`, sha256: "e".repeat(64), attemptId: "attempt-1", authorship: "not-applicable" }, launcherCalls: 1, modelCalls: 1 }; },
  });
  assert.equal(sealed.requestedModel, "gemini-3.8-flash-medium"); assert.equal(sealed.effort, "medium"); assert.equal(sealed.consent, "stored"); assert.equal(sealed.scope.role, "pipeline-core:goldfish-implementor");
  assert.equal(result.status, "completed-undelivered"); assert.equal(result.route.provider, "google"); assert.equal(result.binding.inputSha256.length, 64); assert.equal(result.authority.fallbackPolicy, "none");
  assert.equal(result.observed.identityEvidence, "host-observed-model");
  assert.equal(result.record.target, `evidence/dispatch-record-${result.dispatchId}.json`);
  const pending = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request, resultPath: "results/pending.json", sessionId: "session-1", descriptorSha256: sha }, {
    ...value.common,
    runLiveHost: async () => ({ status: "final-pending-host-commit", code: "AGY-SESSION-FINAL-VALIDATED", observed: { model: "gemini-3.8-flash-medium" }, result: { path: "results/pending.json", sha256: "e".repeat(64) }, launcherCalls: 1, modelCalls: 1 }),
  });
  assert.equal(pending.status, "final-pending-host-commit");
  assert.equal(pending.observed.identityEvidence, "host-observed-model");
  const mismatchedModel = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request, resultPath: "results/mismatch.json", sessionId: "session-1", descriptorSha256: sha }, {
    ...value.common,
    runLiveHost: async () => ({ status: "final-pending-host-commit", code: "AGY-SESSION-FINAL-VALIDATED",
      observed: { model: "gemini-other" }, modelCalls: 1, launcherCalls: 1 }),
  });
  assert.equal(mismatchedModel.status, "recovery-required");
  assert.equal(mismatchedModel.code, "AGY-ELEPHANT-HOST-MODEL-UNVERIFIED");
  assert.equal(mismatchedModel.observed.identityEvidence, "unknown");
  const missingModelCall = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request, resultPath: "results/no-call.json", sessionId: "session-1", descriptorSha256: sha }, {
    ...value.common,
    runLiveHost: async () => ({ status: "completed-undelivered", code: "AGY-SESSION-FINAL-UNDELIVERED",
      observed: { model: "gemini-3.8-flash-medium" }, modelCalls: 0, launcherCalls: 0 }),
  });
  assert.equal(missingModelCall.status, "recovery-required");
  assert.equal(missingModelCall.code, "AGY-ELEPHANT-HOST-MODEL-UNVERIFIED");
  for (const [suffix, modelCalls] of [["absent", undefined], ["fractional", 0.5], ["nan", Number.NaN]]) {
    const invalidCount = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request,
      resultPath: `results/${suffix}-calls.json`, sessionId: "session-1", descriptorSha256: sha }, {
      ...value.common,
      runLiveHost: async () => ({ status: "final-pending-host-commit", code: "AGY-SESSION-FINAL-VALIDATED",
        observed: { model: "gemini-3.8-flash-medium" }, modelCalls, launcherCalls: 1 }),
    });
    assert.equal(invalidCount.status, "recovery-required");
    assert.equal(invalidCount.code, "AGY-ELEPHANT-HOST-MODEL-UNVERIFIED");
  }
  const invalidHostResult = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request, resultPath: "results/invalid-host.json", sessionId: "session-1", descriptorSha256: sha }, {
    ...value.common, runLiveHost: async () => null,
  });
  assert.equal(invalidHostResult.status, "recovery-required");
  assert.equal(invalidHostResult.code, "AGY-ELEPHANT-HOST-RESULT-INVALID");
  const thrownHost = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request,
    resultPath: "results/thrown-host.json", sessionId: "session-1", descriptorSha256: sha }, {
    ...value.common, runLiveHost: async () => { throw new Error("private provider diagnostic"); },
  });
  assert.equal(thrownHost.status, "recovery-required");
  assert.equal(thrownHost.code, "AGY-ELEPHANT-HOST-EXCEPTION");
  assert.equal(thrownHost.record, null);
  assert.equal(JSON.stringify(thrownHost).includes("private provider diagnostic"), false);
  const launchedFailure = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request,
    resultPath: "results/launched-failure.json", sessionId: "session-1", descriptorSha256: sha }, {
    ...value.common, runLiveHost: async () => ({ status: "unavailable", code: "AGY-TRANSPORT-FAILED",
      launcherCalls: 1, modelCalls: 1, observed: { model: "gemini-3.8-flash-medium" } }),
  });
  assert.equal(launchedFailure.status, "recovery-required");
  assert.equal(launchedFailure.code, "AGY-ELEPHANT-LAUNCHED-NONFINAL");
  const interrupted = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request,
    resultPath: "results/interrupted.json", sessionId: "session-1", descriptorSha256: sha }, {
    ...value.common, runLiveHost: async () => ({ status: "interrupted-recorded", code: "AGY-INTERRUPTION-RECORDED",
      launcherCalls: 1, modelCalls: 1, observed: { model: "gemini-3.8-flash-medium" },
      record: { target: "evidence/dispatch-record-agy-implementation-1.json", sha256: "f".repeat(64),
        attemptId: "1".repeat(32), authorship: "not-applicable" } }),
  });
  assert.equal(interrupted.status, "interrupted-recorded");
  assert.equal(interrupted.record?.authorship, "not-applicable");
  assert.equal(interrupted.result.sha256, null);
  const recovery = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request, resultPath: "results/recovery.json", sessionId: "session-1", descriptorSha256: sha }, {
    ...value.common,
    runLiveHost: async () => ({ status: "recovery-required", code: "AGY-UNDELIVERED-RECORD-UNVERIFIED", record: null, launcherCalls: 1, modelCalls: 1 }),
  });
  assert.equal(recovery.status, "recovery-required");
  assert.equal(recovery.record, null);
  assert.equal(recovery.modelCalls, 1);
  const missingRecord = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request, resultPath: "results/missing-record.json", sessionId: "session-1", descriptorSha256: sha }, {
    ...value.common,
    runLiveHost: async () => ({ status: "completed-undelivered", code: "AGY-SESSION-FINAL-UNDELIVERED",
      observed: { model: "gemini-3.8-flash-medium" }, record: null, launcherCalls: 1, modelCalls: 1 }),
  });
  assert.equal(missingRecord.status, "recovery-required");
  assert.equal(missingRecord.code, "AGY-UNDELIVERED-RECORD-UNVERIFIED");
});

test("route, session, binding and live unavailability stay typed with zero invented fallback", async () => {
  const value = fixture(); let calls = 0;
  const route = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request, resultPath: "results/out.json", sessionId: "session-1", descriptorSha256: sha }, { ...value.common, routeAuthority: () => null, runLiveHost: async () => { calls += 1; } });
  assert.equal(route.code, "AGY-ELEPHANT-ROUTE-UNAVAILABLE"); assert.equal(calls, 0);
  const unready = await dispatchElephantAgyImplementation({ root: value.root, dispatchRequestPath: value.request, resultPath: "results/next.json", sessionId: "session-1", descriptorSha256: sha }, { ...value.common, validateDispatchBinding: () => ({ ok: false, code: "AGY-CONSENT-SCOPE-MISMATCH" }), runLiveHost: async () => { calls += 1; } });
  assert.equal(unready.code, "AGY-CONSENT-SCOPE-MISMATCH"); assert.equal(calls, 0);
});

test("invalid optional model-role state visibly falls back to the consent-bound V3 route", async () => {
  const value = fixture(); let launches = 0;
  const args = { root: value.root, dispatchRequestPath: value.request,
    resultPath: "results/model-role.json", sessionId: "session-1", descriptorSha256: sha };
  const runLiveHost = async (sealed) => {
    launches += 1;
    assert.equal(sealed.requestedModel, "gemini-3.8-flash-medium");
    assert.equal(sealed.routePolicySha256, "e".repeat(64));
    return { status: "final-pending-host-commit", code: "AGY-SESSION-FINAL-VALIDATED",
      observed: { model: "gemini-3.8-flash-medium" }, modelCalls: 1, launcherCalls: 1 };
  };
  const wrong = await dispatchElephantAgyImplementation(args, { ...value.common,
    modelRoleStore: { inspect: () => ({ ok: true, status: "present" }),
      read: () => ({ ok: false, code: "MODEL-ROLE-STORE-BINDING" }) },
    runLiveHost });
  assert.equal(wrong.status, "final-pending-host-commit");
  assert.equal(wrong.modelRoleDiagnostic, "AGY-MODEL-ROLE-NOT-BOUND");
  assert.equal(wrong.route.requestedModel, "gemini-3.8-flash-medium");
  const unsafe = await dispatchElephantAgyImplementation(args, { ...value.common,
    modelRoleStore: { inspect: () => ({ ok: false, code: "MODEL-ROLE-STORE-UNAVAILABLE" }) },
    runLiveHost });
  assert.equal(unsafe.status, "final-pending-host-commit");
  assert.equal(unsafe.modelRoleDiagnostic, "AGY-MODEL-ROLE-STORE-UNAVAILABLE");
  const ambiguous = await dispatchElephantAgyImplementation(args, { ...value.common,
    modelRoleStore: { inspect: () => ({ ok: true, status: "unknown" }) },
    runLiveHost });
  assert.equal(ambiguous.status, "final-pending-host-commit");
  assert.equal(ambiguous.modelRoleDiagnostic, "AGY-MODEL-ROLE-STORE-UNAVAILABLE");
  const throws = await dispatchElephantAgyImplementation(args, { ...value.common,
    modelRoleStore: { inspect: () => { throw new Error("private path"); } }, runLiveHost });
  assert.equal(throws.status, "final-pending-host-commit");
  assert.equal(throws.modelRoleDiagnostic, "AGY-MODEL-ROLE-STORE-UNAVAILABLE");
  assert.equal(JSON.stringify(throws).includes("private path"), false);
  assert.equal(launches, 4);
  const denied = await dispatchElephantAgyImplementation(args, { ...value.common,
    modelRoleStore: { inspect: () => ({ ok: false }) },
    validateDispatchBinding: () => ({ ok: false, code: "AGY-CONSENT-SCOPE-MISMATCH" }),
    runLiveHost });
  assert.equal(denied.code, "AGY-CONSENT-SCOPE-MISMATCH");
  assert.equal(launches, 4);
});

test("one admitted Agy session selects its approved replacement model before scope and consent binding", async () => {
  const value = fixture();
  const source = functionalTaskRoutesForRunner(registeredFunctionalTaskRoutes(), "antigravity");
  const modelFor = ({ role, effort }) => role === "worker" && effort === "medium"
    ? "gemini-approved-next-worker" : `agy-${role}-${effort}`;
  const proposal = prepareModelRoleHostBootstrap({ sessionId: "session-1",
    candidateCommit: "b".repeat(40), observedAt: "2026-09-26T00:00:00.000Z",
    routeSource: source,
    approvedPolicies: source.configuredRoutes.map((route) => ({ runner: route.runner,
      role: route.role, effort: route.effort,
      policy: { schema: "pipeline.model-role-policy.v1", runner: route.runner,
        role: route.role, approved: [{ modelId: modelFor(route), rank: 1,
          efforts: [route.effort], compatibilityEvidenceSha256: "d".repeat(64) }] } })),
    observations: source.configuredRoutes.map((route) => ({ runner: route.runner,
      role: route.role, effort: route.effort, ok: true,
      assurance: "installed-host-observed", availableModelIds: [modelFor(route)] })) });
  assert.equal(proposal.ok, true);
  let held;
  const modelRoleStore = { inspect: () => ({ ok: true, status: "present" }),
    persist: (entry) => { held = entry; return { ok: true }; },
    read: () => ({ ok: true, ...held }) };
  assert.equal(admitModelRoleHostBootstrap({ proposal, store: modelRoleStore,
    acknowledgement: { sessionId: "session-1", confirmed: true,
      readbackSha256: proposal.readback.readbackSha256 } }).ok, true);
  let sealed; let bound;
  const result = await dispatchElephantAgyImplementation({ root: value.root,
    dispatchRequestPath: value.request, resultPath: "results/approved.json",
    sessionId: "session-1", descriptorSha256: sha }, { ...value.common,
    modelRoleStore,
    validateDispatchBinding: (_record, input) => { bound = input; return { ok: true }; },
    runLiveHost: async (request) => { sealed = request; return {
      status: "final-pending-host-commit", code: "AGY-SESSION-FINAL-VALIDATED",
      observed: { model: "gemini-approved-next-worker" }, modelCalls: 1, launcherCalls: 1 }; } });
  assert.equal(result.status, "final-pending-host-commit");
  assert.equal(sealed.requestedModel, "gemini-approved-next-worker");
  assert.equal(bound.requestedModel, sealed.requestedModel);
  assert.equal(bound.scope.routePolicySha256, sealed.routePolicySha256);
  assert.notEqual(sealed.routePolicySha256, "e".repeat(64));
  assert.equal(result.observed.identityEvidence, "host-observed-model");
});
