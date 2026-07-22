// SPDX-License-Identifier: Apache-2.0

/**
 * HAW-B's durable, repository-scoped session-power record boundary.
 *
 * This module intentionally has no process-starting code.  It owns only the
 * private record, lock, exact state shapes and the endpoint-gated recovery /
 * stop transitions.  The starter/controller are separate callers so a parser,
 * a malformed record, or a recovery attempt can never turn into a broad PID
 * action.  In particular this module never sends a signal to a recorded PID.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { derivePoGateRepositoryFingerprint } from "./po-gate-authority.mjs";
import { discoverRepository, loadSessionDescriptor } from "./worktree-lifecycle.mjs";
import {
  PrivateBoundaryError,
  assertPrivateRegularFile,
  ensurePrivateDirectory,
  readPrivateJson,
  writePrivateJsonAtomic,
} from "./private-boundary.mjs";

export const SESSION_POWER_RECORD_SCHEMA = "pipeline.session-power-record.v1";
export const SESSION_POWER_COMMAND_RESULT_SCHEMA = "pipeline.session-power-command-result.v1";
export const SESSION_POWER_LEASE_SECONDS = 43_200;
export const SESSION_POWER_HEARTBEAT_SECONDS = 30;
export const SESSION_POWER_FRESHNESS_SECONDS = 90;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const NONCE = /^[a-f0-9]{64}$/u;
const HANDLE = /^[A-Za-z0-9._:-]{16,160}$/u;
const STATUSES = new Set(["disabled", "unavailable", "starting", "active", "cleanup-pending", "stopped"]);
const UNAVAILABLE_FAILURES = new Set(["platform-unsupported", "tool-missing", "startup-failed"]);
const CLEANUP_FAILURES = new Set(["identity-mismatch", "record-corrupt", "lease-ambiguous", "stop-timeout"]);
const ALL_FAILURES = new Set([...UNAVAILABLE_FAILURES, ...CLEANUP_FAILURES]);
const RECORD_KEYS = new Set([
  "schema", "revision", "repoFingerprint", "sessionId", "descriptorSha256",
  "activationNonce", "adapterId", "platform", "hostBootId", "controllerPid",
  "controllerStart", "controllerExecutableSha256", "childPid", "childStart",
  "childExecutableSha256", "handleId", "status", "startedAt", "heartbeatAt",
  "leaseExpiresAt", "stoppedAt", "failureClass", "observedAt",
]);

export class SessionPowerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SessionPowerError";
    this.code = code;
  }
}

function fail(code, message) { throw new SessionPowerError(code, message); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, expected) {
  return isObject(value) && Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key));
}
function safeInt(value, min = 0) { return Number.isSafeInteger(value) && value >= min; }
function digest(value, nullable = false) { return (nullable && value === null) || (typeof value === "string" && SHA256.test(value)); }
function timestamp(value, nullable = false) {
  return (nullable && value === null) || (typeof value === "string" && ISO.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
}
function pid(value, nullable = false) { return (nullable && value === null) || safeInt(value, 1); }
function closedString(value, nullable = false, max = 300) {
  return (nullable && value === null) || (typeof value === "string" && value.length > 0 && value.length <= max && !/[\0\r\n]/u.test(value));
}
function iso(now = new Date()) { return new Date(now).toISOString(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sameBytes(left, right) {
  return Buffer.byteLength(left) === Buffer.byteLength(right)
    && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function completeTuple(record) {
  return NONCE.test(record.activationNonce ?? "")
    && closedString(record.adapterId)
    && closedString(record.platform)
    && closedString(record.hostBootId)
    && pid(record.controllerPid)
    && closedString(record.controllerStart)
    && digest(record.controllerExecutableSha256)
    && pid(record.childPid)
    && closedString(record.childStart)
    && digest(record.childExecutableSha256)
    && typeof record.handleId === "string" && HANDLE.test(record.handleId)
    && timestamp(record.startedAt)
    && timestamp(record.leaseExpiresAt);
}

function expectedLease(startedAt) {
  const start = Date.parse(startedAt);
  return Number.isFinite(start) ? new Date(start + SESSION_POWER_LEASE_SECONDS * 1000).toISOString() : null;
}

function validTupleOrNull(record) {
  const tupleKeys = [
    "activationNonce", "adapterId", "platform", "hostBootId", "controllerPid",
    "controllerStart", "controllerExecutableSha256", "childPid", "childStart",
    "childExecutableSha256", "handleId", "startedAt", "leaseExpiresAt",
  ];
  const present = tupleKeys.filter((key) => record[key] !== null);
  return present.length === 0 || (present.length === tupleKeys.length && completeTuple(record));
}

/** Validate a closed v1 record.  It returns a code rather than leaking JSON errors. */
export function validateSessionPowerRecord(record, { now = null, requireFresh = false } = {}) {
  if (!exactKeys(record, RECORD_KEYS)
    || record.schema !== SESSION_POWER_RECORD_SCHEMA
    || !safeInt(record.revision)
    || !digest(record.repoFingerprint)
    || typeof record.sessionId !== "string" || !SAFE_ID.test(record.sessionId)
    || !digest(record.descriptorSha256)
    || !STATUSES.has(record.status)
    || !timestamp(record.observedAt)) return { ok: false, code: "record-corrupt" };

  if (!(record.activationNonce === null || NONCE.test(record.activationNonce))
    || !closedString(record.adapterId, true)
    || !closedString(record.platform, true)
    || !closedString(record.hostBootId, true)
    || !pid(record.controllerPid, true)
    || !closedString(record.controllerStart, true)
    || !digest(record.controllerExecutableSha256, true)
    || !pid(record.childPid, true)
    || !closedString(record.childStart, true)
    || !digest(record.childExecutableSha256, true)
    || !(record.handleId === null || (typeof record.handleId === "string" && HANDLE.test(record.handleId)))
    || !timestamp(record.startedAt, true)
    || !timestamp(record.heartbeatAt, true)
    || !timestamp(record.leaseExpiresAt, true)
    || !timestamp(record.stoppedAt, true)
    || !(record.failureClass === null || ALL_FAILURES.has(record.failureClass))) return { ok: false, code: "record-corrupt" };
  if (record.startedAt !== null && record.leaseExpiresAt !== expectedLease(record.startedAt)) return { ok: false, code: "record-corrupt" };
  if (record.heartbeatAt !== null && Date.parse(record.heartbeatAt) > Date.parse(record.leaseExpiresAt)) return { ok: false, code: "lease-ambiguous" };

  if (record.status === "disabled") {
    const nullable = ["activationNonce", "adapterId", "platform", "hostBootId", "controllerPid", "controllerStart", "controllerExecutableSha256", "childPid", "childStart", "childExecutableSha256", "handleId", "startedAt", "heartbeatAt", "leaseExpiresAt", "stoppedAt", "failureClass"];
    if (nullable.some((key) => record[key] !== null)) return { ok: false, code: "record-corrupt" };
  } else if (record.status === "unavailable") {
    if (record.controllerPid !== null || record.controllerStart !== null || record.controllerExecutableSha256 !== null
      || record.childPid !== null || record.childStart !== null || record.childExecutableSha256 !== null
      || record.handleId !== null || record.startedAt !== null || record.heartbeatAt !== null
      || record.leaseExpiresAt !== null || record.stoppedAt !== null || !UNAVAILABLE_FAILURES.has(record.failureClass)) return { ok: false, code: "record-corrupt" };
    for (const key of ["activationNonce", "adapterId", "platform", "hostBootId"]) {
      if (record[key] !== null && !closedString(record[key])) return { ok: false, code: "record-corrupt" };
    }
  } else if (record.status === "starting") {
    if (!completeTuple(record) || record.heartbeatAt !== null || record.stoppedAt !== null || record.failureClass !== null) return { ok: false, code: "record-corrupt" };
  } else if (record.status === "active") {
    if (!completeTuple(record) || !timestamp(record.heartbeatAt) || record.stoppedAt !== null || record.failureClass !== null) return { ok: false, code: "record-corrupt" };
  } else if (record.status === "cleanup-pending") {
    if (!validTupleOrNull(record) || record.stoppedAt !== null || !CLEANUP_FAILURES.has(record.failureClass)) return { ok: false, code: "record-corrupt" };
  } else if (record.status === "stopped") {
    if (!completeTuple(record) || record.heartbeatAt !== null || !timestamp(record.stoppedAt) || record.failureClass !== null) return { ok: false, code: "record-corrupt" };
  }

  if (requireFresh && record.status === "active") {
    const observer = now instanceof Date ? now.getTime() : Date.parse(now ?? iso());
    const start = Date.parse(record.startedAt);
    const heartbeat = Date.parse(record.heartbeatAt);
    const lease = Date.parse(record.leaseExpiresAt);
    if (!(start <= heartbeat && heartbeat <= observer + 5_000 && observer < lease && observer - heartbeat >= -5_000 && observer - heartbeat <= SESSION_POWER_FRESHNESS_SECONDS * 1_000)) {
      return { ok: false, code: "lease-ambiguous" };
    }
  }
  return { ok: true, code: null };
}

function baseRecord({ repoFingerprint, sessionId, descriptorSha256, status, now }) {
  return {
    schema: SESSION_POWER_RECORD_SCHEMA,
    revision: 0,
    repoFingerprint,
    sessionId,
    descriptorSha256,
    activationNonce: null,
    adapterId: null,
    platform: null,
    hostBootId: null,
    controllerPid: null,
    controllerStart: null,
    controllerExecutableSha256: null,
    childPid: null,
    childStart: null,
    childExecutableSha256: null,
    handleId: null,
    status,
    startedAt: null,
    heartbeatAt: null,
    leaseExpiresAt: null,
    stoppedAt: null,
    failureClass: null,
    observedAt: iso(now),
  };
}

export function createDisabledSessionPowerRecord(context, now = new Date()) {
  return baseRecord({ ...context, status: "disabled", now });
}

export function createUnavailableSessionPowerRecord(context, failureClass, { observed = {}, now = new Date() } = {}) {
  if (!UNAVAILABLE_FAILURES.has(failureClass)) fail("SP-FAILURE", "unavailable failure class is invalid");
  const record = baseRecord({ ...context, status: "unavailable", now });
  for (const key of ["activationNonce", "adapterId", "platform", "hostBootId"]) {
    if (observed[key] !== undefined && observed[key] !== null) record[key] = observed[key];
  }
  record.failureClass = failureClass;
  const valid = validateSessionPowerRecord(record);
  if (!valid.ok) fail("SP-RECORD", "unavailable record is invalid");
  return record;
}

export function createStartingSessionPowerRecord(context, tuple, now = new Date()) {
  const record = { ...baseRecord({ ...context, status: "starting", now }), ...clone(tuple) };
  record.status = "starting";
  record.heartbeatAt = null;
  record.stoppedAt = null;
  record.failureClass = null;
  record.leaseExpiresAt = expectedLease(record.startedAt);
  record.observedAt = iso(now);
  const valid = validateSessionPowerRecord(record);
  if (!valid.ok) fail("SP-RECORD", `starting record is invalid: ${valid.code}`);
  return record;
}

export function activateSessionPowerRecord(record, { expectedRevision, now = new Date() } = {}) {
  const valid = validateSessionPowerRecord(record);
  if (!valid.ok || record.status !== "starting" || expectedRevision !== record.revision) fail("SP-CAS", "only the exact starting record may activate");
  const next = { ...clone(record), revision: record.revision + 1, status: "active", heartbeatAt: iso(now), observedAt: iso(now) };
  const checked = validateSessionPowerRecord(next);
  if (!checked.ok) fail("SP-RECORD", `active record is invalid: ${checked.code}`);
  return next;
}

/** The sole legal heartbeat mutation: revision, heartbeatAt and observedAt. */
export function heartbeatSessionPowerRecord(record, { expectedRevision, now = new Date() } = {}) {
  const valid = validateSessionPowerRecord(record);
  if (!valid.ok || record.status !== "active" || record.revision !== expectedRevision) fail("SP-CAS", "heartbeat requires the current active record");
  const instant = iso(now);
  const next = { ...clone(record), revision: record.revision + 1, heartbeatAt: instant, observedAt: instant };
  const changed = Object.keys(next).filter((key) => JSON.stringify(next[key]) !== JSON.stringify(record[key]));
  if (changed.some((key) => !["revision", "heartbeatAt", "observedAt"].includes(key))) fail("SP-HEARTBEAT", "heartbeat changed protected record bytes");
  const checked = validateSessionPowerRecord(next);
  if (!checked.ok) fail("SP-RECORD", `heartbeat record is invalid: ${checked.code}`);
  return next;
}

function endpointTuple(record) {
  return {
    activationNonce: record.activationNonce,
    controllerPid: record.controllerPid,
    controllerStart: record.controllerStart,
    controllerExecutableSha256: record.controllerExecutableSha256,
    childPid: record.childPid,
    childStart: record.childStart,
    childExecutableSha256: record.childExecutableSha256,
    handleId: record.handleId,
  };
}

function endpointMatches(record, proof) {
  if (!isObject(proof)) return false;
  return Object.entries(endpointTuple(record)).every(([key, value]) => proof[key] === value);
}

export function recoverSessionPowerRecord(record, { now = new Date(), endpointProof = null } = {}) {
  const valid = validateSessionPowerRecord(record, { now, requireFresh: record.status === "active" });
  if (!valid.ok) return cleanupPendingRecord(record, valid.code, now);
  if (!new Set(["starting", "active"]).has(record.status)) return clone(record);
  if (Date.parse(record.leaseExpiresAt) <= new Date(now).getTime()) return stoppedRecord(record, now);
  if (!endpointMatches(record, endpointProof)) return cleanupPendingRecord(record, "identity-mismatch", now);
  if (record.status === "starting") return activateSessionPowerRecord(record, { expectedRevision: record.revision, now });
  return clone(record);
}

function cleanupPendingRecord(record, failureClass, now) {
  const context = { repoFingerprint: record.repoFingerprint, sessionId: record.sessionId, descriptorSha256: record.descriptorSha256 };
  const base = validTupleOrNull(record) ? clone(record) : baseRecord({ ...context, status: "cleanup-pending", now });
  const next = { ...base, revision: safeInt(base.revision) ? base.revision + 1 : 0, status: "cleanup-pending", stoppedAt: null, failureClass, observedAt: iso(now) };
  for (const key of RECORD_KEYS) if (!(key in next)) next[key] = null;
  return next;
}

function stoppedRecord(record, now) {
  const next = { ...clone(record), revision: record.revision + 1, status: "stopped", heartbeatAt: null, stoppedAt: iso(now), failureClass: null, observedAt: iso(now) };
  const valid = validateSessionPowerRecord(next);
  if (!valid.ok) fail("SP-RECORD", `stopped record is invalid: ${valid.code}`);
  return next;
}

/**
 * Stop is endpoint-only.  A false/missing proof becomes cleanup-pending; this
 * code deliberately has no kill(), pkill(), process-name lookup, or PID scan.
 */
export function stopSessionPowerRecord(record, { now = new Date(), endpointProof = null } = {}) {
  const valid = validateSessionPowerRecord(record);
  if (!valid.ok) return cleanupPendingRecord(record, valid.code, now);
  if (new Set(["disabled", "unavailable", "stopped", "cleanup-pending"]).has(record.status)) return clone(record);
  return endpointMatches(record, endpointProof)
    ? stoppedRecord(record, now)
    : cleanupPendingRecord(record, "stop-timeout", now);
}

function hash(value) { return createHash("sha256").update(value).digest("hex"); }

export function resolveSessionPowerPaths(repoRoot, sessionId, options = {}) {
  if (typeof sessionId !== "string" || !SAFE_ID.test(sessionId)) fail("SP-SESSION", "session ID is invalid");
  const repo = discoverRepository(repoRoot, options);
  const repoFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repo.commonDir, primaryRoot: repo.primaryRoot });
  const directory = join(repo.commonDir, "agent-pipeline", "session-power", repoFingerprint);
  return {
    repo,
    sessionId,
    repoFingerprint,
    directory,
    recordPath: join(directory, `${sessionId}.json`),
    lockPath: join(directory, `${sessionId}.json.lock`),
    // POSIX control endpoint is adjacent to the record.  The controller owns it.
    controlPath: join(directory, `${sessionId}.json.sock`),
  };
}

export function resolveSessionPowerContext(repoRoot, sessionId, expectedDescriptorSha256, options = {}) {
  if (!digest(expectedDescriptorSha256)) fail("SP-DESCRIPTOR", "expected descriptor digest is invalid");
  const paths = resolveSessionPowerPaths(repoRoot, sessionId, options);
  const descriptor = loadSessionDescriptor(paths.repo.primaryRoot, sessionId, { expectedDescriptorSha256 });
  if (!sameBytes(descriptor.descriptorSha256, expectedDescriptorSha256)) fail("SP-DESCRIPTOR", "descriptor digest changed during load");
  return { ...paths, descriptorSha256: descriptor.descriptorSha256 };
}

export function readSessionPowerRecord(context) {
  if (!existsSync(context.recordPath)) return null;
  let record;
  try {
    record = readPrivateJson(context.recordPath, "session-power record");
  } catch (error) {
    if (error instanceof PrivateBoundaryError) fail("SP-RECORD", error.message);
    throw error;
  }
  const valid = validateSessionPowerRecord(record);
  if (!valid.ok || record.repoFingerprint !== context.repoFingerprint || record.sessionId !== context.sessionId || record.descriptorSha256 !== context.descriptorSha256) {
    fail("SP-RECORD", "session-power record is corrupt or bound to a different session");
  }
  return record;
}

export function writeSessionPowerRecord(context, record) {
  const valid = validateSessionPowerRecord(record);
  if (!valid.ok || record.repoFingerprint !== context.repoFingerprint || record.sessionId !== context.sessionId || record.descriptorSha256 !== context.descriptorSha256) {
    fail("SP-RECORD", "refusing to write an invalid or unbound session-power record");
  }
  ensurePrivateDirectory(context.directory);
  writePrivateJsonAtomic(context.recordPath, record);
  return clone(record);
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** A bounded adjacent lock.  It never guesses ownership from a process name. */
export function withSessionPowerLock(context, operation, { timeoutMs = 2_000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 10_000) fail("SP-LOCK", "lock timeout is invalid");
  ensurePrivateDirectory(context.directory);
  const started = Date.now();
  const token = JSON.stringify({ schema: "pipeline.session-power-lock.v1", pid: process.pid, nonce: randomBytes(16).toString("hex") });
  for (;;) {
    let fd;
    try {
      fd = openSync(context.lockPath, "wx", 0o600);
      writeFileSync(fd, `${token}\n`);
      closeSync(fd);
      fd = undefined;
      assertPrivateRegularFile(context.lockPath, "session-power lock");
      break;
    } catch (error) {
      if (fd !== undefined) {
        try { closeSync(fd); } catch { /* preserve the primary error */ }
      }
      if (error?.code !== "EEXIST") throw error;
      try { assertPrivateRegularFile(context.lockPath, "session-power lock"); } catch { fail("SP-LOCK", "session-power lock is untrusted"); }
      if (Date.now() - started >= timeoutMs) fail("SP-LOCK", "session-power lock timed out");
      wait(20);
    }
  }
  const release = () => {
    try {
      if (!existsSync(context.lockPath) || readFileSync(context.lockPath, "utf8") !== `${token}\n`) {
        fail("SP-LOCK", "session-power lock ownership changed");
      }
      unlinkSync(context.lockPath);
    } catch (error) {
      if (error instanceof SessionPowerError) throw error;
      fail("SP-LOCK", "session-power lock cleanup failed");
    }
  };
  try {
    const value = operation();
    if (value && typeof value.then === "function") return value.then(
      (result) => { release(); return result; },
      (error) => { release(); throw error; },
    );
    release();
    return value;
  } catch (error) {
    release();
    throw error;
  }
}

export function sha256File(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) fail("SP-IDENTITY", "identity executable is not a regular file");
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Exact Linux boot/PID/start/executable observation; missing data is unavailable. */
export function readLinuxProcessIdentity(processId) {
  if (!pid(processId)) fail("SP-IDENTITY", "Linux process ID is invalid");
  let bootId;
  let stat;
  let executable;
  try {
    bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim().toLowerCase();
    stat = readFileSync(`/proc/${processId}/stat`, "utf8").trim();
    executable = realpathSync(`/proc/${processId}/exe`);
  } catch {
    fail("SP-IDENTITY", "Linux process identity is unavailable");
  }
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(bootId)) fail("SP-IDENTITY", "Linux boot identity is invalid");
  const closing = stat.lastIndexOf(")");
  if (closing < 3 || stat[closing + 1] !== " ") fail("SP-IDENTITY", "Linux process stat is malformed");
  const fields = stat.slice(closing + 2).split(" "); // field 3 begins at index 0
  const startTicks = fields[19]; // proc stat field 22
  if (!/^[0-9]+$/u.test(startTicks) || !safeInt(Number(startTicks), 1)) fail("SP-IDENTITY", "Linux process start identity is invalid");
  return {
    platform: "linux",
    hostBootId: `linux:${bootId}`,
    start: `linux:${bootId}:${startTicks}`,
    executableSha256: sha256File(executable),
  };
}

export function fixedAdapterLaunch({ platform = process.platform, nodePath = process.execPath, helperPath, controllerPid, controllerStart }) {
  if (!isAbsolute(nodePath) || !isAbsolute(helperPath) || !pid(controllerPid) || !closedString(controllerStart)) {
    fail("SP-ADAPTER", "fixed adapter inputs are invalid");
  }
  // `platform` selects a target adapter shape and may deliberately differ from the
  // real host (production always matches; tests simulate the other three targets
  // from one host to exercise every argv shape). node:path's resolve/isAbsolute are
  // host-platform-bound: on win32 resolving an already-absolute POSIX-style path
  // (e.g. "/usr/bin/node" for a simulated Linux target) prepends the current drive
  // instead of leaving it untouched. isAbsolute() above already validated both
  // inputs; only re-resolve through the host path module for a real same-platform
  // invocation, never for a simulated foreign-platform one.
  const sameHost = platform === process.platform;
  const absoluteNode = sameHost ? resolve(nodePath) : nodePath;
  const absoluteHelper = sameHost ? resolve(helperPath) : helperPath;
  if (platform === "linux") return {
    adapterId: "linux-systemd-inhibit-v1",
    command: "/usr/bin/systemd-inhibit",
    args: ["--what=idle:sleep", "--mode=block", "--who=agent-pipeline", "--why=active-pipeline-session", absoluteNode, absoluteHelper, "--controller-pid", String(controllerPid), "--controller-start", controllerStart, "--lease-seconds", String(SESSION_POWER_LEASE_SECONDS)],
    shell: false,
  };
  if (platform === "darwin") return {
    adapterId: "macos-caffeinate-v1", command: "/usr/bin/caffeinate",
    args: ["-i", "-w", String(controllerPid), "-t", String(SESSION_POWER_LEASE_SECONDS)], shell: false,
  };
  if (platform === "win32" || platform === "wsl") return {
    adapterId: platform === "wsl" ? "wsl-powershell-v1" : "windows-powershell-v1",
    command: platform === "wsl" ? "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" : "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", absoluteHelper, "-LeaseSeconds", String(SESSION_POWER_LEASE_SECONDS)], shell: false,
  };
  return null;
}

export function sessionPowerCommandResult(operation, record) {
  return {
    schema: SESSION_POWER_COMMAND_RESULT_SCHEMA,
    operation,
    sessionId: record.sessionId,
    status: record.status,
    revision: record.revision,
    failureClass: record.failureClass,
    observedAt: record.observedAt,
  };
}
