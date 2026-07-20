// SPDX-License-Identifier: Apache-2.0

/**
 * Local, model-free runtime adapter for the documented affected Codex tuple.
 *
 * The host supplies only physical executable/repository coordinates. This
 * adapter, not a chat payload, runs the intermediate preflight and derives the
 * current compatibility observation before the generic selector is allowed to
 * request a child. It intentionally contains no model launch capability.
 */
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { arch, release, type } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { canonicalJson, loadCompatibilityPolicy } from "../lib/codex-sandbox-compatibility.mjs";
import { finalizeTemporaryResource, inspectSessionClosure, inspectTemporaryResource, loadSessionDescriptor, registerTemporaryIntent, sealTemporaryResource } from "../lib/worktree-lifecycle.mjs";
import { compilePermissionProfile, resolveNodeRuntimeReadSet, runCodexSandboxPreflight, validateCodexSandboxState } from "./codex-sandbox-preflight.mjs";
import { buildSandboxRequest, createRepositorySandboxSelectionStore, SELECTION_SCHEMA_SHA256 } from "./codex-sandbox-select.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const RUNTIME_SCHEMA = "pipeline.codex-sandbox-runtime.v1";
const CODEX_ADVISORY_CHILD_PATH = realpathSync(fileURLToPath(new URL("./codex-advisory-app-server-child.mjs", import.meta.url)));

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} is not closed`);
}
function physicalDirectory(path, label) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || !lstatSync(path).isDirectory() || realpathSync(path) !== path) fail(`${label} must be a physical absolute directory`);
  return path;
}
function privateScratchDirectory(path, label) {
  physicalDirectory(path, label);
  const stat = lstatSync(path);
  if ((stat.mode & 0o777) !== 0o700 || (typeof process.getuid === "function" && stat.uid !== process.getuid())) {
    fail(`${label} must be a mode-0700 directory owned by the current user`);
  }
  return path;
}
function physicalFile(path, label) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || !lstatSync(path).isFile() || realpathSync(path) !== path) fail(`${label} must be a physical absolute file`);
  return path;
}
function bootId() {
  const path = "/proc/sys/kernel/random/boot_id";
  if (!existsSync(path)) fail("Codex sandbox boot identifier is unavailable");
  const value = readFileSync(path, "utf8").trim();
  if (!/^[A-Za-z0-9-]{8,128}$/.test(value)) fail("Codex sandbox boot identifier is invalid");
  return value;
}
function platformClass(filesystemClass) {
  if (filesystemClass === "native-linux") return { platformClass: "linux-native", filesystemClass: "linux-native" };
  if (filesystemClass === "wsl-native") return { platformClass: "linux-wsl2", filesystemClass: "wsl2-native" };
  if (filesystemClass === "drvfs") return { platformClass: "linux-wsl2", filesystemClass: "wsl2-9p" };
  fail("Codex sandbox platform class is unsupported");
}
function validateRuntime(value) {
  exactKeys(value, ["schema", "repoRoot", "codexPath", "sandboxHelperPath", "sessionCleanup"], "Codex sandbox runtime");
  if (value.schema !== RUNTIME_SCHEMA) fail("Codex sandbox runtime schema is invalid");
  exactKeys(value.sessionCleanup, ["sessionId", "descriptorSha256"], "Codex sandbox session cleanup");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value.sessionCleanup.sessionId) || !SHA256.test(value.sessionCleanup.descriptorSha256)) {
    fail("Codex sandbox session cleanup is invalid");
  }
  return {
    repoRoot: physicalDirectory(value.repoRoot, "repository root"),
    codexPath: physicalFile(value.codexPath, "Codex executable"),
    sandboxHelperPath: physicalFile(value.sandboxHelperPath, "Codex sandbox helper"),
    sessionCleanup: structuredClone(value.sessionCleanup),
  };
}
function validateHostBridge(value) {
  if (value === null || value === undefined) return null;
  exactKeys(value, ["launch", "finalize"], "Codex selected host bridge");
  if (typeof value.launch !== "function" || typeof value.finalize !== "function") fail("Codex selected host bridge is invalid");
  return value;
}
function compiledIntermediateReadback(runtime, scratch, selectedProfile = null) {
  if (!scratch || typeof scratch.path !== "string" || !SHA256.test(scratch.sha256 ?? "")) fail("Codex sandbox scratch is unavailable");
  const compiled = compilePermissionProfile("intermediate", {
    inputRoot: runtime.repoRoot,
    outputRoot: scratch.path,
    runtimeReadSet: [...new Set([...resolveNodeRuntimeReadSet(process.execPath), runtime.codexPath, runtime.sandboxHelperPath, CODEX_ADVISORY_CHILD_PATH])].sort(),
    // The intermediate compiled form does not include deny entries, but its
    // shared compiler requires two real, non-overlapping control roots.
    deniedRoots: ["/proc"],
    sensitiveRoots: ["/sys"],
    sandboxCwd: runtime.repoRoot,
    sandboxHelperPath: runtime.sandboxHelperPath,
  });
  const stateJson = compiled.raw.toString("utf8");
  let state;
  try { state = JSON.parse(stateJson); } catch { fail("Codex compiled sandbox state is not JSON"); }
  validateCodexSandboxState(state);
  const entries = state.permissionProfile.file_system.entries;
  const exactIntermediate = entries.length === 2
    && entries[0]?.access === "read" && entries[0]?.path?.type === "special" && entries[0]?.path?.value?.kind === "root"
    && entries[1]?.access === "write" && entries[1]?.path?.type === "path" && entries[1]?.path?.path === scratch.path
    && state.permissionProfile.network === "enabled"
    && state.codexLinuxSandboxExe === runtime.sandboxHelperPath
    && state.sandboxCwd === pathToFileURL(runtime.repoRoot).href
    && compiled.compiledStateSha256 === sha256(Buffer.from(stateJson));
  if (!exactIntermediate) fail("Codex compiled sandbox state does not match the documented intermediate profile");
  if (selectedProfile !== null && (selectedProfile.sha256 !== compiled.profileRawSha256 || selectedProfile.scratchRootSha256 !== scratch.sha256)) {
    fail("selected profile does not bind the compiled sandbox state");
  }
  return {
    profile: {
      id: "codex-critic-intermediate.v1",
      sha256: compiled.profileRawSha256,
      base: ":read-only",
      network: { enabled: true },
      writableRootClass: "coordinator-scratch-only",
      scratchRootSha256: scratch.sha256,
    },
    compiledStateSha256: compiled.compiledStateSha256,
    stateJson,
    profileRawSha256: compiled.profileRawSha256,
  };
}

/**
 * Creates the standard production dependencies used by the advisory CLI. The
 * caller must obtain runtime coordinates from the host integration; missing or
 * nonphysical coordinates leave the duty typed-unavailable before a model call.
 */
export function createCodexSandboxRuntimeTransport({ sandboxContext, sandboxRuntime, hostBridge = null } = {}) {
  exactKeys(sandboxContext, ["repoFingerprint", "referenceSetSha256"], "Codex sandbox context");
  if (!SHA256.test(sandboxContext.repoFingerprint) || !SHA256.test(sandboxContext.referenceSetSha256)) fail("Codex sandbox context is invalid");
  const runtime = validateRuntime(sandboxRuntime);
  const selectedHostBridge = validateHostBridge(hostBridge);
  const store = createRepositorySandboxSelectionStore({
    repoRoot: runtime.repoRoot,
    repoFingerprint: sandboxContext.repoFingerprint,
    receiptSession: runtime.sessionCleanup,
    sessionClosure: ({ sessionId, descriptorSha256 }) => inspectSessionClosure(runtime.repoRoot, sessionId, { expectedDescriptorSha256: descriptorSha256 }),
  });
  let preflightPromise = null;
  let preflightObservedAtMs = 0;
  const pendingScratchByRequest = new Map();
  const loadPersistedScratch = (selectionId, profile) => {
    const persisted = store.readScratch(selectionId);
    if (persisted.scratchRootSha256 !== profile.scratchRootSha256 || persisted.profileRawSha256 !== profile.sha256) {
      fail("persisted coordinator scratch does not bind the selected profile");
    }
    if (persisted.sessionId !== runtime.sessionCleanup.sessionId || persisted.descriptorSha256 !== runtime.sessionCleanup.descriptorSha256) {
      fail("persisted coordinator scratch belongs to another cleanup session");
    }
    privateScratchDirectory(persisted.path, "persisted coordinator scratch");
    return {
      path: persisted.path,
      sha256: persisted.scratchRootSha256,
      resourceId: persisted.resourceId,
      sessionId: persisted.sessionId,
      descriptorSha256: persisted.descriptorSha256,
      sandboxStateSha256: persisted.sandboxStateSha256,
      profileRawSha256: persisted.profileRawSha256,
    };
  };
  const loadSelectedScratch = (selectionId, profile) => {
    const scratch = loadPersistedScratch(selectionId, profile);
    const session = loadSessionDescriptor(runtime.repoRoot, runtime.sessionCleanup.sessionId, { expectedDescriptorSha256: runtime.sessionCleanup.descriptorSha256 });
    const resource = inspectTemporaryResource(runtime.repoRoot, { sessionId: session.sessionId, ownerNonce: session.ownerNonce, resourceId: scratch.resourceId }).resource;
    if (resource.type !== "scratch-directory" || scratch.path !== join(resource.physicalPath, "output")) {
      fail("persisted coordinator scratch does not bind the registered lifecycle resource");
    }
    const compiled = compiledIntermediateReadback(runtime, scratch, profile);
    if (compiled.compiledStateSha256 !== scratch.sandboxStateSha256 || compiled.profileRawSha256 !== scratch.profileRawSha256) {
      fail("persisted coordinator scratch state drifted");
    }
    return { ...scratch, sandboxStateJson: compiled.stateJson, repoRoot: runtime.repoRoot, codexPath: runtime.codexPath };
  };
  const resealCoordinatorScratch = (selectionId, profile) => {
    // A selected child may change only this dedicated output tree.  Resealing
    // must therefore validate the persisted binding without first requiring
    // the previous tree fingerprint to still match.
    const scratch = loadPersistedScratch(selectionId, profile);
    const session = loadSessionDescriptor(runtime.repoRoot, runtime.sessionCleanup.sessionId, { expectedDescriptorSha256: runtime.sessionCleanup.descriptorSha256 });
    sealTemporaryResource(runtime.repoRoot, { sessionId: session.sessionId, ownerNonce: session.ownerNonce, resourceId: scratch.resourceId }, { refreshScratch: true });
  };
  const runPreflight = async () => {
    const maxEvidenceAgeMs = loadCompatibilityPolicy().value.maxEvidenceAgeMs;
    if (preflightPromise === null || (preflightObservedAtMs !== 0 && Date.now() - preflightObservedAtMs > maxEvidenceAgeMs)) {
      const root = realpathSync(mkdtempSync(join(tmpdir(), "agent-pipeline-codex-preflight-")));
      chmodSync(root, 0o700);
      const receiptPath = join(root, "receipt.json");
      const startedAtMs = Date.now();
      const pending = runCodexSandboxPreflight({ kind: "intermediate", codexPath: runtime.codexPath, sandboxHelperPath: runtime.sandboxHelperPath, receiptPath })
        .finally(() => { rmSync(root, { recursive: true, force: true }); });
      let wrapped;
      wrapped = pending.then((receipt) => {
        preflightObservedAtMs = startedAtMs;
        return receipt;
      }, (error) => {
        if (preflightPromise === wrapped) {
          preflightPromise = null;
          preflightObservedAtMs = 0;
        }
        throw error;
      });
      preflightPromise = wrapped;
    }
    return preflightPromise;
  };
  const bridge = {
    readback({ selectionId, profile }) {
      const readback = compiledIntermediateReadback(runtime, loadSelectedScratch(selectionId, profile), profile);
      return structuredClone(readback.profile);
    },
    resolveScratch({ selectionId, profile }) {
      return structuredClone(loadSelectedScratch(selectionId, profile));
    },
    resealScratch({ selectionId, profile }) {
      resealCoordinatorScratch(selectionId, profile);
    },
  };
  if (selectedHostBridge !== null) {
    bridge.launch = async (request) => selectedHostBridge.launch(structuredClone(request));
    bridge.finalize = async (request) => selectedHostBridge.finalize(structuredClone(request));
  }
  return {
    store,
    selection: {
      async observeHost() {
        const receipt = await runPreflight();
        const currentBootId = bootId();
        const observedAtMs = Date.now();
        const platform = platformClass(receipt.platform.filesystemClass);
        return {
          cliVersion: receipt.cli.version,
          cliSha256: receipt.cli.artifactSha256,
          sandboxHelperSha256: receipt.sandboxHelper.artifactSha256,
          selectionSchemaSha256: SELECTION_SCHEMA_SHA256,
          platformClass: platform.platformClass,
          kernel: { sysname: type(), release: release(), machine: arch() },
          filesystemClass: platform.filesystemClass,
          bootIdSha256: sha256(currentBootId),
          compatibilityObservation: {
            runnerId: "codex", cliVersion: receipt.cli.version, releasedArtifactSha256: receipt.cli.artifactSha256,
            kernelClass: receipt.platform.kernelClass, filesystemClass: receipt.platform.filesystemClass,
            permissionProfileId: receipt.profile.id, permissionProfileSha256: receipt.profile.rawSha256,
            bootId: currentBootId, nowMs: observedAtMs,
            preflight: {
              bootId: currentBootId, observedAtMs, rawSha256: sha256(Buffer.from(canonicalJson(receipt))),
              schemaSha256: sha256(readFileSync(new URL("./codex-sandbox-preflight.schema.json", import.meta.url))), receipt,
            },
            runner: null, shadow: null, activation: null, routePostimageSha256: null,
          },
        };
      },
      async runPreflight() {
        const receipt = await runPreflight();
        return { eligibility: receipt.eligibility, terminalCode: receipt.terminalCode, receiptSha256: sha256(Buffer.from(canonicalJson(receipt))) };
      },
      createCoordinatorScratch(input) {
        const requestSha256 = buildSandboxRequest(input).requestSha256;
        const existing = pendingScratchByRequest.get(requestSha256);
        if (existing) return structuredClone(existing);
        const persistedSelection = store.readRequest(requestSha256);
        if (persistedSelection !== null) {
          const persisted = store.readScratch(persistedSelection.selectionId);
          const recovered = {
            path: persisted.path,
            sha256: persisted.scratchRootSha256,
            resourceId: persisted.resourceId,
            sessionId: persisted.sessionId,
            descriptorSha256: persisted.descriptorSha256,
            sandboxStateSha256: persisted.sandboxStateSha256,
            profileRawSha256: persisted.profileRawSha256,
          };
          pendingScratchByRequest.set(requestSha256, recovered);
          return structuredClone(recovered);
        }
        const session = loadSessionDescriptor(runtime.repoRoot, runtime.sessionCleanup.sessionId, { expectedDescriptorSha256: runtime.sessionCleanup.descriptorSha256 });
        const resourceId = `codex-sandbox-${randomBytes(12).toString("hex")}`;
        const resourcePath = join(realpathSync(tmpdir()), `agent-pipeline-codex-scratch-${randomBytes(16).toString("hex")}`);
        if (existsSync(resourcePath)) fail("coordinator scratch path unexpectedly exists");
        registerTemporaryIntent(runtime.repoRoot, {
          sessionId: session.sessionId, ownerNonce: session.ownerNonce, resourceId, type: "scratch-directory", path: resourcePath,
          contentClass: "scratch", soleCopy: false, cleanupPolicy: "remove-directory",
        });
        mkdirSync(resourcePath, { mode: 0o700 });
        chmodSync(resourcePath, 0o700);
        const path = join(resourcePath, "output");
        mkdirSync(path, { mode: 0o700 });
        chmodSync(path, 0o700);
        writeFileSync(join(resourcePath, ".agent-pipeline-scratch-canary"), "agent-pipeline-codex-scratch\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
        finalizeTemporaryResource(runtime.repoRoot, { sessionId: session.sessionId, ownerNonce: session.ownerNonce, resourceId, canaryRelative: ".agent-pipeline-scratch-canary" });
        sealTemporaryResource(runtime.repoRoot, { sessionId: session.sessionId, ownerNonce: session.ownerNonce, resourceId });
        const compiled = compiledIntermediateReadback(runtime, { path, sha256: sha256(path) });
        const scratch = {
          path,
          sha256: sha256(path),
          resourceId,
          sessionId: session.sessionId,
          descriptorSha256: runtime.sessionCleanup.descriptorSha256,
          sandboxStateJson: compiled.stateJson,
          sandboxStateSha256: compiled.compiledStateSha256,
          profileRawSha256: compiled.profileRawSha256,
        };
        pendingScratchByRequest.set(requestSha256, scratch);
        return structuredClone(scratch);
      },
      readbackProfile({ profile }) {
        const scratch = [...pendingScratchByRequest.values()].find((candidate) => candidate.sha256 === profile?.scratchRootSha256);
        if (!scratch) fail("coordinator scratch is unavailable for profile readback");
        const readback = compiledIntermediateReadback(runtime, scratch, profile);
        return structuredClone(readback.profile);
      },
    },
    bridge,
  };
}
