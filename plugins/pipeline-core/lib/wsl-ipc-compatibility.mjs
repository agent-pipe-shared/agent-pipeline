// SPDX-License-Identifier: SUL-1.0

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync,
  mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, renameSync,
  rmSync, statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { projectSandboxFailure, sanitizeSandboxFailure, isReactiveIpcTrigger, SANDBOX_FAILURE_SCHEMA } from "./sandbox-failure.mjs";
import { assertPrivateRegularFile, ensurePrivateDirectory } from "./private-boundary.mjs";

export const WSL_IPC_SCHEMA = "pipeline.codex-wsl-ipc-compatibility.v1";
export const PROFILE_NAME = "pipeline-wsl-ipc-compat";
export const STATES = Object.freeze(["standard", "suspected", "probe-required", "confirmed", "remediation-available", "approval-required", "installed", "validation-required", "session-fallback-active", "not-required", "unavailable"]);
export const ELIGIBLE_CLASSES = Object.freeze(["coordinator-workspace", "implement", "mechanic", "deep", "test_author"]);
export const INELIGIBLE_CLASSES = Object.freeze(["advisory", "readiness", "critic_normal", "critic_high_risk", "review", "validation", "security", "release"]);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const canonical = value => `${JSON.stringify(value, (key, entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.keys(entry).sort().map(k => [k, entry[k]])) : entry, 2)}\n`;
const SHA256 = /^[0-9a-f]{64}$/u;
const VALIDATOR_MAX_BYTES = 64 * 1024;
const DEFAULT_PERMISSIONS_RE = /(?:^|\n)\s*default_permissions\s*=\s*"([^"]+)"\s*(?:\n|$)/u;
const EXPLICIT_WORKSPACE_DEFAULT = 'default_permissions = ":workspace"\n';

function syncFile(path) {
  const descriptor = openSync(path, "r+");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}
function syncDirectory(path) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY);
    fsyncSync(descriptor);
  } catch (error) {
    if (!(process.platform === "win32"
      && ["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP"].includes(error?.code))) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
function physicalDirectory(path, label) {
  const absolute = resolve(path);
  const info = lstatSync(absolute);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(absolute) !== absolute) throw new Error(`${label} is not a physical directory`);
  return absolute;
}
function physicalRegularFile(path, label) {
  const absolute = resolve(path);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(absolute) !== absolute) throw new Error(`${label} is not a physical single-link file`);
  return { path: absolute, identity: { dev: String(info.dev), ino: String(info.ino) } };
}
function sameFileIdentity(path, expected) {
  try {
    const info = lstatSync(path);
    return info.isFile() && !info.isSymbolicLink() && info.nlink === 1
      && String(info.dev) === expected.dev && String(info.ino) === expected.ino;
  } catch { return false; }
}
function contained(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function strictValidateCodexConfig({ codexPath, codexDigest = null, configBytes, tempHome, spawn = spawnSync, timeoutMs = 5000 }) {
  if (!codexPath || !tempHome || typeof configBytes !== "string") return { ok: false, status: "validation-required", code: "validator-input-invalid" };
  try {
    const executable = physicalRegularFile(codexPath, "Codex executable");
    const actual = sha256(readFileSync(executable.path));
    if (codexDigest && codexDigest !== actual) return { ok: false, status: "digest-drift", code: "validator-executable-drift" };
    const home = physicalDirectory(tempHome, "validator CODEX_HOME");
    const config = join(home, "config.toml");
    writeFileSync(config, configBytes, { mode: 0o600, flag: "wx" });
    const child = spawn(executable.path, ["--strict-config", "doctor", "--json"], {
      env: { PATH: process.env.PATH ?? "", CODEX_HOME: home },
      timeout: timeoutMs,
      encoding: "utf8",
      maxBuffer: VALIDATOR_MAX_BYTES,
      shell: false,
      windowsHide: true,
    });
    if (child.error?.code === "ETIMEDOUT" || child.signal) return { ok: false, status: "validation-required", code: "validator-timeout" };
    if (child.error?.code === "ENOBUFS"
      || Buffer.byteLength(child.stdout ?? "", "utf8") >= VALIDATOR_MAX_BYTES
      || Buffer.byteLength(child.stderr ?? "", "utf8") >= VALIDATOR_MAX_BYTES) {
      return { ok: false, status: "validation-required", code: "validator-output-truncated" };
    }
    if (child.error) return { ok: false, status: "validation-required", code: "validator-spawn-failed" };
    let parsed;
    try { parsed = JSON.parse(child.stdout || ""); }
    catch { return { ok: false, status: "validation-required", code: "validator-output-malformed" }; }
    const load = parsed?.checks?.["config.load"]?.status;
    return {
      ok: load === "ok",
      status: load === "ok" ? "validated" : "validation-required",
      code: load === "ok" ? "validator-config-load-ok" : "validator-config-load-failed",
      exitCode: child.status,
      configLoad: load,
    };
  } catch {
    return { ok: false, status: "validation-required", code: "validator-boundary-invalid" };
  }
}

function parseDoctorConfigLoad(child) {
  if (child?.error?.code === "ETIMEDOUT" || child?.signal) return { ok: false, status: "validation-required", code: "validator-timeout" };
  if (child?.error?.code === "ENOBUFS"
    || Buffer.byteLength(child?.stdout ?? "", "utf8") >= VALIDATOR_MAX_BYTES
    || Buffer.byteLength(child?.stderr ?? "", "utf8") >= VALIDATOR_MAX_BYTES) {
    return { ok: false, status: "validation-required", code: "validator-output-truncated" };
  }
  if (child?.error) return { ok: false, status: "validation-required", code: "validator-spawn-failed" };
  let parsed;
  try { parsed = JSON.parse(child?.stdout || ""); }
  catch { return { ok: false, status: "validation-required", code: "validator-output-malformed" }; }
  const load = parsed?.checks?.["config.load"]?.status;
  return {
    ok: load === "ok",
    status: load === "ok" ? "validated" : "validation-required",
    code: load === "ok" ? "validator-config-load-ok" : "validator-config-load-failed",
    exitCode: child.status,
    configLoad: load,
  };
}

/** Validate the exact fixed profile delta against the active config stack without writing it. */
export function strictValidateProfileOverlay({
  codexPath,
  codexDigest,
  codexHome,
  spawn = spawnSync,
  timeoutMs = 5000,
} = {}) {
  try {
    const executable = physicalRegularFile(codexPath, "Codex executable");
    const home = physicalDirectory(codexHome, "CODEX_HOME");
    if (sha256(readFileSync(executable.path)) !== codexDigest) return { ok: false, status: "digest-drift", code: "validator-executable-drift" };
    const child = spawn(executable.path, [
      "-c", `permissions.${PROFILE_NAME}.extends=":workspace"`,
      "-c", `permissions.${PROFILE_NAME}.network.enabled=true`,
      "-c", `permissions.${PROFILE_NAME}.network.dangerously_allow_all_unix_sockets=true`,
      "sandbox",
      "--permission-profile", PROFILE_NAME,
      "--cd", home,
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ], {
      env: { PATH: process.env.PATH ?? "", CODEX_HOME: home },
      timeout: timeoutMs,
      encoding: "utf8",
      maxBuffer: VALIDATOR_MAX_BYTES,
      shell: false,
      windowsHide: true,
    });
    if (child?.error?.code === "ETIMEDOUT" || child?.signal) return { ok: false, status: "validation-required", code: "validator-timeout" };
    if (child?.error) return { ok: false, status: "validation-required", code: "validator-spawn-failed" };
    return child.status === 0
      ? { ok: true, status: "validated", code: "validator-profile-overlay-ok" }
      : { ok: false, status: "validation-required", code: "validator-profile-overlay-failed" };
  } catch {
    return { ok: false, status: "validation-required", code: "validator-boundary-invalid" };
  }
}

/** Validate the actually published active config through Codex's strict loader. */
export function strictValidateActiveCodexConfig({
  codexPath,
  codexDigest,
  codexHome,
  expectedConfigSha256 = null,
  spawn = spawnSync,
  timeoutMs = 15_000,
} = {}) {
  let validationHome = null;
  try {
    const executable = physicalRegularFile(codexPath, "Codex executable");
    const home = physicalDirectory(codexHome, "CODEX_HOME");
    const config = physicalRegularFile(join(home, "config.toml"), "active Codex config");
    assertPrivateRegularFile(config.path, "active Codex config");
    if (sha256(readFileSync(executable.path)) !== codexDigest) return { ok: false, status: "digest-drift", code: "validator-executable-drift" };
    const configBytes = readFileSync(config.path, "utf8");
    if (expectedConfigSha256 && sha256(configBytes) !== expectedConfigSha256) {
      return { ok: false, status: "digest-drift", code: "validator-config-drift" };
    }
    validationHome = mkdtempSync(join(tmpdir(), "pipeline-wsl-ipc-validator-"));
    chmodSync(validationHome, 0o700);
    const strict = strictValidateCodexConfig({
      codexPath: executable.path,
      codexDigest,
      configBytes,
      tempHome: validationHome,
      spawn,
      timeoutMs,
    });
    if (!strict.ok) return strict;

    const child = spawn(executable.path, [
      "sandbox",
      "--permission-profile", PROFILE_NAME,
      "--cd", home,
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ], {
      env: { PATH: process.env.PATH ?? "", CODEX_HOME: home },
      timeout: timeoutMs,
      encoding: "utf8",
      maxBuffer: VALIDATOR_MAX_BYTES,
      shell: false,
      windowsHide: true,
      cwd: home,
    });
    if (child?.error?.code === "ETIMEDOUT" || child?.signal) return { ok: false, status: "validation-required", code: "validator-timeout" };
    if (child?.error?.code === "ENOBUFS"
      || Buffer.byteLength(child?.stdout ?? "", "utf8") >= VALIDATOR_MAX_BYTES
      || Buffer.byteLength(child?.stderr ?? "", "utf8") >= VALIDATOR_MAX_BYTES) {
      return { ok: false, status: "validation-required", code: "validator-output-truncated" };
    }
    if (child?.error) return { ok: false, status: "validation-required", code: "validator-spawn-failed" };
    return child.status === 0
      ? { ok: true, status: "validated", code: "validator-active-profile-ok", exitCode: 0 }
      : { ok: false, status: "validation-required", code: "validator-active-profile-failed", exitCode: child.status };
  } catch {
    return { ok: false, status: "validation-required", code: "validator-boundary-invalid" };
  } finally {
    try { if (validationHome) rmSync(validationHome, { recursive: true, force: true }); } catch {}
  }
}

/** Validate exact planned config bytes with Codex's strict loader in a private empty home. */
export function strictValidateProfilePostimage({
  codexPath,
  codexDigest,
  configBytes,
  spawn = spawnSync,
  timeoutMs = 15_000,
} = {}) {
  let validationHome = null;
  try {
    validationHome = mkdtempSync(join(tmpdir(), "pipeline-wsl-ipc-plan-validator-"));
    chmodSync(validationHome, 0o700);
    return strictValidateCodexConfig({
      codexPath,
      codexDigest,
      configBytes,
      tempHome: validationHome,
      spawn,
      timeoutMs,
    });
  } catch {
    return { ok: false, status: "validation-required", code: "validator-boundary-invalid" };
  } finally {
    try { if (validationHome) rmSync(validationHome, { recursive: true, force: true }); } catch {}
  }
}

export async function runFixedIpcProbe({
  scratchRoot = null,
  deadlineMs = 1000,
  canaryPath = null,
  identity = null,
} = {}) {
  const identityKeys = [
    "codexSha256", "configSha256", "filesystemClass", "platform",
    "selectedProfile", "selectedProfileSha256", "sessionSha256",
    "standardProfileSha256", "workspaceClass",
  ];
  const identityValid = identity && typeof identity === "object" && !Array.isArray(identity)
    && Object.keys(identity).sort().join("\0") === identityKeys.sort().join("\0")
    && ["sessionSha256", "codexSha256", "configSha256", "selectedProfileSha256", "standardProfileSha256"].every((key) => SHA256.test(identity[key] ?? ""))
    && [":workspace", PROFILE_NAME].includes(identity.selectedProfile)
    && [identity.workspaceClass, identity.filesystemClass, identity.platform].every((value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value));
  if (!scratchRoot || !canaryPath || !identityValid) return { schema: "pipeline.codex-wsl-ipc-probe.v1", status: "unavailable", reason: "approved-probe-input-required" };
  let dir; let canary;
  try {
    dir = physicalDirectory(scratchRoot, "approved probe scratch");
    const canaryFile = physicalRegularFile(canaryPath, "probe canary");
    if (contained(dir, canaryFile.path)) throw new Error("canary must be outside probe scratch");
    canary = sha256(readFileSync(canaryFile.path));
  } catch {
    return { schema: "pipeline.codex-wsl-ipc-probe.v1", status: "unavailable", reason: "probe-boundary-invalid" };
  }
  const started = performance.now(); const nonce = randomBytes(8).toString("hex");
  const temp = join(dir, `.pipeline-ipc-probe-${nonce}.tmp`); const socket = join(dir, `.pipeline-ipc-probe-${nonce}.sock`);
  if (Buffer.byteLength(socket, "utf8") > 96) return { schema: "pipeline.codex-wsl-ipc-probe.v1", status: "unavailable", reason: "probe-socket-path-too-long" };
  const probeInputSha256 = sha256(canonical({ probeVersion: "1", identity, scratchClass: "approved-workspace-scratch", canary }));
  const result = {
    schema: "pipeline.codex-wsl-ipc-probe.v1",
    probeVersion: "1",
    probeInputSha256,
    identity: structuredClone(identity),
    tempFile: "unavailable",
    afUnix: "unavailable",
    canaryPreSha256: canary,
    canaryPostSha256: null,
    canarySha256: canary,
    cleanup: "passed",
    receipt: null,
  };
  try { writeFileSync(temp, nonce, { flag: "wx", mode: 0o600 }); result.tempFile = "success"; }
  catch { result.tempFile = "failure"; }
  try {
    await new Promise((resolvePromise) => {
      const server = net.createServer(); let settled = false; let timer;
      const done = (status, error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        result.afUnix = status;
        if (error) result.error = { capability: "local-ipc", operation: "listen", syscall: error.syscall || "listen", resourceClass: "af-unix-socket", osCode: error.code || "unknown" };
        try { server.close(); } catch {}
        resolvePromise();
      };
      server.once("error", error => done("denied", error));
      server.listen(socket, () => done("success"));
      timer = setTimeout(() => done("timeout"), Math.max(1, deadlineMs - (performance.now() - started)));
    });
  } catch { result.afUnix = "unavailable"; }
  for (const path of [temp, socket]) { try { if (existsSync(path)) unlinkSync(path); } catch { result.cleanup = "failure"; } }
  try { result.canaryPostSha256 = sha256(readFileSync(physicalRegularFile(canaryPath, "probe canary").path)); }
  catch { result.canaryPostSha256 = null; }
  const withinDeadline = performance.now() - started <= deadlineMs;
  const integrityPassed = result.tempFile === "success" && result.cleanup === "passed"
    && result.canaryPreSha256 === result.canaryPostSha256 && withinDeadline;
  result.status = integrityPassed && result.afUnix === "denied" && result.error?.osCode === "EPERM"
    && ["listen", "bind"].includes(result.error?.syscall)
    ? "confirmed"
    : integrityPassed && result.afUnix === "success"
      ? "compatible"
      : "unavailable";
  result.receipt = {
    schema: "pipeline.codex-wsl-ipc-probe-receipt.v1",
    status: result.status,
    probeVersion: result.probeVersion,
    probeInputSha256,
    identity: structuredClone(identity),
    tempFile: result.tempFile,
    afUnix: result.afUnix,
    error: result.error ?? null,
    canaryPreSha256: result.canaryPreSha256,
    canaryPostSha256: result.canaryPostSha256,
    cleanup: result.cleanup,
    withinDeadline,
  };
  result.receiptSha256 = sha256(canonical(result.receipt));
  return result;
}

export function classifyProbe(trigger, probe, identity = {}) {
  if (!isReactiveIpcTrigger(trigger, identity)) return { state: "standard", cause: null };
  const projected = sanitizeSandboxFailure(trigger);
  const receipt = probe?.receipt;
  const identityMatches = canonical(probe?.identity ?? null) === canonical(identity.probeIdentity ?? null)
    && canonical(receipt?.identity ?? null) === canonical(identity.probeIdentity ?? null);
  const directOperationMatches = projected.failureCode !== "unix_socket_bind_denied"
    || projected.operation === probe?.error?.syscall;
  const confirmed = probe?.status === "confirmed"
    && probe.tempFile === "success"
    && probe.afUnix === "denied"
    && probe.error?.osCode === "EPERM"
    && ["listen", "bind"].includes(probe.error?.syscall)
    && typeof probe.canaryPreSha256 === "string"
    && probe.canaryPreSha256 === probe.canaryPostSha256
    && probe.cleanup === "passed"
    && receipt?.schema === "pipeline.codex-wsl-ipc-probe-receipt.v1"
    && receipt.status === probe.status
    && receipt.probeInputSha256 === probe.probeInputSha256
    && receipt.withinDeadline === true
    && probe.receiptSha256 === sha256(canonical(receipt))
    && identityMatches
    && directOperationMatches;
  if (!confirmed) return { state: "unavailable", cause: null };
  return { state: "confirmed", cause: sanitizeSandboxFailure({ ...trigger, failureCode: "unix_socket_bind_denied", capability: "local-ipc", operation: probe.error.syscall, syscall: probe.error.syscall, resourceClass: "af-unix-socket", osCode: "EPERM", evidenceSource: "fixed-probe", probeVersion: probe.probeVersion, originLayer: "native-standard" }) };
}

export function appendDiagnosticEvent(code, data, { codexHome, sessionDigest, now = Date.now() } = {}) {
  if (!codexHome || !SHA256.test(sessionDigest ?? "") || typeof code !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(code)) return { code: "diagnostic_log_unavailable" };
  const safeData = data && typeof data === "object" ? { failureCode: data.failure?.failureCode, capability: data.failure?.capability, operation: data.failure?.operation, status: data.status, state: data.state } : {};
  try {
    const home = physicalDirectory(codexHome, "CODEX_HOME");
    const dir = ensurePrivateDirectory(join(home, "log", "pipeline-ipc"));
    if (process.platform !== "win32") chmodSync(dir, 0o700);
    const path = join(dir, `${sessionDigest}.jsonl`);
    let lines = [];
    if (existsSync(path)) {
      assertPrivateRegularFile(path, "WSL IPC diagnostic log");
      const raw = readFileSync(path, "utf8");
      lines = raw.split("\n").filter(Boolean);
      if (lines.some(line => {
        try {
          const value = JSON.parse(line);
          return value.schema !== WSL_IPC_SCHEMA || !Number.isSafeInteger(value.atMs)
            || typeof value.code !== "string";
        } catch { return true; }
      })) return { code: "diagnostic_log_unavailable" };
    }
    lines.push(JSON.stringify({ schema: WSL_IPC_SCHEMA, atMs: now, code, ...safeData }));
    lines = lines.slice(-256);
    let bounded = `${lines.join("\n")}\n`;
    while (lines.length > 1 && Buffer.byteLength(bounded) > 1024 * 1024) {
      lines.shift();
      bounded = `${lines.join("\n")}\n`;
    }
    if (Buffer.byteLength(bounded) > 1024 * 1024) return { code: "diagnostic_log_unavailable" };
    const temporary = join(dir, `.${sessionDigest}.${randomBytes(12).toString("hex")}.tmp`);
    writeFileSync(temporary, bounded, { mode: 0o600, flag: "wx" });
    syncFile(temporary);
    renameSync(temporary, path);
    if (process.platform !== "win32") chmodSync(path, 0o600);
    assertPrivateRegularFile(path, "WSL IPC diagnostic log");
    syncDirectory(dir);
    for (const file of readdirSync(dir)) {
      if (!/^[0-9a-f]{64}\.jsonl$/u.test(file) || file === `${sessionDigest}.jsonl`) continue;
      const candidate = join(dir, file);
      try {
        assertPrivateRegularFile(candidate, "WSL IPC retained diagnostic log");
        if (now - statSync(candidate).mtimeMs > 7 * 24 * 60 * 60 * 1000) unlinkSync(candidate);
      } catch { /* never delete an unowned or ambiguous path */ }
    }
    return { code: "ok", digest: sha256(bounded), events: lines.length };
  } catch { return { code: "diagnostic_log_unavailable" }; }
}

const LEGACY_PROFILE_APPEND = `[permissions.${PROFILE_NAME}]
extends = ":workspace"
[permissions.${PROFILE_NAME}.network]
dangerously_allow_all_unix_sockets = true
`;
const PROFILE_APPEND = `[permissions.${PROFILE_NAME}]
extends = ":workspace"
[permissions.${PROFILE_NAME}.network]
enabled = true
dangerously_allow_all_unix_sockets = true
`;
const LEGACY_PROFILE_DEFINITION = Object.freeze({
  name: PROFILE_NAME,
  extends: ":workspace",
  permissions: { dangerously_allow_all_unix_sockets: true },
  dangerousKeys: ["dangerously_allow_all_unix_sockets"],
});
const PROFILE_DEFINITION = Object.freeze({
  name: PROFILE_NAME,
  extends: ":workspace",
  permissions: {
    "network.enabled": true,
    dangerously_allow_all_unix_sockets: true,
  },
  dangerousKeys: ["dangerously_allow_all_unix_sockets"],
});

function profileBlockState(configBytes) {
  const header = new RegExp(`(?:^|\\n)\\[permissions\\.${PROFILE_NAME.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\]`, "gu");
  const count = [...configBytes.matchAll(header)].length;
  if (count === 0) return "absent";
  if (count !== 1) return "ambiguous";
  const trimmed = configBytes.replace(/\s*$/u, "");
  if (trimmed.endsWith(PROFILE_APPEND.replace(/\s*$/u, ""))) return "current";
  if (trimmed.endsWith(LEGACY_PROFILE_APPEND.replace(/\s*$/u, ""))) return "legacy";
  return "ambiguous";
}

function renderProfilePostimage(configBytes, state = profileBlockState(configBytes)) {
  const preserved = configBytes.replace(/\s*$/u, "");
  if (state === "legacy") {
    const legacy = LEGACY_PROFILE_APPEND.replace(/\s*$/u, "");
    return `${preserved.slice(0, -legacy.length)}${PROFILE_APPEND}`;
  }
  const withExplicitDefault = DEFAULT_PERMISSIONS_RE.test(configBytes)
    ? preserved
    : `${EXPLICIT_WORKSPACE_DEFAULT}${preserved}`;
  return `${withExplicitDefault}\n${PROFILE_APPEND}`;
}
function validProbeReceipt(receipt, receiptSha256, { statuses = ["confirmed"] } = {}) {
  return receipt?.schema === "pipeline.codex-wsl-ipc-probe-receipt.v1"
    && statuses.includes(receipt.status)
    && receipt.probeVersion === "1"
    && receipt.tempFile === "success"
    && (receipt.status === "confirmed"
      ? (receipt.afUnix === "denied"
        && receipt.error?.osCode === "EPERM"
        && ["listen", "bind"].includes(receipt.error?.syscall))
      : receipt.status === "compatible"
        ? (receipt.afUnix === "success" && receipt.error === null)
        : false)
    && receipt.cleanup === "passed"
    && receipt.withinDeadline === true
    && receipt.canaryPreSha256 === receipt.canaryPostSha256
    && SHA256.test(receipt.probeInputSha256 ?? "")
    && SHA256.test(receipt.identity?.codexSha256 ?? "")
    && SHA256.test(receipt.identity?.configSha256 ?? "")
    && [":workspace", PROFILE_NAME].includes(receipt.identity?.selectedProfile)
    && SHA256.test(receipt.identity?.selectedProfileSha256 ?? "")
    && SHA256.test(receipt.identity?.standardProfileSha256 ?? "")
    && receiptSha256 === sha256(canonical(receipt));
}

function probeResultValid(probe, status) {
  return probe?.schema === "pipeline.codex-wsl-ipc-probe.v1"
    && probe.status === status
    && probe.receipt?.status === status
    && probe.receiptSha256 === sha256(canonical(probe.receipt))
    && validProbeReceipt(probe.receipt, probe.receiptSha256, { statuses: [status] })
    && probe.tempFile === "success"
    && probe.cleanup === "passed"
    && probe.canaryPreSha256 === probe.canaryPostSha256
    && (status === "confirmed"
      ? probe.afUnix === "denied" && probe.error?.osCode === "EPERM"
      : probe.afUnix === "success");
}

function pairBaseIdentity(identity) {
  if (!identity || typeof identity !== "object") return null;
  const {
    selectedProfile: _selectedProfile,
    selectedProfileSha256: _selectedProfileSha256,
    ...base
  } = identity;
  return base;
}
function pairStableIdentity(identity) {
  const base = pairBaseIdentity(identity);
  if (base === null) return null;
  const { configSha256: _configSha256, ...stable } = base;
  return stable;
}

/** Exact post-install standard/compatibility proof for one candidate and config. */
export function validatePostInstallProbePair({
  standardProbe,
  compatibilityProbe,
  approvalReceipt,
  profileDigest,
} = {}) {
  const standardIdentity = standardProbe?.identity;
  const compatibilityIdentity = compatibilityProbe?.identity;
  const valid = probeResultValid(standardProbe, "confirmed")
    && probeResultValid(compatibilityProbe, "compatible")
    && canonical(standardProbe.receipt?.identity ?? null) === canonical(standardIdentity ?? null)
    && canonical(compatibilityProbe.receipt?.identity ?? null) === canonical(compatibilityIdentity ?? null)
    && standardIdentity?.selectedProfile === ":workspace"
    && standardIdentity?.selectedProfileSha256 === standardIdentity?.standardProfileSha256
    && compatibilityIdentity?.selectedProfile === PROFILE_NAME
    && compatibilityIdentity?.selectedProfileSha256 === profileDigest
    && canonical(pairBaseIdentity(standardIdentity)) === canonical(pairBaseIdentity(compatibilityIdentity))
    && approvalReceipt?.schema === "pipeline.codex-wsl-ipc-approval.v1"
    && approvalReceipt.profileSha256 === profileDigest
    && approvalReceipt.codexSha256 === standardIdentity?.codexSha256
    && approvalReceipt.postimageSha256 === standardIdentity?.configSha256;
  if (!valid) return { ok: false, status: "pair-required" };
  const pair = {
    schema: "pipeline.codex-wsl-ipc-postinstall-pair.v1",
    candidate: pairBaseIdentity(standardIdentity),
    standard: {
      profile: standardIdentity.selectedProfile,
      profileSha256: standardIdentity.selectedProfileSha256,
      receiptSha256: standardProbe.receiptSha256,
      status: standardProbe.status,
    },
    compatibility: {
      profile: compatibilityIdentity.selectedProfile,
      profileSha256: compatibilityIdentity.selectedProfileSha256,
      receiptSha256: compatibilityProbe.receiptSha256,
      status: compatibilityProbe.status,
    },
    approvalPlanSha256: approvalReceipt.planSha256,
  };
  return { ok: true, pair, pairSha256: sha256(canonical(pair)) };
}
function profilePlanFailure(status, codexHome = null, code = status) {
  return { schema: "pipeline.codex-wsl-ipc-profile-plan.v1", status, codexHome, code };
}

function readApprovalReceipt(codexHome) {
  const path = join(codexHome, "pipeline-wsl-ipc-approval.json");
  if (!existsSync(path)) return null;
  assertPrivateRegularFile(path, "WSL IPC approval receipt");
  const bytes = readFileSync(path);
  const value = JSON.parse(bytes.toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("WSL IPC approval receipt is invalid");
  return { path, value, sha256: sha256(bytes) };
}

function legacyApprovalReceiptMatches(value, {
  configSha256,
  codexSha256,
  receiptSha256,
} = {}) {
  return value?.schema === "pipeline.codex-wsl-ipc-approval.v1"
    && SHA256.test(value.planSha256 ?? "")
    && value.postimageSha256 === configSha256
    && value.codexSha256 === codexSha256
    && value.profileSha256 === sha256(canonical(LEGACY_PROFILE_DEFINITION))
    && value.effectiveDefaultPermissionProfile === ":workspace"
    && value.defaultPermissionMaterialized === true
    && canonical(value.dangerousKeys) === canonical(LEGACY_PROFILE_DEFINITION.dangerousKeys)
    && SHA256.test(receiptSha256 ?? "");
}

export function planProfile({
  configBytes,
  configDigest = sha256(configBytes || ""),
  codexHome,
  configPath = null,
  validator = null,
  codexPath = null,
  codexDigest = null,
  probeReceipt = null,
  probeReceiptSha256 = null,
  approvalActor = null,
} = {}) {
  if (typeof configBytes !== "string" || !codexHome || !codexPath
    || typeof approvalActor !== "string" || approvalActor.trim() === "") {
    return profilePlanFailure("validation-required", codexHome, "profile-input-incomplete");
  }
  let home; let config; let executable;
  try {
    home = physicalDirectory(codexHome, "CODEX_HOME");
    config = physicalRegularFile(configPath ?? join(home, "config.toml"), "Codex config");
    executable = physicalRegularFile(codexPath, "Codex executable");
    assertPrivateRegularFile(config.path, "Codex config");
  } catch {
    return profilePlanFailure("validation-required", codexHome, "profile-boundary-invalid");
  }
  if (config.path !== join(home, "config.toml") || !contained(home, config.path)) return profilePlanFailure("validation-required", home, "profile-config-path-invalid");
  const binaryDigest = sha256(readFileSync(executable.path));
  if ((codexDigest && codexDigest !== binaryDigest)
    || sha256(configBytes) !== configDigest
    || sha256(readFileSync(config.path)) !== configDigest) {
    return profilePlanFailure("digest-drift", home, "profile-preimage-drift");
  }
  if (!validProbeReceipt(probeReceipt, probeReceiptSha256)
    || probeReceipt.identity.codexSha256 !== binaryDigest
    || probeReceipt.identity.configSha256 !== configDigest
    || probeReceipt.identity.selectedProfile !== ":workspace"
    || probeReceipt.identity.selectedProfileSha256
      !== probeReceipt.identity.standardProfileSha256) {
    return profilePlanFailure("probe-required", home, "confirmed-probe-binding-required");
  }
  const defaultMatch = configBytes.match(DEFAULT_PERMISSIONS_RE);
  if (defaultMatch?.[1] === PROFILE_NAME
    || /(?:^|\n)\s*(?:sandbox_mode|sandbox_workspace_write)\s*=/u.test(configBytes)) {
    return profilePlanFailure("validation-required", home, "profile-config-ambiguous");
  }
  const blockState = profileBlockState(configBytes);
  if (blockState === "current") return profilePlanFailure("installed", home, "profile-already-present");
  if (blockState === "ambiguous") return profilePlanFailure("validation-required", home, "profile-existing-block-ambiguous");
  let priorApproval = null;
  if (blockState === "legacy") {
    try { priorApproval = readApprovalReceipt(home); }
    catch { return profilePlanFailure("recovery-required", home, "profile-upgrade-receipt-invalid"); }
    if (!priorApproval || !legacyApprovalReceiptMatches(priorApproval.value, {
      configSha256: configDigest,
      codexSha256: binaryDigest,
      receiptSha256: priorApproval.sha256,
    })) {
      return profilePlanFailure("recovery-required", home, "profile-upgrade-receipt-required");
    }
  }
  const operation = blockState === "legacy" ? "upgrade" : "install";
  const postBytes = renderProfilePostimage(configBytes, blockState);
  let checked;
  if (validator) {
    checked = validator(postBytes, { codexHome: home, codexPath: executable.path, codexDigest: binaryDigest });
    if (checked !== true && checked?.ok !== true) return profilePlanFailure("validation-required", home, "profile-validator-rejected");
  } else {
    checked = strictValidateProfileOverlay({ codexPath: executable.path, codexDigest: binaryDigest, codexHome: home });
    if (!checked.ok) return profilePlanFailure(checked.status, home, checked.code);
    const postimage = strictValidateProfilePostimage({
      codexPath: executable.path,
      codexDigest: binaryDigest,
      configBytes: postBytes,
    });
    if (!postimage.ok) return profilePlanFailure(postimage.status, home, postimage.code);
  }
  const defaultPermissionMaterialized = priorApproval?.value.defaultPermissionMaterialized ?? !defaultMatch;
  const effectiveDefaultPermissionProfile = defaultMatch?.[1] ?? ":workspace";
  const ownedKeys = [
    ...(defaultPermissionMaterialized ? ["default_permissions"] : []),
    ...Object.keys(PROFILE_DEFINITION.permissions),
  ];
  const plan = {
    schema: "pipeline.codex-wsl-ipc-profile-plan.v1",
    status: "approval-required",
    operation,
    profileName: PROFILE_NAME,
    approvalActor: approvalActor.trim(),
    codexHome: home,
    configPath: config.path,
    configIdentity: config.identity,
    codexPath: executable.path,
    codexPathClass: "operator-local-physical-codex",
    codexSha256: binaryDigest,
    validator: {
      schema: "pipeline.codex-wsl-ipc-validator.v1",
      preview: [
        "-c", `permissions.${PROFILE_NAME}.extends=":workspace"`,
        "-c", `permissions.${PROFILE_NAME}.network.enabled=true`,
        "-c", `permissions.${PROFILE_NAME}.network.dangerously_allow_all_unix_sockets=true`,
        "sandbox",
        "--permission-profile", PROFILE_NAME,
        "--cd", home,
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ],
      readback: {
        strictConfigBytes: ["--strict-config", "doctor", "--json"],
        strictConfigBoundary: "isolated-private-codex-home",
        activeProfile: [
          "sandbox",
          "--permission-profile", PROFILE_NAME,
          "--cd", home,
          "--",
          process.execPath,
          "-e",
          "process.exit(0)",
        ],
      },
      configLoad: "ok",
      postimageConfigLoad: "ok",
    },
    probeReceiptSha256,
    probeInputSha256: probeReceipt.probeInputSha256,
    preimageSha256: configDigest,
    postimageSha256: sha256(postBytes),
    profileSha256: sha256(canonical(PROFILE_DEFINITION)),
    replacedProfileSha256: operation === "upgrade"
      ? sha256(canonical(LEGACY_PROFILE_DEFINITION))
      : null,
    priorApprovalReceiptSha256: priorApproval?.sha256 ?? null,
    preservedConfigSha256: sha256(configBytes.replace(/\s*$/u, "")),
    ownedAppendSha256: sha256(PROFILE_APPEND),
    ownedDefaultSha256: defaultPermissionMaterialized ? sha256(EXPLICIT_WORKSPACE_DEFAULT) : null,
    defaultPermissionProfile: priorApproval
      ? priorApproval.value.defaultPermissionProfile
      : defaultMatch?.[1] ?? null,
    effectiveDefaultPermissionProfile,
    defaultPermissionMaterialized,
    ownedKeys,
    dangerousKeys: PROFILE_DEFINITION.dangerousKeys,
    dangerousWarning: "broad local Unix-socket/local-daemon exposure risk; exact operator confirmation required",
  };
  return { ...plan, planSha256: sha256(canonical(plan)) };
}

function approvalReceiptMatches(value, plan) {
  return value?.schema === "pipeline.codex-wsl-ipc-approval.v1"
    && value.planSha256 === plan.planSha256
    && value.preimageSha256 === plan.preimageSha256
    && value.postimageSha256 === plan.postimageSha256
    && value.profileSha256 === plan.profileSha256
    && value.probeReceiptSha256 === plan.probeReceiptSha256
    && value.defaultPermissionProfile === plan.defaultPermissionProfile
    && value.effectiveDefaultPermissionProfile === plan.effectiveDefaultPermissionProfile
    && value.defaultPermissionMaterialized === plan.defaultPermissionMaterialized
    && canonical(value.ownedKeys) === canonical(plan.ownedKeys)
    && canonical(value.dangerousKeys) === canonical(plan.dangerousKeys)
    && value.supersedesApprovalReceiptSha256 === plan.priorApprovalReceiptSha256;
}

export function applyProfile(plan, {
  configBytes,
  planSha256,
  confirmed = false,
  write = false,
  actor = null,
  validator = null,
  probeReceipt = null,
  probeReceiptSha256 = null,
  now = () => new Date().toISOString(),
  io = {},
} = {}) {
  const schema = "pipeline.codex-wsl-ipc-profile-apply.v1";
  if (!confirmed || !write || typeof actor !== "string" || actor.trim() === "") return { schema, status: "approval-required" };
  if (!plan || plan.status !== "approval-required" || plan.planSha256 !== planSha256
    || !validProbeReceipt(probeReceipt, probeReceiptSha256)
    || probeReceiptSha256 !== plan.probeReceiptSha256
    || actor.trim() !== plan.approvalActor) return { schema, status: "digest-drift" };
  let current; let executable;
  try {
    current = physicalRegularFile(plan.configPath, "Codex config");
    executable = physicalRegularFile(plan.codexPath, "Codex executable");
    assertPrivateRegularFile(current.path, "Codex config");
  } catch { return { schema, status: "digest-drift" }; }
  const receiptPath = join(plan.codexHome, "pipeline-wsl-ipc-approval.json");
  const writeFile = io.writeFileSync ?? writeFileSync;
  const move = io.renameSync ?? renameSync;
  const syncWrittenFile = io.syncFile ?? syncFile;
  const syncWrittenDirectory = io.syncDirectory ?? syncDirectory;
  let priorReceiptBytes = null;
  let priorReceiptIdentity = null;
  let priorReceiptAccepted = false;
  if (existsSync(receiptPath)) {
    try {
      assertPrivateRegularFile(receiptPath, "WSL IPC approval receipt");
      priorReceiptBytes = readFileSync(receiptPath);
      priorReceiptIdentity = physicalRegularFile(receiptPath, "WSL IPC approval receipt").identity;
      const prior = JSON.parse(priorReceiptBytes.toString("utf8"));
      if (sha256(readFileSync(plan.configPath)) === plan.postimageSha256
        && sha256(readFileSync(executable.path)) === plan.codexSha256
        && approvalReceiptMatches(prior, plan)) {
        return {
          schema,
          status: "applied",
          replay: true,
          profileName: plan.profileName,
          postimageSha256: plan.postimageSha256,
          defaultUnchanged: true,
          effectiveDefaultPermissionProfile: plan.effectiveDefaultPermissionProfile,
          readback: true,
          approvalReceipt: prior,
        };
      }
      if (plan.operation !== "upgrade"
        || sha256(priorReceiptBytes) !== plan.priorApprovalReceiptSha256
        || !legacyApprovalReceiptMatches(prior, {
          configSha256: plan.preimageSha256,
          codexSha256: plan.codexSha256,
          receiptSha256: plan.priorApprovalReceiptSha256,
        })) {
        return { schema, status: "recovery-required" };
      }
      priorReceiptAccepted = true;
    } catch { /* closed failure below */ }
    if (!priorReceiptAccepted || !priorReceiptBytes || !priorReceiptIdentity) return { schema, status: "recovery-required" };
  }
  if (plan.operation === "upgrade" && (!priorReceiptBytes || !priorReceiptIdentity)) return { schema, status: "recovery-required" };
  if (resolve(plan.codexHome) !== dirname(current.path)
    || !sameFileIdentity(current.path, plan.configIdentity)
    || sha256(readFileSync(current.path)) !== plan.preimageSha256
    || sha256(configBytes ?? "") !== plan.preimageSha256
    || sha256(readFileSync(executable.path)) !== plan.codexSha256) {
    return { schema, status: "digest-drift" };
  }
  const postBytes = renderProfilePostimage(configBytes, plan.operation === "upgrade" ? "legacy" : "absent");
  if (sha256(postBytes) !== plan.postimageSha256) return { schema, status: "digest-drift" };
  let checked;
  if (validator) {
    checked = validator(postBytes, plan);
    if (checked !== true && checked?.ok !== true) return { schema, status: "validation-required" };
  } else {
    checked = strictValidateProfileOverlay({ codexPath: plan.codexPath, codexDigest: plan.codexSha256, codexHome: plan.codexHome });
    if (!checked.ok) return { schema, status: checked.status, code: checked.code };
  }
  const approvalReceipt = {
    schema: "pipeline.codex-wsl-ipc-approval.v1",
    actor: actor.trim(),
    approvedAt: now(),
    planSha256,
    probeReceiptSha256,
    probeInputSha256: plan.probeInputSha256,
    codexSha256: plan.codexSha256,
    preimageSha256: plan.preimageSha256,
    postimageSha256: plan.postimageSha256,
    profileSha256: plan.profileSha256,
    defaultPermissionProfile: plan.defaultPermissionProfile,
    effectiveDefaultPermissionProfile: plan.effectiveDefaultPermissionProfile,
    defaultPermissionMaterialized: plan.defaultPermissionMaterialized,
    ownedKeys: plan.ownedKeys,
    dangerousKeys: plan.dangerousKeys,
    supersedesApprovalReceiptSha256: plan.priorApprovalReceiptSha256,
  };
  const configTemporary = join(plan.codexHome, `.pipeline-wsl-ipc-config-${randomBytes(12).toString("hex")}.tmp`);
  const receiptTemporary = join(plan.codexHome, `.pipeline-wsl-ipc-receipt-${randomBytes(12).toString("hex")}.tmp`);
  let configPublished = false; let receiptPublished = false; let publishedIdentity = null;
  try {
    writeFile(configTemporary, postBytes, { mode: 0o600, flag: "wx" });
    syncWrittenFile(configTemporary);
    const temporaryIdentity = physicalRegularFile(configTemporary, "profile config temporary").identity;
    writeFile(receiptTemporary, canonical(approvalReceipt), { mode: 0o600, flag: "wx" });
    syncWrittenFile(receiptTemporary);
    if (!sameFileIdentity(plan.configPath, plan.configIdentity)
      || sha256(readFileSync(plan.configPath)) !== plan.preimageSha256) throw new Error("config preimage drift");
    if (plan.operation === "upgrade"
      && (!sameFileIdentity(receiptPath, priorReceiptIdentity)
        || sha256(readFileSync(receiptPath)) !== plan.priorApprovalReceiptSha256)) {
      throw new Error("approval receipt preimage drift");
    }
    move(configTemporary, plan.configPath);
    configPublished = true;
    publishedIdentity = temporaryIdentity;
    if (!sameFileIdentity(plan.configPath, publishedIdentity)
      || sha256(readFileSync(plan.configPath)) !== plan.postimageSha256) throw new Error("config readback drift");
    if (!validator) {
      const activeValidation = strictValidateActiveCodexConfig({
        codexPath: plan.codexPath,
        codexDigest: plan.codexSha256,
        codexHome: plan.codexHome,
        expectedConfigSha256: plan.postimageSha256,
      });
      if (!activeValidation.ok) throw new Error(`active config validation failed (${activeValidation.code})`);
    }
    if (plan.operation === "upgrade"
      && (!sameFileIdentity(receiptPath, priorReceiptIdentity)
        || sha256(readFileSync(receiptPath)) !== plan.priorApprovalReceiptSha256)) {
      throw new Error("approval receipt publication race");
    }
    move(receiptTemporary, receiptPath);
    receiptPublished = true;
    assertPrivateRegularFile(receiptPath, "WSL IPC approval receipt");
    if (sha256(readFileSync(receiptPath)) !== sha256(canonical(approvalReceipt))) throw new Error("receipt readback drift");
    syncWrittenDirectory(plan.codexHome);
  } catch {
    let restored = !configPublished;
    try {
      if (receiptPublished && existsSync(receiptPath)) {
        if (priorReceiptBytes) {
          const receiptRollback = join(plan.codexHome, `.pipeline-wsl-ipc-receipt-rollback-${randomBytes(12).toString("hex")}.tmp`);
          writeFile(receiptRollback, priorReceiptBytes, { mode: 0o600, flag: "wx" });
          syncWrittenFile(receiptRollback);
          move(receiptRollback, receiptPath);
        } else {
          unlinkSync(receiptPath);
        }
      }
      if (configPublished && publishedIdentity && sameFileIdentity(plan.configPath, publishedIdentity)) {
        const rollback = join(plan.codexHome, `.pipeline-wsl-ipc-rollback-${randomBytes(12).toString("hex")}.tmp`);
        writeFile(rollback, configBytes, { mode: 0o600, flag: "wx" });
        syncWrittenFile(rollback);
        move(rollback, plan.configPath);
        syncWrittenDirectory(plan.codexHome);
        restored = sha256(readFileSync(plan.configPath)) === plan.preimageSha256;
      }
    } catch { restored = false; }
    for (const temporary of [configTemporary, receiptTemporary]) {
      try { if (existsSync(temporary)) unlinkSync(temporary); } catch {}
    }
    return { schema, status: restored ? "rolled-back" : "recovery-required", rollback: restored ? "restored-preimage" : "indeterminate" };
  }
  return {
    schema,
    status: "applied",
    replay: false,
    profileName: plan.profileName,
    postimageSha256: plan.postimageSha256,
    defaultUnchanged: true,
    effectiveDefaultPermissionProfile: plan.effectiveDefaultPermissionProfile,
    readback: true,
    approvalReceipt,
  };
}

export class WslIpcCompatibilityController {
  constructor({ sessionId = randomBytes(8).toString("hex"), codexHome = null, identity = {} } = {}) {
    this.sessionId = sessionId;
    this.codexHome = codexHome;
    this.identity = structuredClone(identity);
    this.state = "standard";
    this.active = false;
    this.profileDigest = null;
    this.approvalDigest = null;
    this.cause = null;
    this.log = null;
    this.probe = null;
    this.retryEligible = false;
    this.retryConsumed = false;
    this.verifierInvocations = 0;
    this.postInstallPairDigest = null;
  }
  record(code, data = {}) {
    const logged = appendDiagnosticEvent(code, data, {
      codexHome: this.codexHome,
      sessionDigest: sha256(this.sessionId),
    });
    if (logged.code === "ok") this.log = logged.digest;
    return logged.code;
  }
  observe(operationClass, failure, {
    operationReadOnly = false,
    deterministic = false,
    partialEffect = "unknown",
    operationCapability = null,
    baselineProfile = "standard-workspace",
    workspaceRootsSha256 = null,
  } = {}) {
    const eligible = ELIGIBLE_CLASSES.includes(operationClass)
      && baselineProfile === "standard-workspace"
      && (this.identity.workspaceRootsSha256 === undefined
        || this.identity.workspaceRootsSha256 === workspaceRootsSha256);
    if (!eligible || this.state !== "standard") return this.result(operationClass, failure);
    if (failure?.session !== this.sessionId || !isReactiveIpcTrigger(failure, {
      currentSession: this.sessionId,
      session: failure.session,
      operationCapability,
    })) return this.result(operationClass, failure);
    this.state = "probe-required";
    this.cause = sanitizeSandboxFailure(failure);
    this.retryEligible = operationReadOnly && deterministic
      && partialEffect === "none-observed-and-proven";
    this.record("original-failure", { failure: this.cause, state: this.state });
    return this.result(operationClass, failure, { retry: false });
  }
  confirm(probe, identity = {}) {
    if (this.state !== "probe-required" || this.verifierInvocations !== 0) return this.result(null, this.cause);
    this.verifierInvocations += 1;
    this.record("probe-start", { state: this.state });
    const classified = classifyProbe(this.cause, probe, identity);
    this.probe = probe;
    this.state = classified.state;
    if (classified.cause) this.cause = classified.cause;
    this.record("probe-result", { status: probe?.status, state: this.state, failure: this.cause });
    return this.result(null, this.cause);
  }
  requireApproval() {
    if (this.state === "confirmed") this.state = "approval-required";
    this.record("remediation-decision", { state: this.state });
    return this.result();
  }
  activate({
    profileDigest,
    approvalReceipt,
    approvalDigest,
    standardProbe,
    fallbackProbe,
    operationClass,
    triggerDigest = null,
    projectDigest = null,
  } = {}) {
    const bound = this.identity || {};
    const approvalValid = approvalReceipt?.schema === "pipeline.codex-wsl-ipc-approval.v1"
      && approvalReceipt.profileSha256 === profileDigest
      && approvalReceipt.probeReceiptSha256 === this.probe?.receiptSha256
      && approvalDigest === sha256(canonical(approvalReceipt));
    const pair = validatePostInstallProbePair({
      standardProbe,
      compatibilityProbe: fallbackProbe,
      approvalReceipt,
      profileDigest,
    });
    const originalBase = pairStableIdentity(bound.probeIdentity);
    const postBase = pairStableIdentity(standardProbe?.identity);
    const baseBindingValid = originalBase !== null && postBase !== null
      && canonical(originalBase) === canonical(postBase);
    if (!ELIGIBLE_CLASSES.includes(operationClass)
      || !approvalValid || !pair.ok || !baseBindingValid
      || !["confirmed", "approval-required", "installed", "validation-required"].includes(this.state)
      || (bound.approvedProfileDigest && bound.approvedProfileDigest !== profileDigest)
      || (bound.sessionId && bound.sessionId !== this.sessionId)
      || (bound.triggerDigest && bound.triggerDigest !== triggerDigest)
      || (bound.codexSha256 && bound.codexSha256 !== approvalReceipt?.codexSha256 && approvalReceipt?.codexSha256 !== undefined)
      || (bound.configSha256 && bound.configSha256 !== approvalReceipt?.preimageSha256)) {
      return this.result(operationClass, this.cause, { retry: false });
    }
    this.profileDigest = profileDigest;
    this.approvalDigest = approvalDigest;
    this.triggerDigest = triggerDigest;
    this.projectDigest = projectDigest;
    this.postInstallPairDigest = pair.pairSha256;
    this.codexDigest = bound.codexSha256;
    this.configDigest = approvalReceipt.postimageSha256;
    this.probeVersion = this.probe?.probeVersion;
    this.active = true;
    this.state = "session-fallback-active";
    this.record("activation", { state: this.state });
    const retry = this.retryEligible && !this.retryConsumed;
    if (retry) this.retryConsumed = true;
    return this.result(operationClass, this.cause, { retry });
  }
  resetSession(sessionId = randomBytes(8).toString("hex")) {
    this.sessionId = sessionId;
    this.state = "standard";
    this.active = false;
    this.profileDigest = null;
    this.approvalDigest = null;
    this.cause = null;
    this.probe = null;
    this.retryEligible = false;
    this.retryConsumed = false;
    this.verifierInvocations = 0;
    this.postInstallPairDigest = null;
    return this.result();
  }
  retireIfDrifted({ codexDigest, configDigest, probeVersion } = {}) {
    if (this.active && (codexDigest !== this.codexDigest || configDigest !== this.configDigest || probeVersion !== this.probeVersion)) {
      this.active = false;
      this.state = "not-required";
      this.record("retirement", { state: this.state });
      return true;
    }
    this.codexDigest = codexDigest;
    this.configDigest = configDigest;
    this.probeVersion = probeVersion;
    return false;
  }
  result(operationClass = null, failure = null, extra = {}) {
    const eligible = ELIGIBLE_CLASSES.includes(operationClass);
    return {
      schema: WSL_IPC_SCHEMA,
      state: this.state,
      session: this.sessionId,
      identity: this.identity,
      trigger: this.cause ? sanitizeSandboxFailure(this.cause) : null,
      failure: failure ? sanitizeSandboxFailure(failure) : null,
      probe: this.probe ? {
        status: this.probe.status,
        probeVersion: this.probe.probeVersion,
        probeInputSha256: this.probe.probeInputSha256,
        receiptSha256: this.probe.receiptSha256,
        tempFile: this.probe.tempFile,
        afUnix: this.probe.afUnix,
        canarySha256: this.probe.canarySha256,
        cleanup: this.probe.cleanup,
      } : null,
      codex: this.identity.codex || null,
      platform: this.identity.platform || null,
      standardProfileDigest: this.identity.standardProfileDigest || null,
      configDigest: this.identity.configDigest || null,
      profileName: this.active && eligible ? PROFILE_NAME : null,
      installedProfileDigest: this.active && eligible ? this.profileDigest : null,
      approvalReceiptDigest: this.active && eligible ? this.approvalDigest : null,
      postInstallPairDigest: this.active && eligible ? this.postInstallPairDigest : null,
      logDigest: this.log,
      projectDigest: this.projectDigest || null,
      triggerDigest: this.triggerDigest || null,
      activation: this.active && eligible ? "active" : "inactive",
      operationClass,
      verifierInvocations: this.verifierInvocations,
      nextAction: this.state === "probe-required"
        ? "run-fixed-probe"
        : this.state === "confirmed" || this.state === "approval-required"
          ? "plan-profile"
          : null,
      ...extra,
    };
  }
}
