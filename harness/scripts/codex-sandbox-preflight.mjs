#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Default-off, product-independent coordinator contract for the Codex sandbox
 * preflight. It compiles only committed permission intents, runs one fixed
 * probe payload as an unsandboxed control and through the exact Codex sandbox
 * state interface, and emits a sanitized receipt. It never invokes a model or
 * changes Codex config.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants as fsConstants, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateAgainstSchema } from "../../plugins/pipeline-core/lib/schema-lite.mjs";

export const PREFLIGHT_SCHEMA = "pipeline.codex-sandbox-preflight.v1";
export const PROFILE_SCHEMA = "pipeline.codex-sandbox-profile-intent.v1";
export const PREFLIGHT_BUDGETS = Object.freeze({ firstEventMs: 30_000, semanticLeaseMs: 60_000, totalMs: 180_000, maxStreamBytes: 1_048_576, termGraceMs: 5_000, killGraceMs: 5_000 });
export const TERMINAL_CODES = Object.freeze(["ok", "profile-error", "platform-unknown", "permission-mismatch", "network-mismatch", "child-stdio-error", "first-event-timeout", "lifecycle-stall", "total-timeout", "output-truncated", "cleanup-not-owned", "cleanup-failed", "canary-drift", "internal-error"]);

const HERE = dirname(fileURLToPath(import.meta.url));
const RECEIPT_SCHEMA = JSON.parse(readFileSync(resolve(HERE, "codex-sandbox-preflight.schema.json"), "utf8"));
const PROFILE_FILES = Object.freeze({
  strong: resolve(HERE, "../profiles/codex-critic-strong.v1.json"),
  intermediate: resolve(HERE, "../profiles/codex-critic-intermediate.v1.json"),
});
const PAYLOAD_PATH = realpathSync(resolve(HERE, "fixtures/codex-sandbox-preflight-payload.mjs"));
const PAYLOAD_SCHEMA = "pipeline.codex-sandbox-preflight-payload.v1";
const STDIN_BYTES = Buffer.from("pipeline-codex-sandbox-preflight-stdin-v1\n", "utf8");
const ABSENT_SHA256 = sha256(Buffer.from("pipeline.preflight.absent.v1\n"));
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export class SandboxPreflightError extends Error {
  constructor(code, message) { super(message); this.name = "SandboxPreflightError"; this.code = code; }
}
function fail(code, message) { throw new SandboxPreflightError(code, message); }

export function canonicalJson(value) {
  const normalize = (entry) => Array.isArray(entry) ? entry.map(normalize)
    : entry && typeof entry === "object" ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, normalize(entry[key])])) : entry;
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) fail("profile-error", `${label} is not closed`);
}

export function loadProfileIntent(kind) {
  const path = PROFILE_FILES[kind];
  if (!path) fail("profile-error", "unknown profile kind");
  const raw = readFileSync(path);
  let value;
  try { value = JSON.parse(raw.toString("utf8")); } catch { fail("profile-error", "profile is not JSON"); }
  validateProfileIntent(value, kind);
  return { value, rawSha256: sha256(raw), path };
}

export function validateProfileIntent(profile, expectedKind = null) {
  exactKeys(profile, ["schema", "id", "basePolicy", "networkEnabled", "claims", "roots"], "profile");
  exactKeys(profile.claims, ["inputConfinement", "technicalWriteDenial", "networkConfinement"], "profile claims");
  exactKeys(profile.roots, ["readOnly", "readWrite", "denied"], "profile roots");
  if (profile.schema !== PROFILE_SCHEMA || !SAFE_ID.test(profile.id)
    || typeof profile.networkEnabled !== "boolean" || Object.values(profile.claims).some((value) => typeof value !== "boolean")
    || [profile.roots.readOnly, profile.roots.readWrite, profile.roots.denied].some((value) => !Array.isArray(value) || value.some((entry) => typeof entry !== "string"))) {
    fail("profile-error", "profile intent has invalid values");
  }
  const kind = profile.id === "codex-critic-strong.v1" ? "strong" : profile.id === "codex-critic-intermediate.v1" ? "intermediate" : null;
  if (!kind || expectedKind && kind !== expectedKind) fail("profile-error", "profile ID/kind mismatch");
  const expected = kind === "strong" ? {
    basePolicy: ":empty", networkEnabled: false, claims: [true, true, true], roots: [["$INPUT_ROOT", "$RUNTIME_READ_SET"], ["$OUTPUT_ROOT"], ["$DENIED_ROOTS", "$SENSITIVE_ROOTS"]],
  } : {
    basePolicy: ":read-only", networkEnabled: true, claims: [false, true, false], roots: [["$HOST_READABLE"], ["$COORDINATOR_SCRATCH_ROOT"], []],
  };
  if (profile.basePolicy !== expected.basePolicy || profile.networkEnabled !== expected.networkEnabled
    || JSON.stringify(Object.values(profile.claims)) !== JSON.stringify(expected.claims)
    || JSON.stringify(Object.values(profile.roots)) !== JSON.stringify(expected.roots)) fail("profile-error", "profile weakens its closed permission intent");
  return kind;
}

function physicalDirectory(path, label) {
  if (!isAbsolute(path) || resolve(path) !== path || !lstatSync(path).isDirectory() || realpathSync(path) !== path) fail("profile-error", `${label} must be a physical absolute directory`);
  return path;
}
function physicalFile(path, label) {
  if (!isAbsolute(path) || resolve(path) !== path || !lstatSync(path).isFile() || realpathSync(path) !== path) fail("profile-error", `${label} must be a physical absolute file`);
  return path;
}
function uniquePhysicalPaths(paths, label) {
  if (!Array.isArray(paths)) fail("profile-error", `${label} must be an array`);
  const normalized = paths.map((path) => physicalDirectory(path, label));
  if (new Set(normalized).size !== normalized.length) fail("profile-error", `${label} contains duplicate roots`);
  return normalized.sort();
}
function physicalRuntimePath(path, label) {
  if (!isAbsolute(path) || resolve(path) !== path || /[\0\r\n]/.test(path)) fail("profile-error", `${label} must be an absolute path`);
  if (path === "/proc/self") { if (!existsSync(path)) fail("profile-error", `${label} /proc/self is unavailable`); return path; }
  const stat = lstatSync(path);
  if (path !== "/dev/null" && !stat.isFile()) fail("profile-error", `${label} must enumerate files, /proc/self and /dev/null only`);
  if (realpathSync(path) !== path) fail("profile-error", `${label} must not contain aliases`);
  return path;
}
function uniqueRuntimePaths(paths, label) {
  if (!Array.isArray(paths) || paths.length < 1) fail("profile-error", `${label} must be a nonempty array`);
  const normalized = paths.map((path) => physicalRuntimePath(path, label));
  if (new Set(normalized).size !== normalized.length) fail("profile-error", `${label} contains duplicate paths`);
  return normalized.sort();
}
function overlaps(left, right) {
  const rel = relative(left, right);
  return rel === "" || rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function pathEntry(path, access) { return { path: { type: "path", path }, access }; }
function specialEntry(kind, access) { return { path: { type: "special", value: { kind } }, access }; }

/**
 * Compile the committed intent into the opaque `codex/sandbox-state-meta`
 * shape consumed by Codex CLI 0.144.6. The profile intent remains a separate
 * authority and is never embedded into, or inferred from, this runtime state.
 */
export function compilePermissionProfile(kind, roots) {
  const loaded = loadProfileIntent(kind);
  exactKeys(roots, ["inputRoot", "outputRoot", "runtimeReadSet", "deniedRoots", "sensitiveRoots", "sandboxCwd", "sandboxHelperPath"], "compile roots");
  const inputRoot = physicalDirectory(roots.inputRoot, "inputRoot");
  const outputRoot = physicalDirectory(roots.outputRoot, "outputRoot");
  const runtimeReadSet = uniqueRuntimePaths(roots.runtimeReadSet, "runtimeReadSet");
  const deniedRoots = uniquePhysicalPaths(roots.deniedRoots, "deniedRoots");
  const sensitiveRoots = uniquePhysicalPaths(roots.sensitiveRoots, "sensitiveRoots");
  if (deniedRoots.length < 1 || sensitiveRoots.length < 1) fail("profile-error", "strong probe roots must include denied and sensitive controls");
  const sandboxCwd = physicalDirectory(roots.sandboxCwd, "sandboxCwd");
  const sandboxHelperPath = physicalFile(roots.sandboxHelperPath, "sandboxHelperPath");
  if (!overlaps(inputRoot, sandboxCwd)) fail("profile-error", "sandboxCwd must be inside inputRoot");
  const groups = [inputRoot, outputRoot, ...runtimeReadSet, ...deniedRoots, ...sensitiveRoots];
  for (let a = 0; a < groups.length; a += 1) for (let b = a + 1; b < groups.length; b += 1) {
    if (overlaps(groups[a], groups[b]) || overlaps(groups[b], groups[a])) fail("profile-error", "compiled roots overlap or alias");
  }
  const entries = kind === "strong"
    ? [pathEntry(inputRoot, "read"), ...runtimeReadSet.map((path) => pathEntry(path, "read")), pathEntry(outputRoot, "write"), ...deniedRoots.map((path) => pathEntry(path, "deny")), ...sensitiveRoots.map((path) => pathEntry(path, "deny"))]
    : [specialEntry("root", "read"), pathEntry(outputRoot, "write")];
  const state = {
    permissionProfile: {
      type: "managed",
      file_system: { type: "restricted", entries },
      network: kind === "strong" ? "restricted" : "enabled",
    },
    codexLinuxSandboxExe: sandboxHelperPath,
    sandboxCwd: pathToFileURL(sandboxCwd).href,
    useLegacyLandlock: false,
  };
  const raw = Buffer.from(canonicalJson(state));
  const intentReadback = {
    profileId: loaded.value.id,
    profileRawSha256: loaded.rawSha256,
    basePolicy: loaded.value.basePolicy,
    networkEnabled: state.permissionProfile.network === "enabled",
    rootCounts: { readOnly: kind === "strong" ? 1 + runtimeReadSet.length : 1, readWrite: 1, denied: kind === "strong" ? deniedRoots.length + sensitiveRoots.length : 0 },
  };
  return { profile: loaded.value, profileRawSha256: loaded.rawSha256, state, raw, compiledStateSha256: sha256(raw), intentReadback };
}

export function buildSandboxInvocation({ codexPath, sandboxStateJson, sandboxStateSha256, nodePath, payloadPath, payloadArgs = [] }) {
  for (const [label, path] of Object.entries({ codexPath, nodePath, payloadPath })) {
    if (!isAbsolute(path) || resolve(path) !== path || /[\0\r\n]/.test(path)) fail("profile-error", `${label} must be an absolute canonical path`);
  }
  if (typeof sandboxStateJson !== "string" || Buffer.byteLength(sandboxStateJson) > 1_048_576
    || sha256(Buffer.from(sandboxStateJson)) !== sandboxStateSha256) fail("profile-error", "sandbox-state JSON is not bound to its exact bytes");
  let state;
  try { state = JSON.parse(sandboxStateJson); } catch { fail("profile-error", "sandbox-state is not JSON"); }
  validateCodexSandboxState(state);
  if (!Array.isArray(payloadArgs) || payloadArgs.some((value) => typeof value !== "string" || /[\0\r\n]/.test(value))) fail("profile-error", "payload arguments are invalid");
  return Object.freeze({ command: codexPath, argv: Object.freeze(["sandbox", "--sandbox-state-json", sandboxStateJson, "--", nodePath, payloadPath, ...payloadArgs]), options: Object.freeze({ shell: false }) });
}

export function validateCodexSandboxState(state) {
  exactKeys(state, ["permissionProfile", "codexLinuxSandboxExe", "sandboxCwd", "useLegacyLandlock"], "Codex sandbox state");
  exactKeys(state.permissionProfile, ["type", "file_system", "network"], "Codex permission profile");
  exactKeys(state.permissionProfile.file_system, ["type", "entries"], "Codex filesystem profile");
  if (state.permissionProfile.type !== "managed" || state.permissionProfile.file_system.type !== "restricted"
    || !new Set(["restricted", "enabled"]).has(state.permissionProfile.network)
    || !Array.isArray(state.permissionProfile.file_system.entries) || state.permissionProfile.file_system.entries.length < 1
    || typeof state.codexLinuxSandboxExe !== "string" || !isAbsolute(state.codexLinuxSandboxExe)
    || typeof state.sandboxCwd !== "string" || !state.sandboxCwd.startsWith("file://")
    || state.useLegacyLandlock !== false) fail("profile-error", "Codex sandbox state is not the closed 0.144.6 interface");
  for (const entry of state.permissionProfile.file_system.entries) {
    exactKeys(entry, ["path", "access"], "Codex filesystem entry");
    if (!new Set(["read", "write", "deny"]).has(entry.access) || !entry.path || typeof entry.path !== "object") fail("profile-error", "Codex filesystem entry is invalid");
    if (entry.path.type === "path") {
      exactKeys(entry.path, ["type", "path"], "Codex absolute path entry");
      if (typeof entry.path.path !== "string" || !isAbsolute(entry.path.path) || /[\0\r\n]/.test(entry.path.path)) fail("profile-error", "Codex absolute path entry is invalid");
    } else if (entry.path.type === "special") {
      exactKeys(entry.path, ["type", "value"], "Codex special path entry");
      exactKeys(entry.path.value, ["kind"], "Codex special path value");
      if (!new Set(["root", "minimal"]).has(entry.path.value.kind)) fail("profile-error", "Codex special path entry is invalid");
    } else fail("profile-error", "Codex filesystem path type is invalid");
  }
  return state;
}

function validateRuntimeStateAgainstIntent(kind, state) {
  const entries = state.permissionProfile.file_system.entries;
  if (kind === "intermediate") {
    const exactReadOnlyPlusScratch = entries.length === 2 && entries[0].access === "read"
      && entries[0].path.type === "special" && entries[0].path.value.kind === "root"
      && entries[1].access === "write" && entries[1].path.type === "path"
      && state.permissionProfile.network === "enabled";
    if (!exactReadOnlyPlusScratch) fail("permission-mismatch", "intermediate state is not exact read-only plus one coordinator scratch root and network enabled");
    return;
  }
  const paths = entries.filter((entry) => entry.path.type === "path");
  const accesses = paths.map(({ access }) => access);
  if (paths.length !== entries.length || state.permissionProfile.network !== "restricted"
    || accesses.filter((value) => value === "read").length < 5
    || accesses.filter((value) => value === "write").length !== 1
    || accesses.filter((value) => value === "deny").length < 2
    || paths.some((entry) => entry.path.path === "/")) fail("permission-mismatch", "strong state does not preserve the exact-runtime/root-deny shape");
}

function unescapeMount(value) { return value.replace(/\\040/g, " ").replace(/\\011/g, "\t").replace(/\\012/g, "\n").replace(/\\134/g, "\\"); }
export function classifyPlatform({ procVersion, mountInfo, candidateRoot }) {
  if (typeof procVersion !== "string" || typeof mountInfo !== "string" || !isAbsolute(candidateRoot)) fail("platform-unknown", "platform evidence is incomplete");
  const wsl = /microsoft|wsl/i.test(procVersion);
  const matches = [];
  for (const line of mountInfo.split("\n").filter(Boolean)) {
    const split = line.split(" - ");
    if (split.length !== 2) continue;
    const left = split[0].split(" ");
    const right = split[1].split(" ");
    if (left.length < 5 || right.length < 1) continue;
    const mountPoint = unescapeMount(left[4]);
    if (overlaps(mountPoint, candidateRoot)) matches.push({ mountPoint, filesystem: right[0].toLowerCase() });
  }
  if (matches.length === 0) fail("platform-unknown", "candidate filesystem is not present in mountinfo");
  matches.sort((a, b) => b.mountPoint.length - a.mountPoint.length);
  const best = matches.filter((entry) => entry.mountPoint.length === matches[0].mountPoint.length);
  if (new Set(best.map(({ filesystem }) => filesystem)).size !== 1) fail("platform-unknown", "candidate filesystem classification is ambiguous");
  const drvfs = new Set(["9p", "drvfs"]).has(best[0].filesystem);
  if (!wsl && drvfs) fail("platform-unknown", "DrvFS evidence disagrees with the kernel class");
  return { os: "linux", kernelClass: wsl ? "wsl2" : "linux", filesystemClass: wsl ? drvfs ? "drvfs" : "wsl-native" : "native-linux" };
}

function validateDigest(value, label) { if (!SHA256.test(value)) fail("internal-error", `${label} is not SHA-256`); }
function semanticEqual(control, sandbox) {
  const keys = ["stdinSha256", "eofObserved", "stdoutSha256", "stderrSha256", "childExit"];
  return keys.every((key) => control[key] === sandbox[key]);
}
function canaryProjection(canaries) {
  if (!Array.isArray(canaries) || canaries.length < 1) fail("internal-error", "at least one non-output canary is required");
  const normalized = canaries.map((entry) => {
    exactKeys(entry, ["id", "beforeSha256", "afterSha256"], "canary");
    if (!SAFE_ID.test(entry.id)) fail("internal-error", "canary ID is invalid");
    validateDigest(entry.beforeSha256, "canary before"); validateDigest(entry.afterSha256, "canary after");
    return entry;
  }).sort((a, b) => a.id.localeCompare(b.id));
  return { count: normalized.length, manifestSha256: sha256(Buffer.from(canonicalJson(normalized))), unchanged: normalized.every((entry) => entry.beforeSha256 === entry.afterSha256) };
}

export function evaluatePreflight(observation) {
  exactKeys(observation, ["kind", "cli", "sandboxHelper", "platform", "profile", "compiledState", "readback", "control", "sandbox", "probes", "canaries", "events", "durationMs", "streamBytes", "terminalCode"], "preflight observation");
  const kind = validateProfileIntent(observation.profile.value, observation.kind);
  validateDigest(observation.profile.rawSha256, "profile digest");
  validateDigest(observation.compiledState.rawSha256, "compiled state digest");
  const committedProfile = loadProfileIntent(kind);
  if (committedProfile.rawSha256 !== observation.profile.rawSha256
    || canonicalJson(committedProfile.value) !== canonicalJson(observation.profile.value)) fail("profile-error", "profile digest does not bind the committed intent bytes");
  validateCodexSandboxState(observation.readback);
  validateRuntimeStateAgainstIntent(kind, observation.readback);
  const readbackNetworkEnabled = observation.readback.permissionProfile.network === "enabled";
  if (sha256(Buffer.from(canonicalJson(observation.readback))) !== observation.compiledState.rawSha256
    || readbackNetworkEnabled !== observation.profile.value.networkEnabled) fail("permission-mismatch", "sandbox state readback differs from the compiled runtime state or separate intent");
  const terminal = TERMINAL_CODES.includes(observation.terminalCode) ? observation.terminalCode : "internal-error";
  const childEquivalent = semanticEqual(observation.control, observation.sandbox);
  const appServerInitEquivalent = observation.control.appServerInitialized === true && observation.sandbox.appServerInitialized === true
    && observation.control.appServerBoundedStop === true && observation.sandbox.appServerBoundedStop === true;
  const canaries = canaryProjection(observation.canaries);
  const events = Array.isArray(observation.events) && observation.events.length > 0 ? observation.events : [];
  const lifecycleComplete = JSON.stringify(events.map(({ type }) => type)) === JSON.stringify(["control-started", "control-complete", "sandbox-started", "sandbox-complete"])
    && events.every((event, index) => Number.isSafeInteger(event.atMs) && (index === 0 || event.atMs >= events[index - 1].atMs));
  const vectors = {
    allowedRead: observation.probes.allowedRead === true,
    externalReadDenied: observation.probes.externalReadDenied === true,
    sensitiveReadDenied: observation.probes.sensitiveReadDenied === true,
    writeDenied: observation.probes.writeDenied === true,
    scratchWriteAllowed: observation.probes.scratchWriteAllowed === true,
    networkDenied: observation.probes.networkDenied === true,
    childStdioEquivalent: childEquivalent && observation.control.stdoutSha256 === observation.sandbox.stdoutSha256 && observation.control.stderrSha256 === observation.sandbox.stderrSha256,
    stdinEofEquivalent: childEquivalent && observation.control.stdinSha256 === observation.sandbox.stdinSha256 && observation.control.eofObserved === true,
    childExitEquivalent: childEquivalent && observation.control.childExit === observation.sandbox.childExit,
    appServerInitEquivalent,
    lifecycleComplete,
  };
  let effectiveTerminal = terminal;
  if (effectiveTerminal === "ok" && !canaries.unchanged) effectiveTerminal = "canary-drift";
  else if (effectiveTerminal === "ok" && (!childEquivalent || !vectors.appServerInitEquivalent)) effectiveTerminal = "child-stdio-error";
  else if (effectiveTerminal === "ok" && readbackNetworkEnabled !== observation.profile.value.networkEnabled) effectiveTerminal = "network-mismatch";
  else if (effectiveTerminal === "ok" && !lifecycleComplete) effectiveTerminal = "lifecycle-stall";
  else if (effectiveTerminal === "ok" && (!Number.isSafeInteger(observation.durationMs) || observation.durationMs < 0 || observation.durationMs > PREFLIGHT_BUDGETS.totalMs)) effectiveTerminal = "total-timeout";
  else if (effectiveTerminal === "ok" && (!Number.isSafeInteger(observation.streamBytes.stdout) || !Number.isSafeInteger(observation.streamBytes.stderr)
    || observation.streamBytes.stdout > PREFLIGHT_BUDGETS.maxStreamBytes || observation.streamBytes.stderr > PREFLIGHT_BUDGETS.maxStreamBytes)) effectiveTerminal = "output-truncated";
  else if (effectiveTerminal === "ok" && kind === "strong" && !vectors.networkDenied) effectiveTerminal = "network-mismatch";
  else if (effectiveTerminal === "ok" && kind === "intermediate" && vectors.networkDenied) effectiveTerminal = "network-mismatch";
  else if (effectiveTerminal === "ok" && (!vectors.allowedRead || !vectors.writeDenied
    || kind === "strong" && (!vectors.externalReadDenied || !vectors.sensitiveReadDenied || !vectors.scratchWriteAllowed)
    || kind === "intermediate" && (vectors.externalReadDenied || vectors.sensitiveReadDenied || !vectors.scratchWriteAllowed))) effectiveTerminal = "permission-mismatch";
  const common = effectiveTerminal === "ok" && canaries.unchanged && vectors.allowedRead && vectors.writeDenied
    && vectors.childStdioEquivalent && vectors.stdinEofEquivalent && vectors.childExitEquivalent && vectors.appServerInitEquivalent && vectors.lifecycleComplete;
  const strong = common && kind === "strong" && !observation.profile.value.networkEnabled && vectors.externalReadDenied
    && vectors.sensitiveReadDenied && vectors.scratchWriteAllowed && vectors.networkDenied;
  const intermediate = common && kind === "intermediate" && observation.profile.value.networkEnabled
    && !observation.profile.value.claims.inputConfinement && !observation.profile.value.claims.networkConfinement
    && !vectors.externalReadDenied && !vectors.sensitiveReadDenied && vectors.scratchWriteAllowed && !vectors.networkDenied;
  const eligibility = strong ? "strong" : intermediate ? "intermediate" : effectiveTerminal === "ok" ? "diagnostic" : "none";
  const receipt = {
    schema: PREFLIGHT_SCHEMA,
    cli: observation.cli,
    sandboxHelper: observation.sandboxHelper,
    platform: observation.platform,
    profile: { id: observation.profile.value.id, rawSha256: observation.profile.rawSha256, compiledStateSha256: observation.compiledState.rawSha256 },
    networkEnabled: observation.profile.value.networkEnabled,
    vectors,
    canaries,
    eventChainSha256: sha256(Buffer.from(canonicalJson(events))),
    durationMs: observation.durationMs,
    eligibility,
    terminalCode: effectiveTerminal,
  };
  validatePreflightReceipt(receipt);
  return receipt;
}

export function validatePreflightReceipt(receipt) {
  const schema = structuredClone(RECEIPT_SCHEMA);
  const rewriteInteger = (node) => { if (Array.isArray(node)) node.forEach(rewriteInteger); else if (node && typeof node === "object") { if (node.type === "integer") node.type = "number"; Object.values(node).forEach(rewriteInteger); } };
  rewriteInteger(schema);
  const result = validateAgainstSchema(receipt, schema);
  if (!result.valid) fail("internal-error", `receipt schema mismatch: ${result.errors.join("; ")}`);
  for (const digest of [receipt.cli.artifactSha256, receipt.sandboxHelper.artifactSha256, receipt.profile.rawSha256, receipt.profile.compiledStateSha256, receipt.canaries.manifestSha256, receipt.eventChainSha256]) validateDigest(digest, "receipt digest");
  if (receipt.sandboxHelper.sameArtifactAsCli !== (receipt.sandboxHelper.artifactSha256 === receipt.cli.artifactSha256)) fail("internal-error", "sandbox helper artifact relation is false");
  if (!Number.isSafeInteger(receipt.durationMs) || !Number.isSafeInteger(receipt.canaries.count) || receipt.canaries.count < 1) fail("internal-error", "receipt numeric fields are invalid");
  const text = canonicalJson(receipt);
  if (/\/(?:home|users)\/|\\users\\|support|account|credential|ssh:|https?:|git@/i.test(text)) fail("internal-error", "receipt contains private or remote material");
  if (receipt.eligibility === "strong" && (receipt.networkEnabled || receipt.terminalCode !== "ok"
    || !receipt.vectors.externalReadDenied || !receipt.vectors.sensitiveReadDenied || !receipt.vectors.networkDenied)) fail("internal-error", "strong receipt lacks strong controls");
  if (receipt.eligibility === "intermediate" && (!receipt.networkEnabled || receipt.terminalCode !== "ok")) fail("internal-error", "intermediate receipt lacks its exact network-open boundary");
  return receipt;
}

export function evaluatePreflightLease({ startedAtMs, events, nowMs }) {
  if (!Number.isSafeInteger(startedAtMs) || !Number.isSafeInteger(nowMs) || nowMs < startedAtMs || !Array.isArray(events)) fail("internal-error", "lease evidence is invalid");
  if (nowMs - startedAtMs >= PREFLIGHT_BUDGETS.totalMs) return { state: "expired", terminalCode: "total-timeout" };
  const semantic = events.filter((event) => event && event.semantic === true && Number.isSafeInteger(event.atMs)
    && event.atMs >= startedAtMs && event.atMs <= nowMs && SHA256.test(event.contentSha256));
  if (semantic.length === 0) return nowMs - startedAtMs >= PREFLIGHT_BUDGETS.firstEventMs
    ? { state: "expired", terminalCode: "first-event-timeout" } : { state: "active", terminalCode: null };
  const last = Math.max(...semantic.map(({ atMs }) => atMs));
  return nowMs - last >= PREFLIGHT_BUDGETS.semanticLeaseMs
    ? { state: "expired", terminalCode: "lifecycle-stall" } : { state: "active", terminalCode: null };
}

export function decidePreflightCleanup(expected, observed) {
  const keys = ["hostBootId", "pid", "processStartId", "pgid", "coordinatorNonce"];
  exactKeys(expected, keys, "expected process identity"); exactKeys(observed, [...keys, "running"], "observed process identity");
  const validNumber = (value) => Number.isSafeInteger(value) && value > 0;
  if (!validNumber(expected.pid) || !validNumber(expected.pgid) || typeof observed.running !== "boolean") fail("internal-error", "process identity is invalid");
  if (observed.running === false) return { action: "none", status: "not-needed" };
  const owned = keys.every((key) => expected[key] === observed[key]);
  return owned ? { action: "signal-process-group", signal: "TERM", pgid: expected.pgid, status: "pending" }
    : { action: "none", status: "cleanup-not-owned" };
}

export function advancePreflightCleanup({ priorSignal, signaledAtMs, nowMs, running, ownershipMatched }) {
  if (!new Set(["TERM", "KILL"]).has(priorSignal) || !Number.isSafeInteger(signaledAtMs) || !Number.isSafeInteger(nowMs)
    || nowMs < signaledAtMs || typeof running !== "boolean" || typeof ownershipMatched !== "boolean") fail("internal-error", "cleanup progress is invalid");
  if (!running) return { action: "complete", terminalCode: null };
  if (!ownershipMatched) return { action: "stop", terminalCode: "cleanup-not-owned" };
  if (priorSignal === "TERM" && nowMs - signaledAtMs >= PREFLIGHT_BUDGETS.termGraceMs) return { action: "signal-process-group", signal: "KILL" };
  if (priorSignal === "KILL" && nowMs - signaledAtMs >= PREFLIGHT_BUDGETS.killGraceMs) return { action: "stop", terminalCode: "cleanup-failed" };
  return { action: "wait", terminalCode: null };
}

function mkdirPhysical(path) { mkdirSync(path, { mode: 0o700 }); return realpathSync(path); }
function writeFixture(path, value) { writeFileSync(path, value, { flag: "wx", mode: 0o600 }); return realpathSync(path); }
function hashPathOrAbsent(path) { return existsSync(path) ? sha256(readFileSync(path)) : ABSENT_SHA256; }

function createProbeCase(root, name) {
  const caseRoot = mkdirPhysical(join(root, name));
  const inputRoot = mkdirPhysical(join(caseRoot, "input"));
  const outputRoot = mkdirPhysical(join(caseRoot, "output"));
  const codexHomePath = mkdirPhysical(join(outputRoot, "codex-home"));
  const deniedRoot = mkdirPhysical(join(caseRoot, "denied"));
  const sensitiveRoot = mkdirPhysical(join(caseRoot, "sensitive"));
  const canaryRoot = mkdirPhysical(join(caseRoot, "canary"));
  const paths = {
    allowedReadPath: writeFixture(join(inputRoot, "allowed.txt"), "ALLOWED-READ-V1\n"),
    externalReadPath: writeFixture(join(deniedRoot, "external.txt"), "EXTERNAL-READ-CANARY-V1\n"),
    sensitiveReadPath: writeFixture(join(sensitiveRoot, "synthetic-credential.txt"), "SYNTHETIC-NONSECRET-CANARY-V1\n"),
    deniedWritePath: join(deniedRoot, "write-probe.txt"),
    scratchWritePath: join(outputRoot, "scratch-probe.txt"),
    stableCanaryPath: writeFixture(join(canaryRoot, "stable.txt"), "STABLE-CANARY-V1\n"),
  };
  const canaryPaths = [
    ["allowed-input", paths.allowedReadPath],
    ["external-read", paths.externalReadPath],
    ["sensitive-read", paths.sensitiveReadPath],
    ["stable", paths.stableCanaryPath],
  ];
  return { caseRoot, inputRoot, outputRoot, codexHomePath, deniedRoot, sensitiveRoot, paths, canaryPaths };
}

function snapshotCanaries(prefix, entries) {
  return entries.map(([id, path]) => ({ id: `${prefix}-${id}`, path, sha256: hashPathOrAbsent(path) }));
}
function compareCanaries(before) {
  return before.map(({ id, path, sha256: beforeSha256 }) => ({ id, beforeSha256, afterSha256: hashPathOrAbsent(path) }));
}

function openLoopbackCanary() {
  const server = createServer((socket) => socket.end());
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === "string") reject(new Error("loopback address unavailable"));
      else resolvePromise({ server, host: "127.0.0.1", port: address.port });
    });
  });
}
function closeServer(server) { return new Promise((resolvePromise) => server.close(() => resolvePromise())); }

function readProcessIdentity(pid) {
  try {
    const bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const closeParen = stat.lastIndexOf(")");
    if (closeParen < 0) return null;
    const fields = stat.slice(closeParen + 2).trim().split(/\s+/);
    const pgid = Number(fields[2]);
    const processStartId = fields[19];
    const env = readFileSync(`/proc/${pid}/environ`).toString("utf8").split("\0");
    const nonceEntry = env.find((value) => value.startsWith("PIPELINE_PREFLIGHT_NONCE="));
    if (!Number.isSafeInteger(pgid) || pgid < 1 || !processStartId || !nonceEntry) return null;
    return { hostBootId: bootId, pid, processStartId, pgid, coordinatorNonce: nonceEntry.slice("PIPELINE_PREFLIGHT_NONCE=".length), running: true };
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ESRCH") return null;
    throw error;
  }
}
function wait(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }

async function terminateOwnedProcessGroup(child, expected, closePromise) {
  const observed = readProcessIdentity(child.pid);
  if (!observed) return { terminalCode: null, cleanup: "not-needed" };
  if (["hostBootId", "pid", "processStartId", "pgid", "coordinatorNonce"].some((key) => observed[key] !== expected[key])) {
    return { terminalCode: "cleanup-not-owned", cleanup: "not-owned" };
  }
  try { process.kill(-expected.pgid, "SIGTERM"); }
  catch (error) { if (error?.code === "ESRCH") return { terminalCode: null, cleanup: "not-needed" }; throw error; }
  if (await Promise.race([closePromise.then(() => true), wait(PREFLIGHT_BUDGETS.termGraceMs).then(() => false)])) return { terminalCode: null, cleanup: "term" };
  const beforeKill = readProcessIdentity(child.pid);
  if (!beforeKill || ["hostBootId", "pid", "processStartId", "pgid", "coordinatorNonce"].some((key) => beforeKill[key] !== expected[key])) {
    return beforeKill ? { terminalCode: "cleanup-not-owned", cleanup: "not-owned" } : { terminalCode: null, cleanup: "term" };
  }
  try { process.kill(-expected.pgid, "SIGKILL"); }
  catch (error) { if (error?.code === "ESRCH") return { terminalCode: null, cleanup: "term" }; throw error; }
  if (await Promise.race([closePromise.then(() => true), wait(PREFLIGHT_BUDGETS.killGraceMs).then(() => false)])) return { terminalCode: null, cleanup: "kill" };
  return { terminalCode: "cleanup-failed", cleanup: "failed" };
}

function parsePayloadLines(buffer, onSemantic) {
  const values = [];
  for (const line of buffer.split("\n").filter(Boolean)) {
    let value;
    try { value = JSON.parse(line); } catch { continue; }
    if (value?.schema === PAYLOAD_SCHEMA && new Set(["started", "result", "error"]).has(value.type)) {
      values.push(value); onSemantic(value);
    }
  }
  return values;
}

/** Run one fixed command in a fresh process group with semantic-event leases. */
export async function runBoundedProbe({ command, argv, cwd, env, input = STDIN_BYTES }) {
  if (!isAbsolute(command) || !Array.isArray(argv) || argv.some((value) => typeof value !== "string")) fail("internal-error", "bounded probe command is invalid");
  const nonce = randomBytes(24).toString("hex");
  const startedAt = Date.now();
  const child = spawn(command, argv, { cwd, env: { ...env, PIPELINE_PREFLIGHT_NONCE: nonce }, shell: false, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0); let lineBuffer = ""; let payloadResult = null;
  let terminalCode = null; let firstTimer; let leaseTimer; let totalTimer; let resolveTerminal;
  const terminalPromise = new Promise((resolvePromise) => { resolveTerminal = resolvePromise; });
  const expire = (code) => { if (!terminalCode) { terminalCode = code; resolveTerminal(code); } };
  firstTimer = setTimeout(() => expire("first-event-timeout"), PREFLIGHT_BUDGETS.firstEventMs);
  totalTimer = setTimeout(() => expire("total-timeout"), PREFLIGHT_BUDGETS.totalMs);
  const semanticEvents = [];
  const onSemantic = (value) => {
    const atMs = Date.now() - startedAt;
    semanticEvents.push({ type: value.type, atMs, semantic: true, contentSha256: sha256(Buffer.from(canonicalJson(value))) });
    clearTimeout(firstTimer); clearTimeout(leaseTimer);
    if (value.type === "result") payloadResult = value;
    else leaseTimer = setTimeout(() => expire("lifecycle-stall"), PREFLIGHT_BUDGETS.semanticLeaseMs);
  };
  const append = (current, chunk, stream) => {
    const nextBytes = current.length + chunk.length;
    if (nextBytes > PREFLIGHT_BUDGETS.maxStreamBytes) {
      expire("output-truncated");
      return Buffer.concat([current, chunk.subarray(0, Math.max(0, PREFLIGHT_BUDGETS.maxStreamBytes - current.length))]);
    }
    if (stream === "stdout") {
      lineBuffer += chunk.toString("utf8");
      const lastNewline = lineBuffer.lastIndexOf("\n");
      if (lastNewline >= 0) {
        parsePayloadLines(lineBuffer.slice(0, lastNewline + 1), onSemantic);
        lineBuffer = lineBuffer.slice(lastNewline + 1);
      }
    }
    return Buffer.concat([current, chunk]);
  };
  child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk, "stdout"); });
  child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk, "stderr"); });
  const closePromise = new Promise((resolvePromise) => {
    child.once("error", (error) => resolvePromise({ code: null, signal: null, spawnError: error?.code || "spawn-error" }));
    child.once("close", (code, signal) => resolvePromise({ code, signal, spawnError: null }));
  });
  let expected = null;
  for (let attempt = 0; attempt < 20 && !expected; attempt += 1) {
    expected = readProcessIdentity(child.pid);
    if (!expected) await wait(5);
  }
  if (expected?.coordinatorNonce !== nonce || expected?.pgid !== child.pid) expected = null;
  child.stdin.end(input);
  const winner = await Promise.race([closePromise.then((close) => ({ close })), terminalPromise.then((code) => ({ terminal: code }))]);
  let close = winner.close || null;
  let cleanup = "not-needed";
  if (winner.terminal) {
    if (!expected) terminalCode = "cleanup-not-owned";
    else {
      const cleanupResult = await terminateOwnedProcessGroup(child, expected, closePromise);
      cleanup = cleanupResult.cleanup;
      if (cleanupResult.terminalCode) terminalCode = cleanupResult.terminalCode;
    }
    close = await Promise.race([closePromise, wait(PREFLIGHT_BUDGETS.killGraceMs).then(() => ({ code: null, signal: null, spawnError: "cleanup-timeout" }))]);
  }
  clearTimeout(firstTimer); clearTimeout(leaseTimer); clearTimeout(totalTimer);
  if (lineBuffer) parsePayloadLines(lineBuffer, onSemantic);
  if (!terminalCode && (close.spawnError || close.code !== 0 || !payloadResult)) terminalCode = "child-stdio-error";
  return { terminalCode: terminalCode || "ok", close, stdout, stderr, payloadResult, semanticEvents, durationMs: Date.now() - startedAt, cleanup };
}

function payloadRequest(fixture, network, codexPath) {
  return Buffer.from(JSON.stringify({ ...fixture.paths, codexPath, codexHomePath: fixture.codexHomePath, networkHost: network.host, networkPort: network.port }), "utf8").toString("base64url");
}
function semanticProjection(result) {
  if (!result) return { stdinSha256: sha256(Buffer.alloc(0)), eofObserved: false, stdoutSha256: sha256(Buffer.alloc(0)), stderrSha256: sha256(Buffer.alloc(0)), childExit: -1, appServerInitialized: false, appServerBoundedStop: false };
  return {
    stdinSha256: sha256(Buffer.from(result.stdin || "", "base64")),
    eofObserved: result.eof === true,
    stdoutSha256: sha256(Buffer.from(result.child?.stdout || "", "utf8")),
    stderrSha256: sha256(Buffer.from(result.child?.stderr || "", "utf8")),
    childExit: Number.isSafeInteger(result.child?.status) ? result.child.status : -1,
    appServerInitialized: result.appServer?.initialized === true,
    appServerBoundedStop: result.appServer?.boundedStopObserved === true,
  };
}
function probeProjection(result) {
  const probes = result?.probes || {};
  return {
    allowedRead: probes.allowedRead === "success",
    externalReadDenied: probes.externalRead === "denied",
    sensitiveReadDenied: probes.sensitiveRead === "denied",
    writeDenied: probes.deniedWrite === "denied",
    scratchWriteAllowed: probes.scratchWrite === "success",
    networkDenied: probes.network === "denied",
  };
}
function sanitizedEnvironment(root, codexPath, nodePath) {
  const home = mkdirPhysical(join(root, "home"));
  const codexHome = mkdirPhysical(join(root, "codex-home"));
  return { HOME: home, CODEX_HOME: codexHome, PATH: `${dirname(nodePath)}:${dirname(codexPath)}:/usr/bin:/bin`, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" };
}
function inspectCodex(codexPath, env) {
  const result = spawnSync(codexPath, ["--version"], { encoding: "utf8", env, shell: false, timeout: 10_000, maxBuffer: 65_536 });
  const match = result.status === 0 ? `${result.stdout || ""} ${result.stderr || ""}`.match(/\b(\d+\.\d+\.\d+)\b/) : null;
  if (!match) fail("profile-error", "Codex version probe failed");
  return { version: match[1], artifactSha256: sha256(readFileSync(codexPath)) };
}
export function resolveNodeRuntimeReadSet(nodePath) {
  nodePath = physicalFile(realpathSync(nodePath), "nodePath");
  const lddPath = "/usr/bin/ldd";
  if (!existsSync(lddPath)) fail("profile-error", "fixed ldd runtime resolver is unavailable");
  const result = spawnSync(lddPath, [nodePath], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" }, shell: false, timeout: 10_000, maxBuffer: 262_144 });
  if (result.status !== 0 || /\bnot found\b/i.test(result.stdout)) fail("profile-error", "Node runtime dependency resolution failed");
  const dependencies = [];
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/(?:=>\s+)?(\/[^\s(]+)/);
    if (match && existsSync(match[1])) dependencies.push(realpathSync(match[1]));
  }
  return [...new Set([nodePath, PAYLOAD_PATH, ...dependencies, "/proc/self", "/dev/null"])].sort();
}
function persistReceipt(path, receipt) {
  if (!isAbsolute(path) || resolve(path) !== path || /[\0\r\n]/.test(path)) fail("internal-error", "receipt path must be absolute and canonical");
  physicalDirectory(dirname(path), "receipt parent");
  const flags = fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW || 0);
  const fd = openSync(path, flags, 0o600);
  try { writeFileSync(fd, canonicalJson(receipt)); } finally { closeSync(fd); }
}

/** Execute the real, default-off A/B harness and persist one sanitized receipt. */
export async function runCodexSandboxPreflight({ kind, codexPath, sandboxHelperPath, receiptPath }) {
  if (!new Set(["strong", "intermediate"]).has(kind)) fail("profile-error", "kind must be strong or intermediate");
  codexPath = physicalFile(realpathSync(codexPath), "codexPath");
  sandboxHelperPath = physicalFile(realpathSync(sandboxHelperPath), "sandboxHelperPath");
  const nodePath = physicalFile(realpathSync(process.execPath), "nodePath");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-sandbox-preflight-")));
  const startedAt = Date.now();
  let network;
  try {
    const controlFixture = createProbeCase(root, "control");
    const sandboxFixture = createProbeCase(root, "sandbox");
    const env = sanitizedEnvironment(root, codexPath, nodePath);
    const cli = inspectCodex(codexPath, env);
    const platform = classifyPlatform({ procVersion: readFileSync("/proc/version", "utf8"), mountInfo: readFileSync("/proc/self/mountinfo", "utf8"), candidateRoot: root });
    network = await openLoopbackCanary();

    const controlBefore = snapshotCanaries("control", controlFixture.canaryPaths);
    const control = await runBoundedProbe({ command: nodePath, argv: [PAYLOAD_PATH, payloadRequest(controlFixture, network, codexPath)], cwd: controlFixture.inputRoot, env });
    const controlCanaries = compareCanaries(controlBefore);

    const sandboxBefore = snapshotCanaries("sandbox", sandboxFixture.canaryPaths);
    const runtimeReadSet = [...new Set([...resolveNodeRuntimeReadSet(nodePath), codexPath])].sort();
    const compiled = compilePermissionProfile(kind, {
      inputRoot: sandboxFixture.inputRoot,
      outputRoot: sandboxFixture.outputRoot,
      runtimeReadSet,
      deniedRoots: [sandboxFixture.deniedRoot],
      sensitiveRoots: [sandboxFixture.sensitiveRoot],
      sandboxCwd: sandboxFixture.inputRoot,
      sandboxHelperPath,
    });
    const stateJson = compiled.raw.toString("utf8");
    const invocation = buildSandboxInvocation({ codexPath, sandboxStateJson: stateJson, sandboxStateSha256: compiled.compiledStateSha256, nodePath, payloadPath: PAYLOAD_PATH, payloadArgs: [payloadRequest(sandboxFixture, network, codexPath)] });
    const sandbox = await runBoundedProbe({ command: invocation.command, argv: invocation.argv, cwd: sandboxFixture.inputRoot, env });
    const sandboxCanaries = compareCanaries(sandboxBefore);

    const controlSemantic = semanticProjection(control.payloadResult);
    const sandboxSemantic = semanticProjection(sandbox.payloadResult);
    let terminalCode = control.terminalCode !== "ok" ? control.terminalCode : sandbox.terminalCode;
    if (terminalCode === "ok" && (control.payloadResult?.child?.errorClass || sandbox.payloadResult?.child?.errorClass)) terminalCode = "child-stdio-error";
    const events = [];
    if (control.semanticEvents.some(({ type }) => type === "started")) events.push({ type: "control-started", atMs: 0 });
    if (control.semanticEvents.some(({ type }) => type === "result")) events.push({ type: "control-complete", atMs: control.durationMs });
    if (sandbox.semanticEvents.some(({ type }) => type === "started")) events.push({ type: "sandbox-started", atMs: control.durationMs });
    if (sandbox.semanticEvents.some(({ type }) => type === "result")) events.push({ type: "sandbox-complete", atMs: control.durationMs + sandbox.durationMs });
    const receipt = evaluatePreflight({
      kind,
      cli,
      sandboxHelper: { artifactSha256: sha256(readFileSync(sandboxHelperPath)), sameArtifactAsCli: sha256(readFileSync(sandboxHelperPath)) === cli.artifactSha256 },
      platform,
      profile: { value: compiled.profile, rawSha256: compiled.profileRawSha256 },
      compiledState: { rawSha256: compiled.compiledStateSha256 },
      readback: JSON.parse(stateJson),
      control: controlSemantic,
      sandbox: sandboxSemantic,
      probes: probeProjection(sandbox.payloadResult),
      canaries: [...controlCanaries, ...sandboxCanaries],
      events,
      durationMs: Date.now() - startedAt,
      streamBytes: { stdout: sandbox.stdout.length, stderr: sandbox.stderr.length },
      terminalCode,
    });
    persistReceipt(receiptPath, receipt);
    return receipt;
  } finally {
    if (network?.server) await closeServer(network.server);
    rmSync(root, { recursive: true, force: true });
  }
}

function usage() {
  return "usage: codex-sandbox-preflight.mjs --run --kind <strong|intermediate> --codex <absolute-path> --sandbox-helper <absolute-path> --receipt <absolute-new-path>";
}
function parseCli(argv) {
  if (argv.length !== 9 || argv[0] !== "--run" || argv[1] !== "--kind" || argv[3] !== "--codex" || argv[5] !== "--sandbox-helper" || argv[7] !== "--receipt") fail("profile-error", usage());
  return { kind: argv[2], codexPath: argv[4], sandboxHelperPath: argv[6], receiptPath: argv[8] };
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  try {
    const receipt = await runCodexSandboxPreflight(parseCli(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ schema: PREFLIGHT_SCHEMA, eligibility: receipt.eligibility, terminalCode: receipt.terminalCode })}\n`);
    process.exitCode = receipt.terminalCode === "ok" ? 0 : 1;
  } catch (error) {
    const errorClass = TERMINAL_CODES.includes(error?.code) ? error.code : "internal-error";
    process.stderr.write(`${JSON.stringify({ schema: PREFLIGHT_SCHEMA, terminalCode: errorClass })}\n`);
    process.exitCode = 2;
  }
}
