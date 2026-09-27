// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { openSync } from "node:fs";
import { functionalTaskRoutesForRunner, registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";
import { admitModelRoleHostBootstrap, bindStoredModelRoleDispatch,
  prepareModelRoleHostBootstrap, selectStoredModelRoleDispatch } from "./model-role-host-session.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
function test(name, run) { cases.push({ id: `MRH${String(cases.length + 1).padStart(2, "0")}`, name, run }); }

const source = registeredFunctionalTaskRoutes();
const sessionId = "session-host-1";
const entries = source.configuredRoutes.map((route) => ({ ...route,
  modelId: `model-${route.runner}-${route.role}-${route.effort}` }));
const input = { sessionId, candidateCommit: "a".repeat(40),
  observedAt: "2026-09-26T00:00:00.000Z", routeSource: source,
  approvedPolicies: entries.map(({ modelId, selector, ...route }) => ({ ...route,
    policy: { schema: "pipeline.model-role-policy.v1", runner: route.runner, role: route.role,
      approved: [{ modelId, rank: 1, efforts: [route.effort],
        compatibilityEvidenceSha256: "b".repeat(64) }] } })),
  observations: entries.map(({ modelId, selector, ...route }) => ({ ...route,
    ok: true, assurance: route.runner === "claude"
      ? "host-observed-single-call-not-provider-attested" : "installed-host-observed",
    availableModelIds: [modelId] })) };

test("host bootstrap resolves all governed routes and stores only an acknowledged set", () => {
  const proposal = prepareModelRoleHostBootstrap(input);
  assert.equal(proposal.ok, true);
  assert.equal(proposal.receipts.length, source.configuredRoutes.length);
  const stored = new Map();
  const store = { persist: (value) => { stored.set(value.sessionId, value); return { ok: true }; },
    read: (id) => ({ ok: true, ...stored.get(id) }) };
  assert.equal(admitModelRoleHostBootstrap({ proposal, store }).code,
    "MODEL-ROLE-BOOTSTRAP-ACKNOWLEDGEMENT-REQUIRED");
  assert.equal(stored.size, 0);
  const acknowledgement = { sessionId, confirmed: true,
    readbackSha256: proposal.readback.readbackSha256 };
  const admitted = admitModelRoleHostBootstrap({ proposal, acknowledgement, store });
  assert.equal(admitted.ok, true);
  const selected = entries.find((entry) => entry.runner === "codex" && entry.role === "worker" && entry.effort === "high");
  assert.equal(bindStoredModelRoleDispatch({ taskRoute: "duty.implement", runner: "codex",
    sessionId, requestedModel: selected.modelId, store, routeSource: source }).ok, true);
  assert.equal(bindStoredModelRoleDispatch({ taskRoute: "duty.implement", runner: "codex",
    sessionId, requestedModel: "wrong-model", store, routeSource: source }).code,
    "MODEL-ROLE-DISPATCH-MISMATCH");
});

test("incomplete observations and API-only Claude catalogue cannot admit a session", () => {
  const missing = { ...input, observations: input.observations.slice(1) };
  assert.equal(prepareModelRoleHostBootstrap(missing).code, "MODEL-ROLE-HOST-SOURCE-INCOMPLETE");
  const apiOnly = structuredClone(input);
  apiOnly.observations.find((entry) => entry.runner === "claude").assurance = "api-credential-only";
  assert.equal(prepareModelRoleHostBootstrap(apiOnly).code,
    "MODEL-ROLE-HOST-OBSERVATION-UNAVAILABLE");
});

test("next session keeps old model until approved policy changes and binds one changed-mapping acknowledgement", () => {
  const first = prepareModelRoleHostBootstrap(input);
  const next = structuredClone(input);
  next.sessionId = "session-host-2";
  next.previousReceipts = first.receipts;
  const target = next.approvedPolicies.find((entry) => entry.runner === "codex"
    && entry.role === "worker" && entry.effort === "high");
  target.policy.approved.push({ modelId: "new-worker", rank: 2, efforts: ["high"],
    compatibilityEvidenceSha256: "d".repeat(64) });
  next.observations.find((entry) => entry.runner === "codex"
    && entry.role === "worker" && entry.effort === "high").availableModelIds.push("new-worker");
  const proposal = prepareModelRoleHostBootstrap(next);
  assert.equal(proposal.ok, true);
  assert.equal(proposal.readback.mappings.some((item) => item.runner === "codex"
    && item.role === "worker" && item.effort === "high" && item.change === "changed"
    && item.modelId === "new-worker"), true);
  const store = { persist: () => ({ ok: true }) };
  assert.equal(admitModelRoleHostBootstrap({ proposal, store, acknowledgement: {
    sessionId: next.sessionId, confirmed: true,
    readbackSha256: first.readback.readbackSha256 } }).code,
    "MODEL-ROLE-BOOTSTRAP-ACKNOWLEDGEMENT-REQUIRED");
  assert.equal(admitModelRoleHostBootstrap({ proposal, store, acknowledgement: {
    sessionId: next.sessionId, confirmed: true,
    readbackSha256: proposal.readback.readbackSha256 } }).ok, true);
});

test("pre-packet selection reads one admitted runner and refuses unknown or foreign routes", () => {
  const codexSource = functionalTaskRoutesForRunner(source, "codex");
  const scopedInput = { ...input, routeSource: codexSource,
    approvedPolicies: input.approvedPolicies.filter((entry) => entry.runner === "codex"),
    observations: input.observations.filter((entry) => entry.runner === "codex") };
  const proposal = prepareModelRoleHostBootstrap(scopedInput);
  assert.equal(proposal.ok, true);
  let held;
  const store = { persist: (value) => { held = value; return { ok: true }; },
    read: () => ({ ok: true, ...held }) };
  const acknowledgement = { sessionId, confirmed: true,
    readbackSha256: proposal.readback.readbackSha256 };
  assert.equal(admitModelRoleHostBootstrap({ proposal, acknowledgement, store }).ok, true);
  const selected = entries.find((entry) => entry.runner === "codex"
    && entry.role === "worker" && entry.effort === "high");
  const chosen = selectStoredModelRoleDispatch({ taskRoute: "duty.implement", runner: "codex",
    sessionId, store, routeSource: codexSource });
  assert.equal(chosen.ok, true);
  assert.equal(chosen.modelId, selected.modelId);
  assert.equal(chosen.receiptSha256.length, 64);
  assert.equal(selectStoredModelRoleDispatch({ taskRoute: "duty.not-registered", runner: "codex",
    sessionId, store, routeSource: codexSource }).ok, false);
  assert.equal(selectStoredModelRoleDispatch({ taskRoute: "duty.implement", runner: "claude",
    sessionId, store, routeSource: codexSource }).ok, false);
});

assert.equal(cases.length, 4);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
