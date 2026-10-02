// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const cases = [];
function test(name, run) { cases.push({ id: `MFH${String(cases.length + 1).padStart(3, "0")}`, name, run }); }
import { canonicalizeJson } from "./governance-event.mjs";
import { createModelFamilyRuntimeHost, observeModelFamilyActivation } from "./model-family-runtime-host.mjs";

const noopSources = {
  readAuthorityInputs: () => ({ ok: false, code: "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED" }),
  readPinInputs: () => [],
  readFreshDiscovery: () => ({ ok: false, code: "ADAPTER_CONTRACT_UNQUALIFIED" }),
  readCurrentCandidate: () => ({ candidateCommit: "3".repeat(40), candidateTree: "4".repeat(40) }),
  launchDriver: () => ({ ok: false }),
};
const authoritySha256 = "a".repeat(64);
function writeActiveState(commonDir) {
  const privateRoot = join(commonDir, "agent-pipeline");
  const familyDir = join(privateRoot, "model-family-host");
  const receipts = join(familyDir, "receipts");
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  mkdirSync(familyDir, { recursive: true, mode: 0o700 });
  mkdirSync(receipts, { recursive: true, mode: 0o700 });
  const marker = { schema: "pipeline.model-family-host-activation.v1", activationId: "b".repeat(64),
    authoritySha256, createdAt: "2026-10-01T12:00:00.000Z" };
  const state = { schema: "pipeline.model-family-host-state.v1", generation: 0, activation: "family-active",
    authoritySha256, pinStates: [], watermarks: [], invocationIndex: [] };
  const stateSha256 = createHash("sha256").update(canonicalizeJson(state)).digest("hex");
  const stateFile = `generation-0-${stateSha256}.json`;
  const pointer = { schema: "pipeline.model-family-host-state-pointer.v1", generation: 0, stateFile, stateSha256 };
  writeFileSync(join(familyDir, "activation.json"), JSON.stringify(marker), { mode: 0o600 });
  writeFileSync(join(familyDir, stateFile), JSON.stringify(state), { mode: 0o600 });
  writeFileSync(join(familyDir, "current.json"), JSON.stringify(pointer), { mode: 0o600 });
}

test("missing fixed store is physically inactive and observation creates no activation marker", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "family-runtime-inactive-"));
  try {
    const host = createModelFamilyRuntimeHost({ cwd: commonDir, resolveCommonDir: () => commonDir,
      trustedSources: noopSources });
    const result = host.observeActivation();
    assert.equal(result.ok, true);
    assert.equal(result.status, "inactive");
    assert.equal(result.privateRoot, join(commonDir, "agent-pipeline"));
    assert.equal(observeModelFamilyActivation({ cwd: commonDir, resolveCommonDir: () => commonDir }).status, "inactive");
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

test("valid activation marker is observed only with readable S4 state", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "family-runtime-active-"));
  try {
    writeActiveState(commonDir);
    const host = createModelFamilyRuntimeHost({ cwd: commonDir, resolveCommonDir: () => commonDir,
      trustedSources: noopSources });
    const result = host.observeActivation();
    assert.equal(result.ok, true, result.code);
    assert.equal(result.status, "active");
    assert.equal(result.authoritySha256, authoritySha256);
    assert.equal(result.stateGeneration, 0);
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

test("corrupt marker, lost active state and symlink parent return uncertainty rather than inactive", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "family-runtime-corrupt-"));
  const alias = `${commonDir}-alias`;
  try {
    writeActiveState(commonDir);
    const marker = join(commonDir, "agent-pipeline", "model-family-host", "activation.json");
    unlinkSync(marker);
    let host = createModelFamilyRuntimeHost({ cwd: commonDir, resolveCommonDir: () => commonDir,
      trustedSources: noopSources });
    assert.equal(host.observeActivation().status, "uncertain");

    writeActiveState(commonDir);
    const pointer = join(commonDir, "agent-pipeline", "model-family-host", "current.json");
    unlinkSync(pointer);
    host = createModelFamilyRuntimeHost({ cwd: commonDir, resolveCommonDir: () => commonDir,
      trustedSources: noopSources });
    assert.equal(host.observeActivation().status, "uncertain");

    symlinkSync(commonDir, alias, "dir");
    host = createModelFamilyRuntimeHost({ cwd: alias, resolveCommonDir: () => alias,
      trustedSources: noopSources });
    assert.equal(host.observeActivation().status, "uncertain");
  } finally { rmSync(commonDir, { recursive: true, force: true }); try { unlinkSync(alias); } catch {} }
});

test("current identity is returned only by the trusted source and has independent session and invocation IDs", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "family-runtime-identity-"));
  try {
    const request = { runner: "codex", taskRoute: "duty.readiness", invocationId: "dispatch-unique" };
    const value = { ok: true, key: { runner: "codex", installationBindingSha256: "a".repeat(64),
      accountBindingSha256: "b".repeat(64), sessionId: "host-session", invocationId: request.invocationId },
      assignment: { runner: "codex", taskRoute: request.taskRoute, role: "frontier", effort: "medium", familyId: "sol" },
      candidateCommit: "3".repeat(40), candidateTree: "4".repeat(40) };
    const host = createModelFamilyRuntimeHost({ cwd: commonDir, resolveCommonDir: () => commonDir,
      trustedSources: { ...noopSources, resolveCurrentInvocationIdentity: (input) => {
        assert.deepEqual(input, request);
        return value;
      } } });
    const observed = host.resolveCurrentInvocationIdentity(request);
    assert.equal(observed.ok, true, observed.code);
    assert.equal(observed.key.sessionId, "host-session");
    assert.equal(observed.key.invocationId, "dispatch-unique");
    assert.equal(observed.candidateCommit, "3".repeat(40));

    const absent = createModelFamilyRuntimeHost({ cwd: commonDir, resolveCommonDir: () => commonDir,
      trustedSources: noopSources }).resolveCurrentInvocationIdentity(request);
    assert.equal(absent.code, "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED");
    const forgedEcho = createModelFamilyRuntimeHost({ cwd: commonDir, resolveCommonDir: () => commonDir,
      trustedSources: { ...noopSources, resolveCurrentInvocationIdentity: (input) => ({ ...value,
        key: { ...value.key, sessionId: input.invocationId } }) } }).resolveCurrentInvocationIdentity(request);
    assert.equal(forgedEcho.code, "MODEL-FAMILY-IDENTITY-UNAVAILABLE");
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

registerTestCaseCompletion({ cases, fd: 3, maxBytes: 65536 });
