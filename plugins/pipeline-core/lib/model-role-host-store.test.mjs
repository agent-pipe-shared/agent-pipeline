// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, chmodSync, openSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { functionalTaskRoutesForRunner, registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";
import { prepareModelRoleHostBootstrap, admitModelRoleHostBootstrap,
  bindStoredModelRoleDispatch } from "./model-role-host-session.mjs";
import { createModelRoleHostStore } from "./model-role-host-store.mjs";
import { createModelRolePolicyApprovalIntent, verifyModelRoleApprovedPolicy } from "./model-role-approved-policy.mjs";
import { deriveV3BaselinePolicies } from "./model-role-v3-baseline.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
function test(name, run) { cases.push({ id: `MRSR${String(cases.length + 1).padStart(2, "0")}`, name, run }); }
const source = registeredFunctionalTaskRoutes();
const activeSource = functionalTaskRoutesForRunner(source, "codex");
const entries = source.configuredRoutes.map((route) => ({ ...route,
  modelId: `model-${route.runner}-${route.role}-${route.effort}` }));
const policyByRole = new Map();
for (const route of entries) {
  const key = `${route.runner}:${route.role}`;
  if (!policyByRole.has(key)) policyByRole.set(key, { schema: "pipeline.model-role-policy.v1",
    runner: route.runner, role: route.role, approved: [] });
  const approved = policyByRole.get(key).approved;
  approved.push({ modelId: route.modelId, rank: approved.length + 1,
    efforts: [route.effort], compatibilityEvidenceSha256: "b".repeat(64) });
}
const sessionId = "session-store-1";
const allApprovedPolicies = entries.map(({ modelId, selector, ...route }) => ({ ...route,
  policy: policyByRole.get(`${route.runner}:${route.role}`) }));
const bootstrapInput = { sessionId, candidateCommit: "a".repeat(40),
  observedAt: "2026-09-26T00:00:00.000Z", routeSource: activeSource,
  approvedPolicies: allApprovedPolicies.filter((entry) => entry.runner === "codex"),
  observations: entries.filter((entry) => entry.runner === "codex").map(({ modelId, selector, ...route }) => ({ ...route,
    ok: true, assurance: route.runner === "claude"
      ? "host-observed-single-call-not-provider-attested" : "installed-host-observed",
    availableModelIds: [modelId] })) };
const proposal = prepareModelRoleHostBootstrap(bootstrapInput);
const acknowledgement = { sessionId, confirmed: true,
  readbackSha256: proposal.readback.readbackSha256 };
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ format: "pem", type: "spki" });
const trustAnchors = [{ keyReference: "test-po-key",
  publicKeySha256: createHash("sha256").update(publicPem).digest("hex") }];
const candidateAtApproval = { commit: "a".repeat(40), tree: "c".repeat(40) };
const approvalIntent = createModelRolePolicyApprovalIntent({ routeSource: source,
  approvedPolicies: allApprovedPolicies, candidateAtApproval });
const authority = { routeSource: source, bundle: {
  schema: "pipeline.model-role-approved-policy.v1", candidateAtApproval,
  approvedPolicies: allApprovedPolicies, approvalIntent,
  proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: approvalIntent.sha256,
    keyReference: "test-po-key", publicKey: publicPem,
    signatureBase64: sign(null, Buffer.from(approvalIntent.sha256, "utf8"), privateKey).toString("base64") },
} };
const verifyAuthority = (value) => verifyModelRoleApprovedPolicy({ bundle: value?.bundle,
  routeSource: value?.routeSource, trustAnchors });

test("private exclusive store readback binds the admitted session and dispatch", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "model-role-store-"));
  try {
    const store = createModelRoleHostStore(commonDir, { verifyAuthority });
    assert.equal(store.read(sessionId).ok, false);
    assert.equal(admitModelRoleHostBootstrap({ proposal, acknowledgement, store, authority }).ok, true);
    assert.equal(store.read(sessionId).ok, true);
    assert.equal(admitModelRoleHostBootstrap({ proposal, acknowledgement, store, authority }).code,
      "MODEL-ROLE-HOST-STORE-UNAVAILABLE");
    const selected = entries.find((entry) => entry.runner === "codex" && entry.role === "worker" && entry.effort === "high");
    assert.equal(bindStoredModelRoleDispatch({ taskRoute: "duty.implement", runner: "codex",
      sessionId, requestedModel: selected.modelId, store }).ok, true);
    const path = join(commonDir, "agent-pipeline", "run", "model-role-sessions", `${sessionId}.json`);
    const original = readFileSync(path);
    writeFileSync(path, original.subarray(0, original.length - 4));
    assert.equal(store.read(sessionId).ok, false);
    chmodSync(path, 0o644);
    assert.equal(store.read(sessionId).code, "MODEL-ROLE-STORE-TARGET");
    unlinkSync(path);
    symlinkSync("missing-private-receipt.json", path);
    assert.equal(store.inspect(sessionId).status, "present");
    assert.equal(store.read(sessionId).ok, false);
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

test("a later session reads the last complete mapping and avoids a repeated acknowledgement", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "model-role-store-latest-"));
  try {
    const store = createModelRoleHostStore(commonDir, { verifyAuthority });
    assert.deepEqual(store.latest().receipts, []);
    assert.equal(admitModelRoleHostBootstrap({ proposal, acknowledgement, store, authority }).ok, true);
    const previous = store.latest();
    assert.equal(previous.ok, true);
    assert.equal(previous.sessionId, sessionId);
    assert.equal(store.latest(null, "claude").sessionId, null,
      "a Codex session is never the previous Claude mapping");
    const next = prepareModelRoleHostBootstrap({ ...bootstrapInput,
      sessionId: "session-store-2", observedAt: "2026-09-26T00:01:00.000Z",
      previousReceipts: previous.receipts });
    assert.equal(next.ok, true);
    assert.equal(next.readback.acknowledgementRequired, false);
    assert.equal(admitModelRoleHostBootstrap({ proposal: next, store, authority }).ok, true);
    assert.equal(store.latest().sessionId, "session-store-2");
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

test("a syntactically valid rewritten session cannot forge the signed model policy", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "model-role-store-forged-"));
  try {
    const store = createModelRoleHostStore(commonDir, { verifyAuthority });
    assert.equal(admitModelRoleHostBootstrap({ proposal, acknowledgement, store, authority }).ok, true);
    const path = join(commonDir, "agent-pipeline", "run", "model-role-sessions", `${sessionId}.json`);
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.authority.bundle.approvedPolicies[0].policy.approved[0].modelId = "forged-model";
    writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    assert.equal(store.read(sessionId).code, "MODEL-ROLE-STORE-BINDING");
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

test("the production reader verifies the pinned policy against configured trust anchors", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "model-role-store-root-"));
  try {
    mkdirSync(join(rootDir, "project"));
    writeFileSync(join(rootDir, "project", "critical-human-proof.json"), JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"],
      waivedKinds: [], trustAnchors,
    }));
    const store = createModelRoleHostStore(rootDir, { rootDir });
    assert.equal(admitModelRoleHostBootstrap({ proposal, acknowledgement, store, authority }).ok, true);
    assert.equal(store.read(sessionId).ok, true);
    writeFileSync(join(rootDir, "project", "critical-human-proof.json"), JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"],
      waivedKinds: [], trustAnchors: [{ keyReference: "other-key", publicKeySha256: "d".repeat(64) }],
    }));
    assert.equal(store.read(sessionId).code, "MODEL-ROLE-STORE-BINDING");
  } finally { rmSync(rootDir, { recursive: true, force: true }); }
});

test("the production reader admits only an unchanged exact V3 baseline", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "model-role-store-v3-"));
  try {
    const observations = activeSource.configuredRoutes.map((route) => ({
      runner: route.runner, role: route.role, effort: route.effort,
      ok: true, assurance: "installed-host-observed",
      availableModelIds: [route.selector.value],
    }));
    const baseline = deriveV3BaselinePolicies({ routeSource: source,
      runner: "codex", observations });
    assert.equal(baseline.ok, true);
    const current = prepareModelRoleHostBootstrap({ ...bootstrapInput,
      approvedPolicies: baseline.approvedPolicies, observations });
    assert.equal(current.ok, true);
    const store = createModelRoleHostStore(commonDir);
    const boundAuthority = { mode: "v3-baseline", routeSource: source, observations };
    assert.equal(admitModelRoleHostBootstrap({ proposal: current, store,
      authority: boundAuthority, acknowledgement: { sessionId,
        confirmed: true, readbackSha256: current.readback.readbackSha256 } }).ok, true);
    assert.equal(store.read(sessionId).ok, true);
    const path = join(commonDir, "agent-pipeline", "run", "model-role-sessions", `${sessionId}.json`);
    const forged = JSON.parse(readFileSync(path, "utf8"));
    forged.authority.observations[0].availableModelIds = ["new-unapproved-model"];
    writeFileSync(path, `${JSON.stringify(forged)}\n`, { mode: 0o600 });
    assert.equal(store.read(sessionId).code, "MODEL-ROLE-STORE-BINDING");
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

assert.equal(cases.length, 5);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
