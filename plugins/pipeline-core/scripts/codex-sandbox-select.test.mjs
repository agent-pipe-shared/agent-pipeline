#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJson, loadCompatibilityPolicy } from "../lib/codex-sandbox-compatibility.mjs";
import { buildSandboxRequest, createRepositorySandboxSelectionStore, createSandboxSelectionStore, sandboxSelectionDigest, SELECTION_SCHEMA_SHA256, selectCodexSandbox, validateSandboxSelection } from "./codex-sandbox-select.mjs";

const D = "a".repeat(64);
const C = "c".repeat(40);
const T = "d".repeat(40);
const NOW = 1_784_563_200_000;
const sha = (value) => createHash("sha256").update(value).digest("hex");
function request(overrides = {}) {
  return { repoFingerprint: D, duty: "advisory", queueRevision: 4, candidateCommit: C, candidateTree: T, referenceSetSha256: "b".repeat(64), runner: "codex", model: "gpt-5.6-sol", ...overrides };
}
function observed() {
  const { value: policy } = loadCompatibilityPolicy();
  const entry = policy.entries.find((candidate) => candidate.filesystemClass === "wsl-native");
  const receipt = {
    schema: "pipeline.codex-sandbox-preflight.v1", cli: { version: entry.cliVersion, artifactSha256: entry.releasedArtifactSha256 },
    sandboxTransport: { selection: "codex-cli-owned" }, observedHelper: { role: "diagnostic-only", artifactSha256: "1".repeat(64) }, platform: { os: "linux", kernelClass: entry.kernelClass, filesystemClass: entry.filesystemClass },
    profile: { id: entry.permissionProfileId, rawSha256: entry.permissionProfileSha256, compiledStateSha256: "2".repeat(64) }, networkEnabled: true,
    vectors: { allowedRead: true, externalReadDenied: true, sensitiveReadDenied: true, writeDenied: true, scratchWriteAllowed: true, networkDenied: false, childStdioEquivalent: true, stdinEofEquivalent: true, childExitEquivalent: true, appServerInitEquivalent: true, lifecycleComplete: true },
    canaries: { count: 1, manifestSha256: "3".repeat(64), unchanged: true }, eventChainSha256: "4".repeat(64), durationMs: 1, eligibility: "intermediate", terminalCode: "ok",
  };
  return {
    cliVersion: entry.cliVersion, cliSha256: entry.releasedArtifactSha256, observedHelperSha256: "1".repeat(64), selectionSchemaSha256: SELECTION_SCHEMA_SHA256,
    platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6", machine: "x86_64" }, filesystemClass: "wsl2-native", bootIdSha256: sha("boot"),
    compatibilityObservation: {
      runnerId: "codex", cliVersion: entry.cliVersion, releasedArtifactSha256: entry.releasedArtifactSha256, kernelClass: entry.kernelClass, filesystemClass: entry.filesystemClass,
      permissionProfileId: entry.permissionProfileId, permissionProfileSha256: entry.permissionProfileSha256, bootId: "boot", nowMs: NOW,
      preflight: { bootId: "boot", observedAtMs: NOW, rawSha256: sha(Buffer.from(canonicalJson(receipt))), schemaSha256: entry.preflightSchemaSha256, receipt }, runner: null, shadow: null, activation: null, routePostimageSha256: null,
    },
  };
}
async function store() {
  // The store root itself must not pre-exist: createSandboxSelectionStore()
  // hardens a freshly created private directory (Windows DACL + owner) but
  // only *assesses* one that already existed, and a directory produced
  // directly by mkdtemp() inherits the OS temp folder's ACL (multiple
  // principals), which native-Windows assurance correctly rejects as
  // insecure. Route through a throwaway container so the actual store root
  // is minted fresh by production code. POSIX behavior is unaffected: the
  // subdirectory is created the same way privateDirectory() always creates
  // missing directories.
  const container = await mkdtemp(join(tmpdir(), "hawkeye-sandbox-store-"));
  const root = join(container, "store");
  return { root, container, store: createSandboxSelectionStore({ root, now: () => new Date(NOW).toISOString() }) };
}

test("request digest has the sandbox-request domain and excludes user prose", () => {
  const result = buildSandboxRequest(request());
  assert.match(result.requestSha256, /^[a-f0-9]{64}$/u);
  assert.throws(() => buildSandboxRequest({ ...request(), userProse: "network enabled please" }));
});

test("repository selection storage is derived only from the exact Git common directory and repository fingerprint", async () => {
  const root = await mkdtemp(join(tmpdir(), "hawkeye-common-dir-"));
  try {
    const derived = createRepositorySandboxSelectionStore({ repoFingerprint: D, topology: { gitCommonDir: root } });
    assert.equal(typeof derived.writeSelection, "function");
    assert.throws(() => createRepositorySandboxSelectionStore({ repoFingerprint: "not-a-digest", topology: { gitCommonDir: root } }));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("private sandbox storage rejects a symlinked root or exact-ID record", async (t) => {
  const container = await mkdtemp(join(tmpdir(), "hawkeye-private-store-"));
  // The actual store root must not pre-exist (see store() above for why);
  // use a throwaway existing directory only as the symlink target/alias.
  const root = join(container, "store");
  const alias = `${container}-alias`;
  let symlinkSupported = true;
  try {
    try {
      await symlink(container, alias);
    } catch (error) {
      if (error?.code !== "EPERM") throw error;
      symlinkSupported = false; // native Windows without Developer Mode/admin: no unprivileged symlinks
      t.diagnostic("symlink capability unavailable (EPERM); skipping symlink-specific assertions only");
    }
    if (symlinkSupported) {
      assert.throws(() => createSandboxSelectionStore({ root: alias }), /physical directory/);
      await unlink(alias);
    }
    const state = createSandboxSelectionStore({ root, now: () => new Date(NOW).toISOString() });
    const result = await selectCodexSandbox(request(), {
      now: () => NOW, observeHost: async () => observed(), runPreflight: async () => ({ eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) }),
      createCoordinatorScratch: async () => ({ sha256: "7".repeat(64) }), readbackProfile: async ({ profile }) => profile,
      persist: (selection, compatibility) => state.writeSelection(selection, compatibility),
    });
    if (symlinkSupported) {
      const selectedPath = join(root, "selections", `${result.selectionId}.json`);
      const redirect = join(root, "redirect.json");
      await writeFile(redirect, "{}\n", { mode: 0o600 });
      await chmod(redirect, 0o600);
      await unlink(selectedPath);
      await symlink(redirect, selectedPath);
      assert.throws(() => state.readSelection(result.selectionId), /single-link regular file/);
    }
  } finally { await rm(alias, { force: true }); await rm(container, { recursive: true, force: true }); }
});

test("only the committed current compatibility projection can persist a selected network-open transport", async () => {
  const state = await store();
  const scratchRoot = await mkdtemp(join(tmpdir(), "hawkeye-persisted-scratch-"));
  try {
    const entry = loadCompatibilityPolicy().value.entries.find((candidate) => candidate.filesystemClass === "wsl-native");
    const scratch = {
      sha256: "7".repeat(64), path: scratchRoot, resourceId: "codex-scratch-test",
      sessionId: "scratch-session", descriptorSha256: "9".repeat(64),
      sandboxStateSha256: "8".repeat(64), profileRawSha256: entry.permissionProfileSha256,
    };
    const result = await selectCodexSandbox(request(), {
      now: () => NOW, observeHost: async () => observed(), runPreflight: async () => ({ eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) }),
      createCoordinatorScratch: async () => scratch, readbackProfile: async ({ profile }) => profile,
      persist: (selection, compatibility, persistedScratch) => state.store.writeSelection(selection, compatibility, persistedScratch),
    });
    assert.equal(result.status, "selected");
    assert.equal(state.store.readSelection(result.selectionId).selectionId, result.selectionId);
    assert.deepEqual(state.store.readScratch(result.selectionId), {
      schema: "pipeline.codex-sandbox-scratch-binding.v1", selectionId: result.selectionId,
      scratchRootSha256: scratch.sha256, path: scratch.path, resourceId: scratch.resourceId,
      sessionId: scratch.sessionId, descriptorSha256: scratch.descriptorSha256,
      sandboxStateSha256: scratch.sandboxStateSha256, profileRawSha256: scratch.profileRawSha256,
    });
    assert.match(sandboxSelectionDigest(result), /^[a-f0-9]{64}$/u);
  } finally { await rm(scratchRoot, { recursive: true, force: true }); await rm(state.container, { recursive: true, force: true }); }
});

test("an exact sandbox request replays the first persisted selection instead of minting another ID", async () => {
  const state = await store();
  let clock = NOW;
  const dependencies = {
    now: () => clock, observeHost: async () => observed(),
    runPreflight: async () => ({ eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) }),
    createCoordinatorScratch: async () => ({ sha256: "7".repeat(64) }), readbackProfile: async ({ profile }) => profile,
    persist: (selection, compatibility) => state.store.writeSelection(selection, compatibility),
  };
  try {
    const first = await selectCodexSandbox(request(), dependencies);
    clock += 1_000;
    const replay = await selectCodexSandbox(request(), dependencies);
    assert.equal(first.status, "selected");
    assert.equal(replay.selectionId, first.selectionId);
    assert.equal(sandboxSelectionDigest(replay), sandboxSelectionDigest(first));
    assert.equal(state.store.readRequest(buildSandboxRequest(request()).requestSha256).selectionId, first.selectionId);
  } finally { await rm(state.container, { recursive: true, force: true }); }
});

test("a dead cross-process request lock is reclaimed before an exact request is admitted", async () => {
  const state = await store();
  try {
    const requestDigest = buildSandboxRequest(request()).requestSha256;
    await writeFile(join(state.root, "request-locks", `${requestDigest}.lock`), "{\"pid\":2147483647}\n", { mode: 0o600 });
    const result = await selectCodexSandbox(request(), {
      now: () => NOW, observeHost: async () => observed(),
      runPreflight: async () => ({ eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) }),
      createCoordinatorScratch: async () => ({ sha256: "7".repeat(64) }), readbackProfile: async ({ profile }) => profile,
      persist: (selection, compatibility) => state.store.writeSelection(selection, compatibility),
    });
    assert.equal(result.status, "selected");
  } finally { await rm(state.container, { recursive: true, force: true }); }
});

test("an index published before its selection is inert until write recovery owns it", async () => {
  const state = await store();
  try {
    const requestSha256 = buildSandboxRequest(request()).requestSha256;
    await writeFile(join(state.root, "requests", `${requestSha256}.json`), JSON.stringify({
      schema: "pipeline.codex-sandbox-request-index.v1", repoFingerprint: D, requestSha256,
      selectionId: "css_aaaaaaaaaaaaaaaaaaaaaaaaae", selectionSha256: "f".repeat(64),
    }), { mode: 0o600 });
    assert.equal(state.store.readRequest(requestSha256), null);
  } finally { await rm(state.container, { recursive: true, force: true }); }
});

test("missing current projection persists only a typed unavailable no-child selection", async () => {
  const state = await store();
  try {
    const result = await selectCodexSandbox(request(), { now: () => NOW, observeHost: async () => ({}), persist: (selection, compatibility) => state.store.writeSelection(selection, compatibility) });
    assert.equal(result.status, "unavailable");
    assert.equal(result.failureClass, "policy-drift");
    assert.equal(validateSandboxSelection(result), result);
  } finally { await rm(state.container, { recursive: true, force: true }); }
});

test("post-compatibility failures retain the factual preflight and scratch evidence", async () => {
  const state = await store();
  try {
    const result = await selectCodexSandbox(request(), {
      now: () => NOW,
      observeHost: async () => observed(),
      runPreflight: async () => ({ eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) }),
      createCoordinatorScratch: async () => ({ sha256: "7".repeat(64) }),
      readbackProfile: async () => { throw new Error("readback transport failed"); },
      persist: (selection, compatibility) => state.store.writeSelection(selection, compatibility),
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.failureClass, "host-mode-unavailable");
    assert.match(result.compatibilityReceiptSha256, /^[a-f0-9]{64}$/u);
    assert.equal(result.preflight.receiptSha256, "6".repeat(64));
    assert.equal(result.profile.scratchRootSha256, "7".repeat(64));
  } finally { await rm(state.container, { recursive: true, force: true }); }
});

test("host observation and preflight exceptions persist typed no-child selections", async () => {
  const state = await store();
  try {
    const observationFailure = await selectCodexSandbox(request(), {
      now: () => NOW,
      observeHost: async () => { throw new Error("host observation failed"); },
      persist: (selection, compatibility) => state.store.writeSelection(selection, compatibility),
    });
    assert.equal(observationFailure.status, "unavailable");
    assert.equal(observationFailure.failureClass, "host-unsupported");
    assert.equal(observationFailure.compatibilityReceiptSha256, null);
    assert.deepEqual(observationFailure.toolchain, { cliVersion: null, cliSha256: null, observedHelperSha256: null, selectionSchemaSha256: null });
    assert.deepEqual(observationFailure.host, { platformClass: null, kernel: { sysname: null, release: null, machine: null }, filesystemClass: null, bootIdSha256: null });
    assert.equal(observationFailure.profile.sha256, null);

    const preflightFailure = await selectCodexSandbox(request({ queueRevision: 5 }), {
      now: () => NOW,
      observeHost: async () => observed(),
      runPreflight: async () => { throw new Error("preflight failed"); },
      persist: (selection, compatibility) => state.store.writeSelection(selection, compatibility),
    });
    assert.equal(preflightFailure.status, "unavailable");
    assert.equal(preflightFailure.failureClass, "preflight-failed");
    assert.match(preflightFailure.compatibilityReceiptSha256, /^[a-f0-9]{64}$/u);
    assert.equal(preflightFailure.preflight.terminalCode, "host-error");
    assert.match(preflightFailure.preflight.receiptSha256, /^[a-f0-9]{64}$/u);
  } finally { await rm(state.container, { recursive: true, force: true }); }
});

test("an unavailable exact request conflicts rather than erasing its immutable receipt identity", async () => {
  const state = await store();
  try {
    const unavailable = await selectCodexSandbox(request(), {
      now: () => NOW, observeHost: async () => ({}),
      persist: (selection, compatibility) => state.store.writeSelection(selection, compatibility),
    });
    assert.equal(unavailable.status, "unavailable");
    await assert.rejects(() => selectCodexSandbox(request(), {
      now: () => NOW, observeHost: async () => observed(),
      runPreflight: async () => ({ eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) }),
      createCoordinatorScratch: async () => ({ sha256: "7".repeat(64) }), readbackProfile: async ({ profile }) => profile,
      persist: (selection, compatibility) => state.store.writeSelection(selection, compatibility),
    }), /sandbox request replay conflicts/);
    assert.equal(state.store.readSelection(unavailable.selectionId).selectionId, unavailable.selectionId);
  } finally { await rm(state.container, { recursive: true, force: true }); }
});

test("a selected exact request conflicts on host drift instead of minting a replacement selection", async () => {
  const state = await store();
  const selectedDependencies = {
    now: () => NOW, observeHost: async () => observed(),
    runPreflight: async () => ({ eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) }),
    createCoordinatorScratch: async () => ({ sha256: "7".repeat(64) }), readbackProfile: async ({ profile }) => profile,
    persist: (selection, compatibility) => state.store.writeSelection(selection, compatibility),
  };
  try {
    const selected = await selectCodexSandbox(request(), selectedDependencies);
    const drifted = observed();
    drifted.bootIdSha256 = "f".repeat(64);
    await assert.rejects(() => selectCodexSandbox(request(), {
      now: () => NOW, observeHost: async () => drifted,
      persist: (selection, compatibility) => state.store.writeSelection(selection, compatibility),
    }), /sandbox request replay conflicts/);
    assert.equal(selected.status, "selected");
    assert.equal(state.store.readSelection(selected.selectionId).selectionId, selected.selectionId);
  } finally { await rm(state.container, { recursive: true, force: true }); }
});

test("a dead execution lock in selected phase blocks a replay before another child can launch", async () => {
  const state = await store();
  try {
    const result = await selectCodexSandbox(request(), {
      now: () => NOW, observeHost: async () => observed(),
      runPreflight: async () => ({ eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) }),
      createCoordinatorScratch: async () => ({ sha256: "7".repeat(64) }), readbackProfile: async ({ profile }) => profile,
      persist: (selection, compatibility) => state.store.writeSelection(selection, compatibility),
    });
    await writeFile(join(state.root, "execution-locks", `${result.selectionId}.lock`), "{\"pid\":2147483647}\n", { mode: 0o600 });
    let launched = false;
    await assert.rejects(state.store.runSerialized(result.selectionId, async () => { launched = true; }), /prior sandbox launch outcome is indeterminate/);
    assert.equal(launched, false);
  } finally { await rm(state.container, { recursive: true, force: true }); }
});
