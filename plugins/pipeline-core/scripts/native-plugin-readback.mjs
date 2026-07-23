#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const SCHEMA = "pipeline.btm-d2-native-readback.v1";
export const PHASES = [
  "prepared", "update-observed", "reload-observed", "trust-observed",
  "fresh-session-observed", "verified", "blocked",
];
const NEXT = new Map(PHASES.slice(0, -2).map((phase, index) => [phase, PHASES[index + 1]]));
const REASONS = new Set([
  "native-source-missing", "marketplace-source-mismatch", "update-failed",
  "reload-not-observed", "hook-trust-missing", "new-session-missing",
  "loaded-root-unresolved", "manifest-mismatch", "guard-digest-mismatch",
  "hook-chain-mismatch",
]);
const STATE_KEYS = [
  "schema", "transactionId", "revision", "priorStateSha256", "phase", "provider",
  "pluginId", "sourceOid", "loadedRootKind", "manifest", "loadedChain",
  "observations", "reason", "observedManifest", "observedChain", "receiptDigest",
];

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const digest = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");

function assertHex(value, label) {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value ?? "")) throw new Error(`${label} invalid`);
}
function assertKeys(value, keys, label) {
  const actual = Object.keys(value ?? {}).sort();
  const expected = [...keys].sort();
  if (actual.join("\0") !== expected.join("\0")) throw new Error(`${label} keys invalid`);
}

export function prepareNativeReadback(input) {
  assertKeys(input, ["transactionId", "provider", "pluginId", "sourceOid", "loadedRootKind", "manifest", "loadedChain"], "prepare");
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(input.transactionId)) throw new Error("transactionId invalid");
  if (!new Set(["claude", "codex"]).has(input.provider) || input.pluginId !== "pipeline-core") throw new Error("provider/plugin invalid");
  if (input.loadedRootKind !== (input.provider === "claude" ? "claude-project-scope" : "codex-provider-cache")) throw new Error("loadedRootKind invalid");
  assertHex(input.sourceOid, "sourceOid");
  assertKeys(input.manifest, ["relativePath", "name", "version", "digest"], "manifest");
  if (input.manifest.name !== "pipeline-core" || input.manifest.relativePath !== (input.provider === "claude" ? ".claude-plugin/plugin.json" : ".codex-plugin/plugin.json") || typeof input.manifest.version !== "string" || input.manifest.version === "") throw new Error("manifest invalid");
  assertHex(input.manifest.digest, "manifest.digest");
  if (!Array.isArray(input.loadedChain) || input.loadedChain.length === 0) throw new Error("loadedChain invalid");
  const seen = new Set();
  for (const entry of input.loadedChain) {
    assertKeys(entry, ["relativePath", "expectedDigest"], "loadedChain entry");
    if (entry.relativePath.startsWith("/") || entry.relativePath.includes("..") || seen.has(entry.relativePath)) throw new Error("loadedChain path invalid");
    seen.add(entry.relativePath); assertHex(entry.expectedDigest, "loadedChain digest");
  }
  const state = {
    schema: SCHEMA, transactionId: input.transactionId, revision: 0,
    priorStateSha256: null, phase: "prepared", provider: input.provider,
    pluginId: input.pluginId, sourceOid: input.sourceOid,
    loadedRootKind: input.loadedRootKind, manifest: { ...input.manifest },
    loadedChain: input.loadedChain.map((entry) => ({ ...entry })), observations: [],
    reason: null, observedManifest: null, observedChain: null, receiptDigest: null,
  };
  validateNativeReadback(state);
  return state;
}

export function recordNativeReadbackStep(state, { expectedRevision, expectedStateSha256, phase, observation }) {
  validateNativeReadback(state);
  if (state.phase === "verified" || state.phase === "blocked") throw new Error("terminal state");
  if (expectedRevision !== state.revision || expectedStateSha256 !== digest(state)) throw new Error("stale native-readback CAS");
  assertKeys(observation, ["phase", "status", "evidenceDigest", "observedAt"], "observation");
  if (observation.phase !== phase || observation.status !== "observed" || !/^[0-9a-f]{64}$/.test(observation.evidenceDigest) || !Number.isSafeInteger(observation.observedAt)) throw new Error("observation invalid");
  if (phase === state.phase) {
    const prior = state.observations.at(-1);
    if (canonical(prior) === canonical(observation)) return state;
    throw new Error("conflicting native-readback replay");
  }
  const expected = NEXT.get(state.phase);
  if (phase !== expected) throw new Error(`phase out of order: expected ${expected}`);
  const post = { ...state, revision: state.revision + 1, priorStateSha256: expectedStateSha256, phase, observations: [...state.observations, { ...observation }] };
  validateNativeReadback(post);
  return post;
}

export function blockNativeReadback(state, { expectedRevision, expectedStateSha256, reason }) {
  validateNativeReadback(state);
  if (state.phase === "verified" || state.phase === "blocked") throw new Error("terminal state");
  if (!REASONS.has(reason)) throw new Error("closed reason invalid");
  if (expectedRevision !== state.revision || expectedStateSha256 !== digest(state)) throw new Error("stale native-readback CAS");
  const post = { ...state, revision: state.revision + 1, priorStateSha256: expectedStateSha256, phase: "blocked", reason };
  validateNativeReadback(post);
  return post;
}

export function observeLoadedChain(loadedRoot, expectedChain) {
  const rootStat = lstatSync(loadedRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("loaded-root-unresolved");
  const root = realpathSync(loadedRoot);
  return expectedChain.map(({ relativePath }) => {
    if (isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) throw new Error("hook-chain-mismatch");
    const candidate = resolve(root, relativePath);
    const rel = relative(root, candidate);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("hook-chain-mismatch");
    const stat = lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("hook-chain-mismatch");
    return { relativePath, digest: createHash("sha256").update(readFileSync(candidate)).digest("hex") };
  });
}

export function finalizeNativeReadback(state, loadedRoot) {
  validateNativeReadback(state);
  if (state.phase !== "fresh-session-observed") throw new Error("fresh session not observed");
  const observedManifest = observeLoadedChain(loadedRoot, [{ relativePath: state.manifest.relativePath }])[0];
  if (observedManifest.digest !== state.manifest.digest) throw new Error("manifest-mismatch");
  let manifest;
  try { manifest = JSON.parse(readFileSync(resolve(realpathSync(loadedRoot), state.manifest.relativePath), "utf8")); } catch { throw new Error("manifest-mismatch"); }
  if (manifest.name !== state.manifest.name || manifest.version !== state.manifest.version || (state.provider === "claude" && manifest.gitCommitSha !== state.sourceOid)) throw new Error("manifest-mismatch");
  const observedChain = observeLoadedChain(loadedRoot, state.loadedChain);
  if (!Array.isArray(observedChain) || observedChain.length !== state.loadedChain.length) throw new Error("hook-chain-mismatch");
  for (let i = 0; i < observedChain.length; i++) {
    const expected = state.loadedChain[i]; const observed = observedChain[i];
    if (observed.relativePath !== expected.relativePath || observed.digest !== expected.expectedDigest) throw new Error("hook-chain-mismatch");
  }
  const before = digest(state);
  const post = { ...state, revision: state.revision + 1, priorStateSha256: before, phase: "verified", observedManifest, observedChain };
  post.receiptDigest = digest(post);
  validateNativeReadback(post);
  return post;
}

export function validateNativeReadback(state) {
  assertKeys(state, STATE_KEYS, "native readback state");
  if (state.schema !== SCHEMA || !PHASES.includes(state.phase) || !Number.isInteger(state.revision) || state.revision < 0) throw new Error("native readback invalid");
  if (state.revision === 0 ? state.priorStateSha256 !== null : !/^[0-9a-f]{64}$/.test(state.priorStateSha256 ?? "")) throw new Error("native readback prior digest invalid");
  if (!new Set(["claude", "codex"]).has(state.provider) || state.pluginId !== "pipeline-core") throw new Error("native provider invalid");
  if (state.loadedRootKind !== (state.provider === "claude" ? "claude-project-scope" : "codex-provider-cache")) throw new Error("loadedRootKind invalid");
  assertHex(state.sourceOid, "sourceOid");
  assertKeys(state.manifest, ["relativePath", "name", "version", "digest"], "manifest");
  assertHex(state.manifest.digest, "manifest.digest");
  if (!Array.isArray(state.loadedChain) || !Array.isArray(state.observations)) throw new Error("native readback observations invalid");
  const seenPaths = new Set();
  for (const entry of state.loadedChain) {
    assertKeys(entry, ["relativePath", "expectedDigest"], "loadedChain entry");
    if (isAbsolute(entry.relativePath) || entry.relativePath.split(/[\\/]/).includes("..") || seenPaths.has(entry.relativePath)) throw new Error("loadedChain path invalid");
    seenPaths.add(entry.relativePath); assertHex(entry.expectedDigest, "loadedChain digest");
  }
  const expectedObservationCount = state.phase === "blocked" ? Math.min(Math.max(state.revision - 1, 0), 4) : Math.min(state.revision, 4);
  if (state.observations.length !== expectedObservationCount) throw new Error("native readback observations invalid");
  const expectedPhases = ["update-observed", "reload-observed", "trust-observed", "fresh-session-observed"];
  state.observations.forEach((observation, index) => {
    assertKeys(observation, ["phase", "status", "evidenceDigest", "observedAt"], "observation");
    if (observation.phase !== expectedPhases[index] || observation.status !== "observed" || !/^[0-9a-f]{64}$/.test(observation.evidenceDigest) || !Number.isSafeInteger(observation.observedAt)) throw new Error("native observation invalid");
  });
  if (state.phase !== "blocked" && state.phase !== PHASES[state.revision]) throw new Error("native phase/revision mismatch");
  if (state.phase === "blocked" ? !REASONS.has(state.reason) : state.reason !== null) throw new Error("native reason invalid");
  if (state.phase === "verified") {
    if (!state.observedManifest || !Array.isArray(state.observedChain) || state.receiptDigest !== digest({ ...state, receiptDigest: null })) throw new Error("native verified receipt invalid");
  } else if (state.observedManifest !== null || state.observedChain !== null || state.receiptDigest !== null) throw new Error("premature native receipt");
  return true;
}

function assertId(value, label) { if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(value)) throw new Error(`${label} invalid`); }
function jsonBytes(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function ensureDirectoryChain(root, components) {
  let current = root;
  for (const component of components) {
    current = join(current, component);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("native-readback directory unsafe");
  }
  return current;
}
function syncDirectory(path) { const fd = openSync(path, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); } }

export function nativeReadbackPaths(gitCommonDir, transactionId) {
  if (!isAbsolute(gitCommonDir)) throw new Error("gitCommonDir must be absolute");
  assertId(transactionId, "transactionId");
  const common = realpathSync(gitCommonDir);
  const directory = resolve(common, "agent-pipeline", "native-readback", transactionId);
  const rel = relative(common, directory);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("native-readback path escaped");
  return { common, transactionId, directory, receipt: join(directory, "receipt.json"), lock: join(directory, "writer.lock") };
}

function withNativeLock(paths, action) {
  ensureDirectoryChain(paths.common, ["agent-pipeline", "native-readback", paths.transactionId]);
  let fd, acquired = false, ownerBytes = null;
  try {
    fd = openSync(paths.lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    acquired = true;
    ownerBytes = `${JSON.stringify({ pid: process.pid, nonce: randomBytes(16).toString("hex") })}\n`;
    writeFileSync(fd, ownerBytes); fsyncSync(fd); closeSync(fd); fd = undefined;
    return action();
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (acquired && existsSync(paths.lock) && readFileSync(paths.lock, "utf8") === ownerBytes) unlinkSync(paths.lock);
  }
}

function readStoredNative(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) throw new Error("native-readback permissions invalid");
  const raw = readFileSync(path);
  let state;
  try { state = JSON.parse(raw); } catch { throw new Error("native-readback torn state"); }
  validateNativeReadback(state);
  return { state, raw, rawDigest: createHash("sha256").update(raw).digest("hex") };
}

export function storeNativeReadback({ gitCommonDir, state, expectedRawSha256 }) {
  validateNativeReadback(state);
  const paths = nativeReadbackPaths(gitCommonDir, state.transactionId);
  return withNativeLock(paths, () => {
    if (existsSync(paths.receipt)) {
      const current = readStoredNative(paths.receipt);
      if (current.rawDigest !== expectedRawSha256) throw new Error("stale native-readback raw CAS");
      const wanted = jsonBytes(state);
      if (current.raw.equals(Buffer.from(wanted))) return { path: paths.receipt, rawDigest: current.rawDigest, written: false };
      if (state.revision !== current.state.revision + 1 || state.priorStateSha256 !== digest(current.state) || state.transactionId !== current.state.transactionId || state.provider !== current.state.provider || state.sourceOid !== current.state.sourceOid || canonical(state.manifest) !== canonical(current.state.manifest) || canonical(state.loadedChain) !== canonical(current.state.loadedChain)) throw new Error("native-readback transition invalid");
    } else if (expectedRawSha256 !== null) throw new Error("native-readback receipt missing for CAS");
    else if (state.revision !== 0) throw new Error("initial native-readback revision invalid");
    const temporary = join(dirname(paths.receipt), `.receipt.${process.pid}.${randomBytes(12).toString("hex")}.tmp`);
    const bytes = jsonBytes(state);
    try {
      const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, paths.receipt); chmodSync(paths.receipt, 0o600); syncDirectory(paths.directory);
      return { path: paths.receipt, rawDigest: createHash("sha256").update(bytes).digest("hex"), written: true };
    } catch (error) {
      if (existsSync(temporary)) unlinkSync(temporary);
      throw error;
    }
  });
}

export function readNativeReadback(gitCommonDir, transactionId) {
  const paths = nativeReadbackPaths(gitCommonDir, transactionId);
  const stored = readStoredNative(paths.receipt);
  return { ...stored, path: paths.receipt };
}
