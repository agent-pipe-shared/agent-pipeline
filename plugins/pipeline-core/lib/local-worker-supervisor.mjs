// SPDX-License-Identifier: SUL-1.0
/**
 * Functional Nova B1-I same-host worker supervisor.
 *
 * This module owns the closed request/record/result contracts and the bounded
 * local Git/process adapter. It never applies a worker result to the source
 * checkout and never claims OS isolation, Verify, Critic, or PO acceptance.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { uptime } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  localWorkerPoolDigest,
  validateLocalWorkerPool,
} from "./local-worker-pool.mjs";
import {
  localSupervisorStateDigest,
  resolveLocalSupervisorRoot,
  validateLocalSupervisorState,
} from "./local-supervisor-state.mjs";

export const LOCAL_WORKER_SUPERVISOR_REQUEST_SCHEMA = "pipeline.local-worker-supervisor-request.v1";
export const LOCAL_WORKER_SUPERVISOR_PLAN_SCHEMA = "pipeline.local-worker-supervisor-plan.v1";
export const LOCAL_WORKER_SUPERVISOR_RECORD_SCHEMA = "pipeline.local-worker-supervisor-record.v1";
export const LOCAL_WORKER_SUPERVISOR_RESULT_SCHEMA = "pipeline.local-worker-supervisor-result.v1";
export const LOCAL_WORKER_SUPERVISOR_CANCEL_SCHEMA = "pipeline.local-worker-supervisor-cancel.v1";
const LOCAL_WORKER_SUPERVISOR_SEMANTIC_RULES = Object.freeze([
  "cleanup-lease-relations",
  "cross-item-uniqueness",
  "cross-worker-timing-equality",
  "digest-equality",
  "lexical-ordering",
  "relative-timing-bounds",
]);
export const LOCAL_WORKER_SUPERVISOR_REQUEST_VALIDATION_CONTRACT = Object.freeze({
  contract: "pipeline.local-worker-supervisor-validation.v1",
  structuralSchema: "local-worker-supervisor.schema.json#/$defs/request",
  semanticValidator: "validateLocalWorkerSupervisorRequest",
  acceptance: "structural-and-semantic",
  semanticRules: LOCAL_WORKER_SUPERVISOR_SEMANTIC_RULES,
});

const FIXTURE_WORKER = realpathSync(fileURLToPath(new URL("../scripts/fixtures/local-worker-supervisor-worker.mjs", import.meta.url)));
const NODE_EXECUTABLE = realpathSync(process.execPath);
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_PATH = /^(?!\/)(?!.*\/\/)(?!.*\/$)(?!\.{1,2}(?:\/|$))(?!.*\/\.{1,2}(?:\/|$))[A-Za-z0-9._/-]{1,512}$/u;
const MAX_RECORD_BYTES = 65_536;
const MAX_RESULT_FILE_BYTES = 1_048_576;
const MAX_WORKERS = 16;
const TERMINAL = new Set(["completed", "failed", "cancelled", "timed-out", "recovery-required"]);
const RECORD_STATES = new Set(["created", "admitting", "running", "draining", "completed", "degraded", "cancelled", "recovery-required"]);
const WORKER_STATES = new Set(["created", "running", "completed", "failed", "cancelled", "timed-out", "recovery-required"]);
const CLEANUP_STATES = new Set(["active", "cleanup-pending", "cleaned", "blocked"]);
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const sha = (value) => typeof value === "string" && SHA256.test(value);
const oid = (value) => typeof value === "string" && OID.test(value);
const id = (value) => typeof value === "string" && ID.test(value);
const safeInteger = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const sortedUnique = (values, predicate, maximum = 64) => Array.isArray(values)
  && values.length <= maximum
  && values.every(predicate)
  && values.every((value, index) => index === 0 || values[index - 1] < value);
const safePath = (value) => typeof value === "string" && SAFE_PATH.test(value);
const clone = (value) => structuredClone(value);
const monotonicMs = () => Math.floor(uptime() * 1000);

export function canonicalLocalWorkerSupervisorJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalLocalWorkerSupervisorJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalLocalWorkerSupervisorJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function localWorkerSupervisorSha256(value) {
  return createHash("sha256").update(
    typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalLocalWorkerSupervisorJson(value),
  ).digest("hex");
}

export function localWorkerSupervisorWorkerRequestSha256(worker) {
  if (!validWorkerRequest(worker)) return null;
  return localWorkerSupervisorSha256({
    taskId: worker.taskId,
    subjectSha256: worker.subjectSha256,
    leaseId: worker.leaseId,
    writePaths: worker.writePaths,
    instructionSha256: worker.instructionSha256,
    heartbeatIntervalMs: worker.heartbeatIntervalMs,
    orphanAfterMs: worker.orphanAfterMs,
  });
}

export function localWorkerSupervisorPackageSha256({ dispatchId, attempt, queueRevision, workers } = {}) {
  if (!id(dispatchId) || !safeInteger(attempt) || !safeInteger(queueRevision)
    || !Array.isArray(workers) || workers.length < 1 || workers.length > MAX_WORKERS
    || !workers.every(validWorkerRequest)
    || !workers.every((worker, index) => index === 0 || workers[index - 1].taskId < worker.taskId)) return null;
  return localWorkerSupervisorSha256({
    dispatchId,
    attempt,
    queueRevision,
    workers: workers.map((worker) => ({
      taskId: worker.taskId,
      subjectSha256: worker.subjectSha256,
      leaseId: worker.leaseId,
      writePaths: worker.writePaths,
      instructionSha256: worker.instructionSha256,
      heartbeatIntervalMs: worker.heartbeatIntervalMs,
      orphanAfterMs: worker.orphanAfterMs,
    })),
  });
}

function unsignedDigest(value, digestField) {
  const copy = clone(value);
  delete copy[digestField];
  return localWorkerSupervisorSha256(copy);
}

function regularFileSha256(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("LWS-EXECUTABLE");
  return localWorkerSupervisorSha256(readFileSync(path));
}

function validRunner(value) {
  if (!exact(value, ["kind", "executable", "executableSha256", "model", "effort", "timeoutMs", "maxOutputBytes", "fixture"])) return false;
  if (!["fixture", "codex-exec"].includes(value.kind) || !isAbsolute(value.executable) || resolve(value.executable) !== value.executable || !sha(value.executableSha256)) return false;
  if (!safeInteger(value.timeoutMs, 100, 600_000) || !safeInteger(value.maxOutputBytes, 1_024, 1_048_576)) return false;
  if (value.kind === "codex-exec") {
    return basename(value.executable) === "codex"
      && typeof value.model === "string" && MODEL.test(value.model)
      && ["low", "medium", "high", "xhigh"].includes(value.effort)
      && value.fixture === null;
  }
  return value.executable === NODE_EXECUTABLE
    && value.model === null && value.effort === null
    && exact(value.fixture, ["delayMs", "exitCode", "behavior"])
    && safeInteger(value.fixture.delayMs, 100, 30_000)
    && safeInteger(value.fixture.exitCode, 0, 125)
    && ["first-authorized", "ignored-unauthorized", "none"].includes(value.fixture.behavior);
}

function validWorkerRequest(value) {
  return exact(value, ["taskId", "subjectSha256", "leaseId", "writePaths", "instruction", "instructionSha256", "heartbeatIntervalMs", "orphanAfterMs"])
    && id(value.taskId) && sha(value.subjectSha256) && id(value.leaseId)
    && sortedUnique(value.writePaths, safePath, 32) && value.writePaths.length > 0
    && typeof value.instruction === "string" && Buffer.byteLength(value.instruction) > 0
    && Buffer.byteLength(value.instruction) <= 32_768
    && sha(value.instructionSha256) && localWorkerSupervisorSha256(value.instruction) === value.instructionSha256
    && safeInteger(value.heartbeatIntervalMs, 1_000, 60_000)
    && safeInteger(value.orphanAfterMs, value.heartbeatIntervalMs * 3, 600_000);
}

export function validateLocalWorkerSupervisorRequest(value) {
  if (!exact(value, ["schema", "repository", "dispatch", "supervisor", "git", "pool", "runner", "workers"])
    || value.schema !== LOCAL_WORKER_SUPERVISOR_REQUEST_SCHEMA
    || !exact(value.repository, ["fingerprint", "sourceRoot", "sourceRootSha256", "baseCommit", "candidateCommit", "candidateSha256"])
    || !sha(value.repository.fingerprint) || !isAbsolute(value.repository.sourceRoot)
    || resolve(value.repository.sourceRoot) !== value.repository.sourceRoot
    || !sha(value.repository.sourceRootSha256) || !oid(value.repository.baseCommit)
    || !oid(value.repository.candidateCommit) || !sha(value.repository.candidateSha256)
    || localWorkerSupervisorSha256(value.repository.candidateCommit) !== value.repository.candidateSha256
    || !exact(value.dispatch, ["dispatchId", "attempt", "queueRevision", "packageSha256"])
    || !id(value.dispatch.dispatchId) || !safeInteger(value.dispatch.attempt)
    || !safeInteger(value.dispatch.queueRevision) || !sha(value.dispatch.packageSha256)
    || !exact(value.supervisor, ["subject", "ownerNonce", "heartbeatMs", "orphanAfterMs", "cleanupLeaseMs", "recoveryReserve"])
    || !id(value.supervisor.subject) || !id(value.supervisor.ownerNonce)
    || !safeInteger(value.supervisor.heartbeatMs, 1_000, 60_000)
    || !safeInteger(value.supervisor.orphanAfterMs, value.supervisor.heartbeatMs * 3, 600_000)
    || !safeInteger(value.supervisor.cleanupLeaseMs, value.supervisor.orphanAfterMs + 1, 3_600_000)
    || !safeInteger(value.supervisor.recoveryReserve, 1, 16)
    || !exact(value.git, ["executable", "executableSha256"])
    || !isAbsolute(value.git.executable) || resolve(value.git.executable) !== value.git.executable
    || !sha(value.git.executableSha256)
    || !validateLocalWorkerPool(value.pool).ok || !validRunner(value.runner)
    || !Array.isArray(value.workers) || value.workers.length < 1 || value.workers.length > MAX_WORKERS
    || !value.workers.every(validWorkerRequest)
    || !value.workers.every((worker) => worker.heartbeatIntervalMs === value.supervisor.heartbeatMs
      && worker.orphanAfterMs === value.supervisor.orphanAfterMs)
    || value.supervisor.cleanupLeaseMs <= value.runner.timeoutMs + value.supervisor.orphanAfterMs
    || !value.workers.every((worker, index) => index === 0 || value.workers[index - 1].taskId < worker.taskId)
    || new Set(value.workers.map((entry) => entry.taskId)).size !== value.workers.length
    || new Set(value.workers.map((entry) => entry.subjectSha256)).size !== value.workers.length
    || new Set(value.workers.map((entry) => entry.leaseId)).size !== value.workers.length) {
    return { ok: false, code: "LWS-REQUEST-INVALID" };
  }
  if (localWorkerSupervisorPackageSha256({
    dispatchId: value.dispatch.dispatchId,
    attempt: value.dispatch.attempt,
    queueRevision: value.dispatch.queueRevision,
    workers: value.workers,
  }) !== value.dispatch.packageSha256) return { ok: false, code: "LWS-REQUEST-INVALID" };
  return { ok: true, code: "LWS-REQUEST-VALID" };
}

function validProcessIdentity(value) {
  return value === null || (exact(value, ["nonce", "pid", "processStartSha256", "bootSha256", "executableSha256"])
    && id(value.nonce) && safeInteger(value.pid, 1) && sha(value.processStartSha256)
    && sha(value.bootSha256) && sha(value.executableSha256));
}

function validResult(value) {
  if (!exact(value, ["schema", "taskId", "subjectSha256", "candidateCommit", "status", "exitCode", "signal", "changed", "changeManifestSha256", "stdoutSha256", "stderrSha256", "startedMonotonicMs", "completedMonotonicMs", "resultSha256"])
    || value.schema !== LOCAL_WORKER_SUPERVISOR_RESULT_SCHEMA || !id(value.taskId)
    || !sha(value.subjectSha256) || !oid(value.candidateCommit)
    || !["completed", "failed", "cancelled", "timed-out", "recovery-required"].includes(value.status)
    || !(value.exitCode === null || safeInteger(value.exitCode, 0, 255))
    || !(value.signal === null || ["SIGTERM", "SIGKILL", "SIGHUP", "SIGINT"].includes(value.signal))
    || !Array.isArray(value.changed) || value.changed.length > 64
    || !value.changed.every((entry) => exact(entry, ["path", "kind", "mode", "bytes", "sha256"]) && safePath(entry.path)
      && ["added", "modified", "deleted"].includes(entry.kind)
      && (entry.kind === "deleted" ? entry.mode === null : ["100644", "100755"].includes(entry.mode))
      && safeInteger(entry.bytes, 0, MAX_RESULT_FILE_BYTES)
      && (entry.kind === "deleted" ? entry.sha256 === null && entry.bytes === 0 : sha(entry.sha256)))
    || !value.changed.every((entry, index) => index === 0 || value.changed[index - 1].path < entry.path)
    || !sha(value.changeManifestSha256)
    || value.changeManifestSha256 !== localWorkerSupervisorSha256(value.changed)
    || !sha(value.stdoutSha256) || !sha(value.stderrSha256)
    || !safeInteger(value.startedMonotonicMs) || !safeInteger(value.completedMonotonicMs, value.startedMonotonicMs)
    || !sha(value.resultSha256) || unsignedDigest(value, "resultSha256") !== value.resultSha256) return false;
  if (value.status === "completed" && (value.exitCode !== 0 || value.signal !== null)) return false;
  if (value.status === "failed" && value.exitCode === 0 && value.signal === null) return false;
  return true;
}

export function validateLocalWorkerSupervisorResult(value) {
  return validResult(value) ? { ok: true, code: "LWS-RESULT-VALID" } : { ok: false, code: "LWS-RESULT-INVALID" };
}

function validRecordWorker(value) {
  return exact(value, ["taskId", "subjectSha256", "leaseId", "writePathsSha256", "workspaceMember", "workspacePathSha256", "state", "cleanupState", "process", "startedMonotonicMs", "completedMonotonicMs", "result"])
    && id(value.taskId) && sha(value.subjectSha256) && id(value.leaseId)
    && sha(value.writePathsSha256) && id(value.workspaceMember) && sha(value.workspacePathSha256)
    && WORKER_STATES.has(value.state) && CLEANUP_STATES.has(value.cleanupState)
    && validProcessIdentity(value.process)
    && (value.startedMonotonicMs === null || safeInteger(value.startedMonotonicMs))
    && (value.completedMonotonicMs === null || safeInteger(value.completedMonotonicMs))
    && (value.result === null || validResult(value.result));
}

export function validateLocalWorkerSupervisorRecord(value) {
  if (!exact(value, ["schema", "repositoryFingerprint", "sourceRootSha256", "sourceStatusSha256", "candidate", "dispatch", "requestSha256", "planSha256", "poolSha256", "status", "owner", "lease", "effectiveCapacity", "workers", "recordSha256"])
    || value.schema !== LOCAL_WORKER_SUPERVISOR_RECORD_SCHEMA
    || !sha(value.repositoryFingerprint) || !sha(value.sourceRootSha256) || !sha(value.sourceStatusSha256)
    || !exact(value.candidate, ["baseCommit", "candidateCommit", "candidateSha256"])
    || !oid(value.candidate.baseCommit) || !oid(value.candidate.candidateCommit) || !sha(value.candidate.candidateSha256)
    || !exact(value.dispatch, ["dispatchId", "attempt", "queueRevision", "packageSha256"])
    || !id(value.dispatch.dispatchId) || !safeInteger(value.dispatch.attempt)
    || !safeInteger(value.dispatch.queueRevision) || !sha(value.dispatch.packageSha256)
    || !sha(value.requestSha256) || !sha(value.planSha256) || !sha(value.poolSha256)
    || !RECORD_STATES.has(value.status) || value.owner === null || !validProcessIdentity(value.owner)
    || !exact(value.lease, ["heartbeatMs", "orphanAfterMs", "lastHeartbeatMonotonicMs", "cleanupExpiresMonotonicMs"])
    || !safeInteger(value.lease.heartbeatMs, 1_000, 60_000)
    || !safeInteger(value.lease.orphanAfterMs, value.lease.heartbeatMs * 3, 600_000)
    || !safeInteger(value.lease.lastHeartbeatMonotonicMs)
    || !safeInteger(value.lease.cleanupExpiresMonotonicMs, value.lease.lastHeartbeatMonotonicMs + 1)
    || !safeInteger(value.effectiveCapacity, 1, MAX_WORKERS)
    || !Array.isArray(value.workers) || value.workers.length < 1 || value.workers.length > value.effectiveCapacity
    || !value.workers.every(validRecordWorker)
    || new Set(value.workers.map((worker) => worker.taskId)).size !== value.workers.length
    || new Set(value.workers.map((worker) => worker.subjectSha256)).size !== value.workers.length
    || new Set(value.workers.map((worker) => worker.leaseId)).size !== value.workers.length
    || new Set(value.workers.map((worker) => worker.workspaceMember)).size !== value.workers.length
    || !value.workers.every((worker) => {
      if (worker.result !== null) {
        if (worker.result.taskId !== worker.taskId
          || worker.result.subjectSha256 !== worker.subjectSha256
          || worker.result.candidateCommit !== value.candidate.candidateCommit
          || worker.result.status !== worker.state
          || worker.startedMonotonicMs !== worker.result.startedMonotonicMs
          || worker.completedMonotonicMs !== worker.result.completedMonotonicMs) return false;
      }
      if (worker.state === "created") {
        return worker.process === null && worker.startedMonotonicMs === null
          && worker.completedMonotonicMs === null && worker.result === null
          && worker.cleanupState === "active";
      }
      if (worker.state === "running") {
        return worker.process !== null && worker.startedMonotonicMs !== null
          && worker.completedMonotonicMs === null && worker.result === null
          && worker.cleanupState === "active";
      }
      if (worker.state === "recovery-required" && worker.result === null) {
        return worker.completedMonotonicMs === null && ["active", "blocked"].includes(worker.cleanupState);
      }
      return worker.process !== null && worker.startedMonotonicMs !== null
        && worker.completedMonotonicMs !== null && worker.result !== null
        && ["cleanup-pending", "cleaned", "blocked"].includes(worker.cleanupState);
    })
    || !sha(value.recordSha256) || unsignedDigest(value, "recordSha256") !== value.recordSha256) {
    return { ok: false, code: "LWS-RECORD-INVALID" };
  }
  return { ok: true, code: "LWS-RECORD-VALID" };
}

function secureDirectory(path) {
  if (!isAbsolute(path) || resolve(path) !== path) return false;
  try {
    const info = lstatSync(path);
    return info.isDirectory() && !info.isSymbolicLink() && realpathSync(path) === path;
  } catch {
    return false;
  }
}

function ownedByCurrentUser(info) {
  return process.platform === "win32"
    || typeof process.getuid !== "function"
    || info.uid === process.getuid();
}

function securePrivateDirectory(path) {
  if (!secureDirectory(path)) return false;
  try {
    const info = lstatSync(path);
    return ownedByCurrentUser(info)
      && (process.platform === "win32" || (info.mode & 0o077) === 0);
  } catch {
    return false;
  }
}

function secureRegularFile(path, maximum = MAX_RECORD_BYTES) {
  try {
    const info = lstatSync(path);
    return info.isFile() && !info.isSymbolicLink() && info.size <= maximum
      && ownedByCurrentUser(info)
      && (process.platform === "win32" || (info.mode & 0o177) === 0);
  } catch {
    return false;
  }
}

function syncDirectory(path) {
  const descriptor = openSync(path, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function atomicWriteJson(path, value) {
  const bytes = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(bytes) > MAX_RECORD_BYTES) throw new Error("LWS-RECORD-SIZE");
  const temporary = `${path}.tmp-${randomBytes(12).toString("hex")}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, bytes, { encoding: "utf8" });
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, path);
  syncDirectory(dirname(path));
}

function createJsonExclusive(path, value) {
  const bytes = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(bytes) > MAX_RECORD_BYTES) throw new Error("LWS-RECORD-SIZE");
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, bytes, { encoding: "utf8" });
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  syncDirectory(dirname(path));
}

function readBoundedJson(path) {
  if (!secureRegularFile(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function gitEnvironment() {
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_PAGER: "cat",
    GIT_OPTIONAL_LOCKS: "0",
  };
}

function runGit(gitExecutable, args, options = {}) {
  return execFileSync(gitExecutable, args, {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: gitEnvironment(),
    timeout: options.timeout ?? 30_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
}

function observeSource(request) {
  let sourceRoot;
  try {
    sourceRoot = realpathSync(request.repository.sourceRoot);
    if (sourceRoot !== request.repository.sourceRoot || !secureDirectory(sourceRoot)
      || localWorkerSupervisorSha256(sourceRoot) !== request.repository.sourceRootSha256
      || regularFileSha256(request.runner.executable) !== request.runner.executableSha256) return false;
  } catch {
    return false;
  }
  return true;
}

function observeRunner(request) {
  try {
    if (request.runner.kind === "fixture") return request.runner.executable === NODE_EXECUTABLE;
    const version = execFileSync(request.runner.executable, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: allowedEnvironment("runner-observation"),
      timeout: 5_000,
      maxBuffer: 16_384,
      windowsHide: true,
    }).trim();
    if (!/^codex-cli [0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/u.test(version)) return false;
    const help = execFileSync(request.runner.executable, [
      "--ask-for-approval", "never",
      "exec",
      "--strict-config",
      "--ignore-user-config",
      "--sandbox", "workspace-write",
      "--ephemeral",
      "--json",
      "--help",
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: allowedEnvironment("runner-observation"),
      timeout: 5_000,
      maxBuffer: 65_536,
      windowsHide: true,
    });
    return help.includes("Run Codex non-interactively");
  } catch {
    return false;
  }
}

function validatePoolBindings(request, stateRoot, now = monotonicMs()) {
  const pool = request.pool;
  if (pool.candidate.repositorySha256 !== request.repository.fingerprint
    || pool.candidate.baseCommit !== request.repository.baseCommit
    || pool.candidate.candidateCommit !== request.repository.candidateCommit
    || pool.queueRevision !== request.dispatch.queueRevision
    || pool.serialFallback
    || pool.capacity.effective.status !== "available"
    || !safeInteger(pool.capacity.effective.concurrentTasks)) return false;
  return request.workers.every((worker) => {
    const poolWorker = pool.workers.find((entry) => entry.subjectSha256 === worker.subjectSha256);
    const admission = pool.admissionSet.find((entry) => entry.taskId === worker.taskId);
    return poolWorker && admission && admission.subjectSha256 === worker.subjectSha256
      && admission.state === "admitted" && poolWorker.state === "admitted"
      && poolWorker.workspaceLease.leaseId === worker.leaseId
      && poolWorker.workspaceLease.issuedMonotonicMs <= now
      && poolWorker.workspaceLease.expiresMonotonicMs > now
      && poolWorker.workspaceLease.worktreePathSha256 === localWorkerSupervisorSha256(join(stateRoot, "workspaces", worker.leaseId))
      && admission.requestSha256 === localWorkerSupervisorWorkerRequestSha256(worker)
      && canonicalLocalWorkerSupervisorJson(admission.writePaths) === canonicalLocalWorkerSupervisorJson(worker.writePaths)
      && canonicalLocalWorkerSupervisorJson(poolWorker.workspaceLease.writePaths) === canonicalLocalWorkerSupervisorJson(worker.writePaths);
  });
}

function validateStateRoot(request, stateRoot) {
  const resolved = resolveLocalSupervisorRoot({ repositoryFingerprint: request.repository.fingerprint });
  return resolved.ok && resolved.root === stateRoot && securePrivateDirectory(stateRoot);
}

function loadAnchor(request, stateRoot) {
  const value = readBoundedJson(join(stateRoot, "state.json"));
  return value && validateLocalSupervisorState(value).ok
    && value.repositoryFingerprint === request.repository.fingerprint
    && value.candidate === request.repository.candidateSha256
    && value.subject === request.supervisor.subject
    && value.status === "ready"
    && value.owner === null
    && localSupervisorStateDigest(value) === value.recordSha256 ? value : null;
}

function sourceGitReadback(request, gitExecutable) {
  try {
    if (!isAbsolute(gitExecutable) || resolve(gitExecutable) !== gitExecutable
      || regularFileSha256(gitExecutable) !== request.git.executableSha256) return false;
    const top = runGit(gitExecutable, ["-C", request.repository.sourceRoot, "rev-parse", "--show-toplevel"]).trim();
    const candidate = runGit(gitExecutable, ["-C", request.repository.sourceRoot, "rev-parse", "--verify", `${request.repository.candidateCommit}^{commit}`]).trim();
    const base = runGit(gitExecutable, ["-C", request.repository.sourceRoot, "rev-parse", "--verify", `${request.repository.baseCommit}^{commit}`]).trim();
    const head = runGit(gitExecutable, ["-C", request.repository.sourceRoot, "rev-parse", "HEAD"]).trim();
    return realpathSync(top) === request.repository.sourceRoot
      && candidate === request.repository.candidateCommit && base === request.repository.baseCommit
      && head === request.repository.candidateCommit;
  } catch {
    return false;
  }
}

function sourceStatusDigest(request) {
  try {
    const status = runGit(request.git.executable, [
      "-C", request.repository.sourceRoot,
      "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching",
    ], { encoding: "buffer" });
    return localWorkerSupervisorSha256(status);
  } catch {
    return null;
  }
}

function overlappingWritePaths(workers) {
  const seen = new Set();
  for (const worker of workers) {
    for (const path of worker.writePaths) {
      if (seen.has(path)) return true;
      seen.add(path);
    }
  }
  return false;
}

function planDigest(value) {
  return unsignedDigest(value, "planSha256");
}

export function planLocalWorkerSupervisor({ request, stateRoot } = {}) {
  if (!validateLocalWorkerSupervisorRequest(request).ok) return { ok: false, code: "LWS-REQUEST-INVALID", plan: null };
  if (!validateStateRoot(request, stateRoot) || !observeSource(request) || !observeRunner(request) || !loadAnchor(request, stateRoot)) {
    return { ok: false, code: "LWS-AUTHORITY-UNAVAILABLE", plan: null };
  }
  if (!exact(request.git, ["executable", "executableSha256"]) || !isAbsolute(request.git.executable)
    || resolve(request.git.executable) !== request.git.executable || !sha(request.git.executableSha256)
    || !sourceGitReadback(request, request.git.executable) || !validatePoolBindings(request, stateRoot)) {
    return { ok: false, code: "LWS-BINDING-INVALID", plan: null };
  }
  const recordPath = join(stateRoot, "supervisor.json");
  const cancelPath = join(stateRoot, "supervisor-cancel.json");
  if (existsSync(recordPath)) {
    const inspected = inspectLocalWorkerSupervisor({ stateRoot });
    return { ok: false, code: inspected.code, plan: null };
  }
  if (existsSync(cancelPath)) return { ok: false, code: "LWS-RECOVERY-REQUIRED", plan: null };
  const sourceStatusSha256 = sourceStatusDigest(request);
  if (!sha(sourceStatusSha256)) return { ok: false, code: "LWS-SOURCE-UNAVAILABLE", plan: null };
  const available = request.pool.capacity.effective.concurrentTasks - request.supervisor.recoveryReserve;
  if (available < request.workers.length || available < 1 || overlappingWritePaths(request.workers)) {
    const fallback = {
      schema: LOCAL_WORKER_SUPERVISOR_PLAN_SCHEMA,
      status: "serial-fallback-required",
      requestSha256: localWorkerSupervisorSha256(request),
      poolSha256: localWorkerPoolDigest(request.pool),
      sourceStatusSha256,
      effectiveCapacity: Math.max(0, available),
      workspaces: [],
      providerExecutionRequired: request.runner.kind === "codex-exec",
      planSha256: null,
    };
    fallback.planSha256 = planDigest(fallback);
    return {
      ok: true,
      code: "LWS-SERIAL-FALLBACK-REQUIRED",
      plan: fallback,
    };
  }
  const effectiveCapacity = Math.min(MAX_WORKERS, available);
  const workspaces = request.workers.map((worker) => {
    const workspaceMember = worker.leaseId;
    const workspacePath = join(stateRoot, "workspaces", workspaceMember);
    return {
      taskId: worker.taskId,
      subjectSha256: worker.subjectSha256,
      leaseId: worker.leaseId,
      workspaceMember,
      workspacePathSha256: localWorkerSupervisorSha256(workspacePath),
    };
  });
  const plan = {
    schema: LOCAL_WORKER_SUPERVISOR_PLAN_SCHEMA,
    status: "ready",
    requestSha256: localWorkerSupervisorSha256(request),
    poolSha256: localWorkerPoolDigest(request.pool),
    sourceStatusSha256,
    effectiveCapacity,
    workspaces,
    providerExecutionRequired: request.runner.kind === "codex-exec",
    planSha256: null,
  };
  plan.planSha256 = planDigest(plan);
  return { ok: true, code: "LWS-PLAN-READY", plan };
}

function readProcIdentity(pid, expectedNonce = null) {
  if (process.platform !== "linux" || !safeInteger(pid, 1)) throw new Error("LWS-IDENTITY-UNAVAILABLE");
  const bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim().toLowerCase();
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8").trim();
  const close = stat.lastIndexOf(")");
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(bootId) || close < 3) throw new Error("LWS-IDENTITY-UNAVAILABLE");
  const fields = stat.slice(close + 2).trim().split(/\s+/u);
  const startTicks = fields[19];
  if (!/^[0-9]+$/u.test(startTicks)) throw new Error("LWS-IDENTITY-UNAVAILABLE");
  if (expectedNonce !== null) {
    const environment = readFileSync(`/proc/${pid}/environ`).toString("utf8").split("\0");
    if (!environment.includes(`PIPELINE_LOCAL_WORKER_NONCE=${expectedNonce}`)) throw new Error("LWS-IDENTITY-NONCE");
  }
  const executable = realpathSync(`/proc/${pid}/exe`);
  return {
    nonce: expectedNonce ?? "supervisor-owner",
    pid,
    processStartSha256: localWorkerSupervisorSha256(`linux:${bootId}:${startTicks}`),
    bootSha256: localWorkerSupervisorSha256(`linux:${bootId}`),
    executableSha256: regularFileSha256(executable),
  };
}

export function readLocalWorkerProcessIdentity(pid, expectedNonce = null) {
  try {
    return { ok: true, code: "LWS-IDENTITY", identity: readProcIdentity(pid, expectedNonce) };
  } catch {
    return { ok: false, code: "LWS-IDENTITY-UNAVAILABLE", identity: null };
  }
}

function sameProcess(left, right) {
  return left !== null && right !== null
    && left.nonce === right.nonce && left.pid === right.pid
    && left.processStartSha256 === right.processStartSha256
    && left.bootSha256 === right.bootSha256
    && left.executableSha256 === right.executableSha256;
}

function sameProcessWithoutNonce(left, right) {
  return left !== null && right !== null
    && left.pid === right.pid
    && left.processStartSha256 === right.processStartSha256
    && left.bootSha256 === right.bootSha256
    && left.executableSha256 === right.executableSha256;
}

function workspaceMarker(request, worker, workspacePath) {
  const value = {
    schema: "pipeline.local-worker-workspace-owner.v1",
    requestSha256: localWorkerSupervisorSha256(request),
    leaseId: worker.leaseId,
    ownerNonce: request.supervisor.ownerNonce,
    workspacePathSha256: localWorkerSupervisorSha256(workspacePath),
    markerSha256: null,
  };
  value.markerSha256 = unsignedDigest(value, "markerSha256");
  return value;
}

function createWorkspace(request, worker, stateRoot) {
  const workspacesRoot = join(stateRoot, "workspaces");
  if (!existsSync(workspacesRoot)) {
    mkdirSync(workspacesRoot, { mode: 0o700 });
    syncDirectory(stateRoot);
  }
  if (!securePrivateDirectory(workspacesRoot)) throw new Error("LWS-WORKSPACE-ROOT");
  const workspacePath = join(workspacesRoot, worker.leaseId);
  if (relative(workspacesRoot, workspacePath).split(sep).includes("..") || existsSync(workspacePath)) throw new Error("LWS-WORKSPACE-EXISTS");
  runGit(request.git.executable, [
    "-c", "core.hooksPath=/dev/null",
    "-c", "protocol.file.allow=always",
    "clone", "--local", "--no-hardlinks", "--no-checkout", "--",
    request.repository.sourceRoot, workspacePath,
  ]);
  chmodSync(workspacePath, 0o700);
  if (!securePrivateDirectory(workspacePath)) throw new Error("LWS-WORKSPACE-PRIVATE");
  runGit(request.git.executable, [
    "-C", workspacePath, "-c", "core.hooksPath=/dev/null",
    "checkout", "--detach", request.repository.candidateCommit,
  ]);
  const head = runGit(request.git.executable, ["-C", workspacePath, "rev-parse", "HEAD"]).trim();
  if (head !== request.repository.candidateCommit) throw new Error("LWS-CANDIDATE");
  if (!secureDirectory(join(workspacePath, ".git"))) throw new Error("LWS-WORKSPACE-GIT");
  const marker = workspaceMarker(request, worker, workspacePath);
  atomicWriteJson(join(workspacePath, ".git", "pipeline-local-worker-owner.json"), marker);
  return workspacePath;
}

function allowedEnvironment(nonce, includeCodexAuth = false) {
  const environment = { PIPELINE_LOCAL_WORKER_NONCE: nonce };
  const keys = ["PATH", "TMPDIR", "LANG", "LC_ALL", "SystemRoot"];
  if (includeCodexAuth) keys.push("HOME", "CODEX_HOME");
  for (const key of keys) {
    if (typeof process.env[key] === "string") environment[key] = process.env[key];
  }
  return environment;
}

export function buildLocalWorkerLaunch({ request, worker, workspacePath } = {}) {
  if (!validateLocalWorkerSupervisorRequest(request).ok || !validWorkerRequest(worker)
    || !isAbsolute(workspacePath) || resolve(workspacePath) !== workspacePath) {
    return { ok: false, code: "LWS-LAUNCH-INVALID", launch: null };
  }
  const nonce = randomBytes(16).toString("hex");
  if (request.runner.kind === "fixture") {
    const writePath = request.runner.fixture.behavior === "ignored-unauthorized"
      ? ".pipeline-ignored/escape.txt"
      : worker.writePaths[0];
    const write = request.runner.fixture.behavior !== "none";
    return {
      ok: true,
      code: "LWS-LAUNCH-FIXTURE",
      launch: {
        command: request.runner.executable,
        args: [
          FIXTURE_WORKER,
          "--task-id", worker.taskId,
          "--subject-sha256", worker.subjectSha256,
          "--write-path", writePath,
          "--delay-ms", String(request.runner.fixture.delayMs),
          "--exit-code", String(request.runner.fixture.exitCode),
          "--write", write ? "true" : "false",
        ],
        cwd: workspacePath,
        env: allowedEnvironment(nonce),
        nonce,
        shell: false,
        stdin: null,
      },
    };
  }
  return {
    ok: true,
    code: "LWS-LAUNCH-CODEX",
    launch: {
      command: request.runner.executable,
      args: [
        "--ask-for-approval", "never",
        "exec",
        "--strict-config",
        "--ignore-user-config",
        "--sandbox", "workspace-write",
        "--ephemeral",
        "--json",
        "--cd", workspacePath,
        "--model", request.runner.model,
        "-c", `model_reasoning_effort=${JSON.stringify(request.runner.effort)}`,
        "-c", "web_search=\"disabled\"",
        "-c", "sandbox_workspace_write.network_access=false",
        "-c", "shell_environment_policy.inherit=\"none\"",
        "-c", "shell_environment_policy.include_only=[\"PATH\",\"LANG\",\"LC_ALL\"]",
        "-",
      ],
      cwd: workspacePath,
      env: allowedEnvironment(nonce, true),
      nonce,
      shell: false,
      stdin: request.workers.find((entry) => entry.taskId === worker.taskId).instruction,
    },
  };
}

function changedFiles(request, worker, workspacePath) {
  const head = runGit(request.git.executable, ["-C", workspacePath, "rev-parse", "HEAD"]).trim();
  if (head !== request.repository.candidateCommit) throw new Error("LWS-STALE-CANDIDATE");
  const tracked = runGit(request.git.executable, ["-C", workspacePath, "diff", "--name-only", "-z", "--no-ext-diff", "--no-textconv", "HEAD"])
    .split("\0").filter(Boolean);
  const untracked = runGit(request.git.executable, ["-C", workspacePath, "ls-files", "--others", "-z"])
    .split("\0").filter(Boolean);
  const paths = [...new Set([...tracked, ...untracked])].sort();
  if (paths.length > 64 || paths.some((path) => !safePath(path) || !worker.writePaths.includes(path))) throw new Error("LWS-WRITE-AUTHORITY");
  return paths.map((path) => {
    const absolute = join(workspacePath, path);
    if (!existsSync(absolute)) return { path, kind: "deleted", mode: null, bytes: 0, sha256: null };
    const info = lstatSync(absolute);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_RESULT_FILE_BYTES) throw new Error("LWS-RESULT-FILE");
    return {
      path,
      kind: untracked.includes(path) ? "added" : "modified",
      mode: (info.mode & 0o111) === 0 ? "100644" : "100755",
      bytes: info.size,
      sha256: localWorkerSupervisorSha256(readFileSync(absolute)),
    };
  });
}

function validCodexJsonl(stdout) {
  try {
    const events = stdout.toString("utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    return events.some((event) => event?.type === "thread.started")
      && events.some((event) => event?.type === "turn.started")
      && events.some((event) => event?.type === "turn.completed")
      && !events.some((event) => event?.type === "turn.failed" || event?.type === "error");
  } catch {
    return false;
  }
}

function finishResult({ request, worker, runtime, status, exitCode, signal, stdout, stderr }) {
  let changed = [];
  let finalStatus = status;
  try { changed = changedFiles(request, worker, runtime.workspacePath); }
  catch { finalStatus = "recovery-required"; }
  if (!sourceGitReadback(request, request.git.executable)
    || sourceStatusDigest(request) !== runtime.sourceStatusSha256) finalStatus = "recovery-required";
  if (request.runner.kind === "codex-exec" && !validCodexJsonl(stdout)) finalStatus = "recovery-required";
  const result = {
    schema: LOCAL_WORKER_SUPERVISOR_RESULT_SCHEMA,
    taskId: worker.taskId,
    subjectSha256: worker.subjectSha256,
    candidateCommit: request.repository.candidateCommit,
    status: finalStatus,
    exitCode,
    signal,
    changed,
    changeManifestSha256: localWorkerSupervisorSha256(changed),
    stdoutSha256: localWorkerSupervisorSha256(stdout),
    stderrSha256: localWorkerSupervisorSha256(stderr),
    startedMonotonicMs: runtime.startedMonotonicMs,
    completedMonotonicMs: monotonicMs(),
    resultSha256: null,
  };
  result.resultSha256 = unsignedDigest(result, "resultSha256");
  return result;
}

function recordFor(request, plan, owner, now) {
  const record = {
    schema: LOCAL_WORKER_SUPERVISOR_RECORD_SCHEMA,
    repositoryFingerprint: request.repository.fingerprint,
    sourceRootSha256: request.repository.sourceRootSha256,
    sourceStatusSha256: plan.sourceStatusSha256,
    candidate: {
      baseCommit: request.repository.baseCommit,
      candidateCommit: request.repository.candidateCommit,
      candidateSha256: request.repository.candidateSha256,
    },
    dispatch: clone(request.dispatch),
    requestSha256: plan.requestSha256,
    planSha256: plan.planSha256,
    poolSha256: plan.poolSha256,
    status: "created",
    owner: { ...owner, nonce: request.supervisor.ownerNonce },
    lease: {
      heartbeatMs: request.supervisor.heartbeatMs,
      orphanAfterMs: request.supervisor.orphanAfterMs,
      lastHeartbeatMonotonicMs: now,
      cleanupExpiresMonotonicMs: now + request.supervisor.cleanupLeaseMs,
    },
    effectiveCapacity: plan.effectiveCapacity,
    workers: request.workers.map((worker) => {
      const planned = plan.workspaces.find((entry) => entry.taskId === worker.taskId);
      return {
        taskId: worker.taskId,
        subjectSha256: worker.subjectSha256,
        leaseId: worker.leaseId,
        writePathsSha256: localWorkerSupervisorSha256(worker.writePaths),
        workspaceMember: planned.workspaceMember,
        workspacePathSha256: planned.workspacePathSha256,
        state: "created",
        cleanupState: "active",
        process: null,
        startedMonotonicMs: null,
        completedMonotonicMs: null,
        result: null,
      };
    }),
    recordSha256: null,
  };
  record.recordSha256 = unsignedDigest(record, "recordSha256");
  return record;
}

function persistRecord(recordPath, record) {
  record.recordSha256 = unsignedDigest(record, "recordSha256");
  if (!validateLocalWorkerSupervisorRecord(record).ok) throw new Error("LWS-RECORD-INVALID");
  atomicWriteJson(recordPath, record);
  const readback = readBoundedJson(recordPath);
  if (!readback || !validateLocalWorkerSupervisorRecord(readback).ok || readback.recordSha256 !== record.recordSha256) {
    throw new Error("LWS-RECORD-READBACK");
  }
}

function persistNewRecord(recordPath, record) {
  record.recordSha256 = unsignedDigest(record, "recordSha256");
  if (!validateLocalWorkerSupervisorRecord(record).ok) throw new Error("LWS-RECORD-INVALID");
  createJsonExclusive(recordPath, record);
  const readback = readBoundedJson(recordPath);
  if (!readback || !validateLocalWorkerSupervisorRecord(readback).ok
    || readback.recordSha256 !== record.recordSha256) throw new Error("LWS-RECORD-READBACK");
}

function appendBounded(current, chunk, maximum) {
  const next = Buffer.concat([current, Buffer.from(chunk)]);
  if (next.length > maximum) throw new Error("LWS-OUTPUT-BOUND");
  return next;
}

function childExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function terminateExact(runtime, signal) {
  if (childExited(runtime.child)) return true;
  const observed = readLocalWorkerProcessIdentity(runtime.child.pid, runtime.launch.nonce);
  if (!observed.ok || !sameProcess(observed.identity, runtime.identity)) return false;
  try { return runtime.child.kill(signal); } catch { return false; }
}

function validCancelIntent(value, record = null) {
  if (!exact(value, ["schema", "requestSha256", "planSha256", "recordSha256", "owner", "issuedMonotonicMs", "cancelNonce", "cancelSha256"])
    || value.schema !== LOCAL_WORKER_SUPERVISOR_CANCEL_SCHEMA
    || !sha(value.requestSha256) || !sha(value.planSha256) || !sha(value.recordSha256)
    || !validProcessIdentity(value.owner) || value.owner === null
    || !safeInteger(value.issuedMonotonicMs) || !id(value.cancelNonce)
    || !sha(value.cancelSha256) || unsignedDigest(value, "cancelSha256") !== value.cancelSha256) return false;
  return record === null || (value.requestSha256 === record.requestSha256
    && value.planSha256 === record.planSha256
    && sameProcess(value.owner, record.owner)
    && value.issuedMonotonicMs <= record.lease.cleanupExpiresMonotonicMs);
}

export function validateLocalWorkerSupervisorCancel(value) {
  return validCancelIntent(value)
    ? { ok: true, code: "LWS-CANCEL-VALID" }
    : { ok: false, code: "LWS-CANCEL-INVALID" };
}

function readCancelIntent(path, record) {
  const intent = readBoundedJson(path);
  return intent && validCancelIntent(intent, record) ? intent : null;
}

function signalRecordedProcess(identity, signal) {
  const observed = readLocalWorkerProcessIdentity(identity.pid, identity.nonce);
  if (!observed.ok || !sameProcess(observed.identity, identity)) return false;
  try {
    process.kill(identity.pid, signal);
    return true;
  } catch {
    return false;
  }
}

async function observeSpawnedIdentity(child, nonce, executableSha256) {
  const deadline = Date.now() + 500;
  while (Date.now() <= deadline) {
    const observed = readLocalWorkerProcessIdentity(child.pid, nonce);
    if (observed.ok && observed.identity.executableSha256 === executableSha256) return observed.identity;
    if (childExited(child)) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  return null;
}

async function waitForWorkers({ request, runtimes, record, recordPath, cancelPath }) {
  let persistenceFailure = null;
  let cancellationIntent = null;
  const observeCancellation = () => {
    if (persistenceFailure || cancellationIntent !== null || !existsSync(cancelPath)) return;
    const intent = readCancelIntent(cancelPath, record);
    if (intent === null) {
      persistenceFailure = new Error("LWS-CANCEL-INVALID");
      record.status = "recovery-required";
      return;
    }
    cancellationIntent = intent;
    record.status = "draining";
    for (const runtime of runtimes.filter((entry) => !entry.closed)) {
      runtime.cancelRequested = true;
      if (!childExited(runtime.child) && !terminateExact(runtime, "SIGTERM")) {
        runtime.identityLost = true;
        const target = record.workers.find((entry) => entry.taskId === runtime.worker.taskId);
        target.state = "recovery-required";
        target.cleanupState = "blocked";
        record.status = "recovery-required";
      }
    }
    try { persistRecord(recordPath, record); }
    catch (error) { persistenceFailure = error; }
  };
  const cancellationPoll = setInterval(observeCancellation, 100);
  cancellationPoll.unref();
  const heartbeatTick = () => {
    if (persistenceFailure) return;
    try {
      observeCancellation();
      const now = monotonicMs();
      for (const runtime of runtimes.filter((entry) => !entry.closed)) {
        if (childExited(runtime.child)) continue;
        const observed = readLocalWorkerProcessIdentity(runtime.child.pid, runtime.launch.nonce);
        if (observed.ok && sameProcess(observed.identity, runtime.identity)) {
          runtime.lastIdentityObservedMonotonicMs = now;
        } else if (now - runtime.lastIdentityObservedMonotonicMs >= runtime.worker.orphanAfterMs) {
          runtime.identityLost = true;
          const target = record.workers.find((entry) => entry.taskId === runtime.worker.taskId);
          target.state = "recovery-required";
          record.status = "recovery-required";
        }
      }
      record.lease.lastHeartbeatMonotonicMs = now;
      persistRecord(recordPath, record);
    } catch (error) {
      persistenceFailure = error;
    }
  };
  // Short-lived workers may all finish before the first interval fires. Publish
  // one post-launch heartbeat so the persisted lease proves that supervision
  // was live for this wave, rather than retaining its pre-launch timestamp.
  heartbeatTick();
  const heartbeat = setInterval(heartbeatTick, request.supervisor.heartbeatMs);
  heartbeat.unref();

  const promises = runtimes.map((runtime) => new Promise((resolvePromise) => {
    const timeout = setTimeout(() => {
      if (childExited(runtime.child)) return;
      runtime.timedOut = true;
      if (!terminateExact(runtime, "SIGTERM")) runtime.identityLost = true;
      const kill = setTimeout(() => {
        if (!runtime.closed && !terminateExact(runtime, "SIGKILL")) runtime.identityLost = true;
      }, 500);
      kill.unref();
    }, request.runner.timeoutMs);
    timeout.unref();
    runtime.child.once("close", (exitCode, signal) => {
      clearTimeout(timeout);
      runtime.closed = true;
      if (cancellationIntent === null && existsSync(cancelPath)) {
        cancellationIntent = readCancelIntent(cancelPath, record);
      }
      if (cancellationIntent !== null) runtime.cancelRequested = true;
      const target = record.workers.find((entry) => entry.taskId === runtime.worker.taskId);
      const status = runtime.identityLost ? "recovery-required"
        : runtime.timedOut ? "timed-out"
          : runtime.cancelRequested ? "cancelled"
          : exitCode === 0 ? "completed" : "failed";
      const result = finishResult({
        request,
        worker: runtime.worker,
        runtime,
        status,
        exitCode,
        signal,
        stdout: runtime.stdout,
        stderr: runtime.stderr,
      });
      target.state = result.status;
      target.completedMonotonicMs = result.completedMonotonicMs;
      target.result = result;
      target.cleanupState = "cleanup-pending";
      resolvePromise();
    });
    runtime.child.once("error", () => {
      runtime.identityLost = true;
    });
  }));
  await Promise.all(promises);
  clearInterval(cancellationPoll);
  clearInterval(heartbeat);
  if (persistenceFailure) throw persistenceFailure;
}

export async function runLocalWorkerSupervisor({
  request,
  stateRoot,
  expectedPlanSha256,
  activate = false,
  allowProviderExecution = false,
} = {}) {
  const planned = planLocalWorkerSupervisor({ request, stateRoot });
  if (!planned.ok || planned.plan?.status !== "ready") return planned;
  if (!activate || !sha(expectedPlanSha256) || planned.plan.planSha256 !== expectedPlanSha256) {
    return { ok: false, code: "LWS-ACTIVATION-REQUIRED", plan: planned.plan, record: null };
  }
  if (request.runner.kind === "codex-exec" && !allowProviderExecution) {
    return { ok: false, code: "LWS-PROVIDER-ACTIVATION-REQUIRED", plan: planned.plan, record: null };
  }
  const recordPath = join(stateRoot, "supervisor.json");
  const cancelPath = join(stateRoot, "supervisor-cancel.json");
  if (existsSync(recordPath)) return { ok: false, code: "LWS-RECORD-EXISTS", plan: planned.plan, record: null };
  if (existsSync(cancelPath)) return { ok: false, code: "LWS-RECOVERY-REQUIRED", plan: planned.plan, record: null };

  const runtimes = [];
  let record = null;
  let recordOwned = false;
  try {
    const observed = readLocalWorkerProcessIdentity(process.pid);
    if (!observed.ok) throw new Error("LWS-OWNER");
    const now = monotonicMs();
    record = recordFor(request, planned.plan, observed.identity, now);
    record.status = "admitting";
    persistNewRecord(recordPath, record);
    recordOwned = true;
    for (const worker of request.workers) {
      const workspacePath = createWorkspace(request, worker, stateRoot);
      const launch = buildLocalWorkerLaunch({ request, worker, workspacePath });
      if (!launch.ok || launch.launch.shell !== false) throw new Error("LWS-LAUNCH");
      const child = spawn(launch.launch.command, launch.launch.args, {
        cwd: launch.launch.cwd,
        env: launch.launch.env,
        shell: false,
        stdio: [launch.launch.stdin === null ? "ignore" : "pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      const runtime = {
        worker,
        workspacePath,
        launch: launch.launch,
        child,
        identity: null,
        sourceStatusSha256: planned.plan.sourceStatusSha256,
        startedMonotonicMs: monotonicMs(),
        lastIdentityObservedMonotonicMs: monotonicMs(),
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        closed: false,
        timedOut: false,
        cancelRequested: false,
        identityLost: false,
      };
      runtimes.push(runtime);
      child.stdout.on("data", (chunk) => {
        try { runtime.stdout = appendBounded(runtime.stdout, chunk, request.runner.maxOutputBytes); }
        catch { runtime.identityLost = true; terminateExact(runtime, "SIGTERM"); }
      });
      child.stderr.on("data", (chunk) => {
        try { runtime.stderr = appendBounded(runtime.stderr, chunk, request.runner.maxOutputBytes); }
        catch { runtime.identityLost = true; terminateExact(runtime, "SIGTERM"); }
      });
      if (launch.launch.stdin !== null) {
        child.stdin.on("error", () => { runtime.identityLost = true; });
        child.stdin.end(launch.launch.stdin, "utf8");
      }
      const observedChild = await observeSpawnedIdentity(child, launch.launch.nonce, request.runner.executableSha256);
      if (observedChild === null) {
        throw new Error("LWS-CHILD-IDENTITY");
      }
      runtime.identity = observedChild;
      const target = record.workers.find((entry) => entry.taskId === worker.taskId);
      target.state = "running";
      target.process = observedChild;
      target.startedMonotonicMs = runtime.startedMonotonicMs;
      persistRecord(recordPath, record);
    }
    record.status = "running";
    persistRecord(recordPath, record);
    await waitForWorkers({ request, runtimes, record, recordPath, cancelPath });
    record.status = record.workers.some((entry) => entry.state === "recovery-required")
      ? "recovery-required"
      : record.workers.every((entry) => entry.state === "completed") ? "completed"
        : record.workers.every((entry) => entry.state === "cancelled" || entry.state === "timed-out") ? "cancelled" : "degraded";
    persistRecord(recordPath, record);
    return { ok: record.status === "completed", code: `LWS-${record.status.toUpperCase()}`, plan: planned.plan, record: clone(record) };
  } catch {
    for (const runtime of runtimes.filter((entry) => !entry.closed && entry.identity !== null)) {
      if (!terminateExact(runtime, "SIGTERM")) runtime.identityLost = true;
    }
    await Promise.all(runtimes.filter((entry) => !entry.closed && entry.identity !== null).map(async (runtime) => {
      const closed = await Promise.race([
        new Promise((resolvePromise) => runtime.child.once("close", () => resolvePromise(true))),
        new Promise((resolvePromise) => setTimeout(() => resolvePromise(false), 500)),
      ]);
      if (!closed && !terminateExact(runtime, "SIGKILL")) runtime.identityLost = true;
    }));
    if (record !== null && recordOwned) {
      record.status = "recovery-required";
      for (const target of record.workers.filter((entry) => entry.state === "running")) {
        target.state = "recovery-required";
        target.cleanupState = "blocked";
      }
      try { persistRecord(recordPath, record); } catch {}
    }
    return {
      ok: false,
      code: recordOwned ? "LWS-EXECUTION-UNAVAILABLE" : "LWS-BUSY",
      plan: planned.plan,
      record: readBoundedJson(recordPath),
    };
  }
}

function inspectProcess(identity, verifyNonce = true) {
  if (identity === null) return "absent";
  try {
    const observed = readProcIdentity(identity.pid, verifyNonce ? identity.nonce : null);
    return (verifyNonce ? sameProcess(identity, observed) : sameProcessWithoutNonce(identity, observed))
      ? "owned-live" : "mismatch-live";
  } catch (error) {
    return ["ENOENT", "ESRCH"].includes(error?.code) ? "dead" : "unavailable";
  }
}

export function cancelLocalWorkerSupervisor({
  stateRoot,
  expectedRecordSha256,
  activate = false,
  nowMonotonicMs = monotonicMs(),
} = {}) {
  if (!activate || !sha(expectedRecordSha256) || !securePrivateDirectory(stateRoot)
    || !safeInteger(nowMonotonicMs)) {
    return { ok: false, code: "LWS-CANCEL-ACTIVATION-REQUIRED", record: null, intent: null };
  }
  const recordPath = join(stateRoot, "supervisor.json");
  const cancelPath = join(stateRoot, "supervisor-cancel.json");
  const record = readBoundedJson(recordPath);
  if (!record || !validateLocalWorkerSupervisorRecord(record).ok
    || record.recordSha256 !== expectedRecordSha256
    || record.status !== "running"
    || record.lease.cleanupExpiresMonotonicMs <= nowMonotonicMs
    || inspectProcess(record.owner, false) !== "owned-live"
    || existsSync(cancelPath)) {
    return { ok: false, code: "LWS-CANCEL-DENIED", record, intent: null };
  }
  const intent = {
    schema: LOCAL_WORKER_SUPERVISOR_CANCEL_SCHEMA,
    requestSha256: record.requestSha256,
    planSha256: record.planSha256,
    recordSha256: record.recordSha256,
    owner: clone(record.owner),
    issuedMonotonicMs: nowMonotonicMs,
    cancelNonce: randomBytes(16).toString("hex"),
    cancelSha256: null,
  };
  intent.cancelSha256 = unsignedDigest(intent, "cancelSha256");
  try {
    createJsonExclusive(cancelPath, intent);
    const readback = readCancelIntent(cancelPath, record);
    if (readback === null || readback.cancelSha256 !== intent.cancelSha256) throw new Error("LWS-CANCEL-READBACK");
  } catch {
    return { ok: false, code: "LWS-CANCEL-DENIED", record, intent: null };
  }
  let signalled = 0;
  for (const worker of record.workers.filter((entry) => entry.state === "running" && entry.process !== null)) {
    if (signalRecordedProcess(worker.process, "SIGTERM")) signalled += 1;
  }
  return {
    ok: true,
    code: "LWS-CANCEL-REQUESTED",
    signalled,
    record: clone(record),
    intent: clone(intent),
  };
}

export function inspectLocalWorkerSupervisor({ stateRoot } = {}) {
  if (!securePrivateDirectory(stateRoot)) return { ok: false, code: "LWS-STATE-ROOT", disposition: "unavailable", record: null };
  const recordPath = join(stateRoot, "supervisor.json");
  const cancelPath = join(stateRoot, "supervisor-cancel.json");
  if (!existsSync(recordPath)) {
    return existsSync(cancelPath)
      ? { ok: false, code: "LWS-RECOVERY-REQUIRED", disposition: "recovery-required", record: null }
      : { ok: true, code: "LWS-IDLE", disposition: "idle", record: null };
  }
  const record = readBoundedJson(recordPath);
  if (!record || !validateLocalWorkerSupervisorRecord(record).ok) {
    return { ok: false, code: "LWS-RECORD-INVALID", disposition: "recovery-required", record: null };
  }
  const ownerState = inspectProcess(record.owner, false);
  const workerStates = record.workers.map((worker) => ({ taskId: worker.taskId, process: inspectProcess(worker.process) }));
  if (ownerState === "owned-live" && !TERMINAL.has(record.status)) {
    return { ok: true, code: "LWS-BUSY", disposition: "busy", record, ownerState, workerStates };
  }
  if (record.status === "completed" && workerStates.every((entry) => ["dead", "mismatch-live"].includes(entry.process))) {
    return { ok: true, code: "LWS-CLEANUP-PENDING", disposition: "cleanup-pending", record, ownerState, workerStates };
  }
  if (["degraded", "cancelled"].includes(record.status)
    && workerStates.every((entry) => ["dead", "mismatch-live"].includes(entry.process))) {
    return { ok: true, code: "LWS-CLEANUP-PENDING", disposition: "cleanup-pending", record, ownerState, workerStates };
  }
  return { ok: false, code: "LWS-RECOVERY-REQUIRED", disposition: "recovery-required", record, ownerState, workerStates };
}

function validMarker(marker, record, worker, workspacePath) {
  return exact(marker, ["schema", "requestSha256", "leaseId", "ownerNonce", "workspacePathSha256", "markerSha256"])
    && marker.schema === "pipeline.local-worker-workspace-owner.v1"
    && marker.requestSha256 === record.requestSha256 && marker.leaseId === worker.leaseId
    && marker.ownerNonce === record.owner.nonce
    && marker.workspacePathSha256 === localWorkerSupervisorSha256(workspacePath)
    && marker.workspacePathSha256 === worker.workspacePathSha256
    && sha(marker.markerSha256) && unsignedDigest(marker, "markerSha256") === marker.markerSha256;
}

export function cleanupLocalWorkerSupervisor({
  stateRoot,
  expectedRecordSha256,
  activate = false,
  nowMonotonicMs = monotonicMs(),
} = {}) {
  if (!activate || !sha(expectedRecordSha256) || !securePrivateDirectory(stateRoot)) {
    return { ok: false, code: "LWS-CLEANUP-ACTIVATION-REQUIRED", record: null };
  }
  const recordPath = join(stateRoot, "supervisor.json");
  const cancelPath = join(stateRoot, "supervisor-cancel.json");
  const record = readBoundedJson(recordPath);
  if (!record || !validateLocalWorkerSupervisorRecord(record).ok || record.recordSha256 !== expectedRecordSha256
    || !safeInteger(nowMonotonicMs) || record.lease.cleanupExpiresMonotonicMs <= nowMonotonicMs
    || !["completed", "degraded", "cancelled"].includes(record.status)) {
    return { ok: false, code: "LWS-CLEANUP-DENIED", record };
  }
  const workspacesRoot = join(stateRoot, "workspaces");
  if (!securePrivateDirectory(workspacesRoot)) return { ok: false, code: "LWS-CLEANUP-DENIED", record };
  try {
    if (existsSync(cancelPath) && readCancelIntent(cancelPath, record) === null) throw new Error("LWS-CANCEL-INVALID");
    for (const worker of record.workers) {
      const processState = inspectProcess(worker.process);
      if (!TERMINAL.has(worker.state) || !["dead", "mismatch-live"].includes(processState)) throw new Error("LWS-PROCESS-UNPROVEN");
      const workspacePath = join(workspacesRoot, worker.workspaceMember);
      if (relative(workspacesRoot, workspacePath).split(sep).includes("..") || !securePrivateDirectory(workspacePath)) throw new Error("LWS-WORKSPACE");
      if (!secureDirectory(join(workspacePath, ".git"))) throw new Error("LWS-WORKSPACE-GIT");
      const marker = readBoundedJson(join(workspacePath, ".git", "pipeline-local-worker-owner.json"));
      if (!validMarker(marker, record, worker, workspacePath)) throw new Error("LWS-MARKER");
    }
    for (const worker of record.workers) {
      const workspacePath = join(workspacesRoot, worker.workspaceMember);
      rmSync(workspacePath, { recursive: true, force: false });
      worker.cleanupState = "cleaned";
    }
    syncDirectory(workspacesRoot);
    persistRecord(recordPath, record);
    const closedRecord = clone(record);
    if (existsSync(cancelPath)) unlinkSync(cancelPath);
    unlinkSync(recordPath);
    syncDirectory(stateRoot);
    return { ok: true, code: "LWS-CLEANED", record: closedRecord };
  } catch {
    for (const worker of record.workers) {
      if (worker.cleanupState !== "cleaned") worker.cleanupState = "blocked";
    }
    try { persistRecord(recordPath, record); } catch {}
    return { ok: false, code: "LWS-CLEANUP-DENIED", record: clone(record) };
  }
}

export function localWorkerSupervisorFixturePath() {
  return FIXTURE_WORKER;
}
