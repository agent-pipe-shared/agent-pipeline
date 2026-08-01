#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { createHash, randomBytes } from "node:crypto";
import { closeSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync, writeSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import {
  VERIFY_PROGRESS_SCHEMA,
  digestJson,
  planVerifyResume,
  sealVerifySuiteReceipt,
  validateVerifySuiteReceipt,
} from "../lib/verify-resume.mjs";
import { readOnboardingSessionCleanupBinding } from "../lib/onboarding-continuity.mjs";
import { finalizeTemporaryResource, loadSessionDescriptor, registerTemporaryIntent } from "../lib/worktree-lifecycle.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";

const MAX_LOG_BYTES = 16 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const RUN_MANIFEST_SCHEMA = "pipeline.verify-run-manifest.v1";
const RUN_TERMINAL_SCHEMA = "pipeline.verify-run-terminal.v1";
const CLEANUP_REGISTRATION_SCHEMA = "pipeline.verify-cleanup-registration.v1";
const RUN_LOCK_SCHEMA = "pipeline.verify-run-lock.v1";

function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function now(clock) { return new Date(clock()).toISOString(); }
export function verifySuiteArtifactName(id) {
  if (!SAFE_ID.test(id)) throw new TypeError("VERIFY-SUITE-ID");
  return sha(id);
}

function ownerMatches(info) { return typeof process.getuid !== "function" || info.uid === process.getuid(); }

function processStartIdentity(pid) {
  if (process.platform !== "linux") return `pid-${pid}`;
  try { return readFileSync(`/proc/${pid}/stat`, "utf8").trim().split(" ")[21] || `pid-${pid}`; }
  catch { return `pid-${pid}`; }
}

function processIdentityAlive(pid, startId) {
  if (!Number.isSafeInteger(pid) || pid < 1 || typeof startId !== "string") return true;
  try { process.kill(pid, 0); } catch (error) { return error?.code !== "ESRCH"; }
  return processStartIdentity(pid) === startId;
}

function verifyRunLock(runId, status, clock) {
  return {
    schema: RUN_LOCK_SCHEMA,
    runId,
    pid: process.pid,
    processStartId: processStartIdentity(process.pid),
    owner: "current-os-user",
    status,
    closedAt: status === "closed" ? now(clock) : null,
  };
}

function validRunLock(value, runId) {
  const keys = ["schema", "runId", "pid", "processStartId", "owner", "status", "closedAt"];
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key))
    && value.schema === RUN_LOCK_SCHEMA && value.runId === runId
    && Number.isSafeInteger(value.pid) && value.pid > 0 && typeof value.processStartId === "string"
    && /^(?:\d+|pid-\d+)$/u.test(value.processStartId) && value.owner === "current-os-user"
    && new Set(["active", "closed"]).has(value.status)
    && (value.status === "active" ? value.closedAt === null
      : typeof value.closedAt === "string" && !Number.isNaN(Date.parse(value.closedAt)));
}

function assertPhysicalDirectory(path, { privateState = false, created = false } = {}) {
  const absolute = resolve(path);
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(absolute) !== absolute || !ownerMatches(info)) throw new Error("VERIFY-JOURNAL-DIRECTORY-UNSAFE");
  if (privateState) {
    if (process.platform === "win32") {
      const assurance = created ? hardenWindowsPrivateDirectory(absolute) : assessWindowsPrivatePath(absolute);
      if (assurance.status !== "secure") throw new Error("VERIFY-JOURNAL-WINDOWS-ASSURANCE");
    } else if ((info.mode & 0o077) !== 0) throw new Error("VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE");
  }
  return absolute;
}

function ensurePrivateDirectory(path) {
  let created = false;
  try { mkdirSync(path, { mode: 0o700 }); created = true; } catch (error) { if (error?.code !== "EEXIST") throw error; }
  return assertPhysicalDirectory(path, { privateState: true, created });
}

function regularPrivateFile(path) {
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || !ownerMatches(info)) return false;
    if (process.platform === "win32") return assessWindowsPrivatePath(path).status === "secure" && assessWindowsPrivatePath(dirname(path)).status === "secure";
    return (info.mode & 0o077) === 0;
  } catch { return false; }
}

function regularPhysicalFile(path) {
  try { const info = lstatSync(path); return info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && ownerMatches(info) && realpathSync(path) === resolve(path); } catch { return false; }
}

function writeDurable(path, bytes, flag) {
  const fd = openSync(path, flag, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  if (!regularPrivateFile(path)) throw new Error("VERIFY-JOURNAL-FILE-NOT-PRIVATE");
}

function directoryDurability(path) {
  let fd = null;
  try {
    fd = openSync(path, "r");
    fsyncSync(fd);
    return "fsync-confirmed";
  } catch {
    return "directory-handle-unavailable";
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function atomicJson(path, value) {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  writeDurable(temp, Buffer.from(`${JSON.stringify(value)}\n`), "wx");
  renameSync(temp, path);
  return directoryDurability(dirname(path));
}

function resolveRunsRoot(gitCommonDir) {
  if (!isAbsolute(gitCommonDir)) throw new Error("VERIFY-JOURNAL-GIT-COMMON");
  const common = realpathSync(gitCommonDir);
  if (common !== resolve(gitCommonDir)) throw new Error("VERIFY-JOURNAL-GIT-COMMON");
  assertPhysicalDirectory(common);
  const pipeline = join(common, "agent-pipeline");
  const verify = join(pipeline, "verify");
  const runs = join(verify, "runs");
  for (const path of [pipeline, verify, runs]) ensurePrivateDirectory(path);
  return runs;
}

function cleanupReceiptSha256(receipt) { const { receiptSha256: omitted, ...body } = receipt ?? {}; return digestJson(body); }

export function sealVerifyCleanupRegistration(fields) {
  const receipt = { schema: CLEANUP_REGISTRATION_SCHEMA, ...structuredClone(fields), receiptSha256: "0".repeat(64) };
  receipt.receiptSha256 = cleanupReceiptSha256(receipt);
  const keys = ["schema", "status", "runId", "runPath", "sessionId", "descriptorSha256", "resourceId", "registeredAt", "receiptSha256"];
  if (!receipt || Object.keys(receipt).length !== keys.length || Object.keys(receipt).some((key) => !keys.includes(key))
    || receipt.schema !== CLEANUP_REGISTRATION_SCHEMA || receipt.status !== "registered" || !SAFE_ID.test(receipt.runId)
    || !isAbsolute(receipt.runPath) || !SAFE_ID.test(receipt.sessionId) || !SHA256.test(receipt.descriptorSha256)
    || !SAFE_ID.test(receipt.resourceId) || new Date(receipt.registeredAt).toISOString() !== receipt.registeredAt
    || receipt.receiptSha256 !== cleanupReceiptSha256(receipt)) throw new TypeError("VERIFY-CLEANUP-REGISTRATION-INVALID");
  return Object.freeze(receipt);
}

function validateCleanupRegistration(receipt, { runId, runPath }) {
  try {
    const checked = sealVerifyCleanupRegistration({ status: receipt.status, runId: receipt.runId, runPath: receipt.runPath, sessionId: receipt.sessionId, descriptorSha256: receipt.descriptorSha256, resourceId: receipt.resourceId, registeredAt: receipt.registeredAt });
    return checked.receiptSha256 === receipt.receiptSha256 && checked.runId === runId && checked.runPath === runPath;
  } catch { return false; }
}

function registerBoundVerifyRun({ repoRoot, runId, runPath }) {
  let binding;
  try { binding = readOnboardingSessionCleanupBinding({ rootDir: repoRoot }); }
  catch { throw new Error("VERIFY-CLEANUP-REGISTRATION-REQUIRED"); }
  if (binding.status !== "bound" || binding.sessionCleanup === null) {
    throw new Error("VERIFY-CLEANUP-REGISTRATION-REQUIRED");
  }
  const descriptor = loadSessionDescriptor(repoRoot, binding.sessionCleanup.sessionId, {
    expectedDescriptorSha256: binding.sessionCleanup.descriptorSha256,
  });
  const resourceId = `verify-${sha(runId).slice(0, 32)}`;
  registerTemporaryIntent(repoRoot, {
    sessionId: descriptor.sessionId,
    ownerNonce: descriptor.ownerNonce,
    resourceId,
    type: "verify-run-directory",
    path: runPath,
    contentClass: "verify-recovery",
    soleCopy: false,
    cleanupPolicy: "remove-directory",
  });
  return {
    descriptor,
    receipt: sealVerifyCleanupRegistration({
      status: "registered",
      runId,
      runPath,
      sessionId: descriptor.sessionId,
      descriptorSha256: descriptor.descriptorSha256,
      resourceId,
      registeredAt: new Date().toISOString(),
    }),
  };
}

export function createVerifyRun({ gitCommonDir, runId, candidate, policySha256, suites, cleanupRegistration, clock = Date.now }) {
  if (!SAFE_ID.test(runId) || !SHA256.test(policySha256) || !Array.isArray(suites) || suites.length === 0) throw new TypeError("VERIFY-JOURNAL-INPUT");
  planVerifyResume({ runId, candidate, suites, policySha256 });
  const common = assertPhysicalDirectory(realpathSync(gitCommonDir));
  const runDir = join(common, "agent-pipeline", "verify", "runs", runId);
  if (!validateCleanupRegistration(cleanupRegistration, { runId, runPath: runDir })) throw new Error("VERIFY-CLEANUP-REGISTRATION-REQUIRED");
  const runsRoot = resolveRunsRoot(gitCommonDir);
  mkdirSync(runDir, { mode: 0o700 });
  assertPhysicalDirectory(runDir, { privateState: true, created: true });
  const logsDir = join(runDir, "logs");
  const receiptsDir = join(runDir, "receipts");
  ensurePrivateDirectory(logsDir);
  ensurePrivateDirectory(receiptsDir);
  const lockPath = join(runDir, "run.lock");
  const lockFd = openSync(lockPath, "wx", 0o600);
  writeFileSync(lockFd, `${JSON.stringify(verifyRunLock(runId, "active", clock))}\n`);
  fsyncSync(lockFd);
  if (!regularPrivateFile(lockPath)) throw new Error("VERIFY-JOURNAL-LOCK-NOT-PRIVATE");
  const durability = { regularFiles: "fsync-confirmed", directoryEntries: directoryDurability(runDir) };
  const manifest = {
    schema: RUN_MANIFEST_SCHEMA,
    runId,
    candidate,
    policySha256,
    suites: suites.map((suite) => ({ id: suite.id, implementationSha256: suite.implementationSha256, inputs: suite.inputs, environmentContractSha256: suite.environmentContractSha256, dependsOn: suite.dependsOn })),
    cleanupRegistration,
    durability,
    startedAt: now(clock),
    manifestSha256: null,
  };
  const { manifestSha256: omittedManifestSha256, ...manifestBody } = manifest;
  manifest.manifestSha256 = digestJson(manifestBody);
  atomicJson(join(runDir, "manifest.json"), manifest);
  return { runsRoot, runDir, logsDir, receiptsDir, journalPath: join(runDir, "progress.jsonl"), lockPath, lockFd, manifest };
}

function readPrivateBytes(path) {
  try {
    assertPhysicalDirectory(dirname(path), { privateState: true });
    if (!regularPrivateFile(path) || realpathSync(path) !== resolve(path)) return null;
    const before = lstatSync(path);
    const fd = openSync(path, "r");
    try {
      const opened = fstatSync(fd);
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || !opened.isFile() || opened.nlink !== 1 || !ownerMatches(opened)) return null;
      return readFileSync(fd);
    } finally { closeSync(fd); }
  } catch { return null; }
}

function readJson(path) {
  const bytes = readPrivateBytes(path);
  if (bytes === null) return null;
  try { return JSON.parse(bytes.toString("utf8")); } catch { return null; }
}

function validManifest(value, directory) {
  if (!value || value.schema !== RUN_MANIFEST_SCHEMA || value.runId !== basename(directory) || !Array.isArray(value.suites) || !SHA256.test(value.policySha256) || !SHA256.test(value.manifestSha256)) return false;
  const { manifestSha256, ...body } = value;
  return digestJson(body) === manifestSha256
    && validateCleanupRegistration(value.cleanupRegistration, { runId: value.runId, runPath: directory });
}

function reusableRunLock(directory) {
  const lock = readJson(join(directory, "run.lock"));
  if (!validRunLock(lock, basename(directory))) return false;
  return lock.status === "closed" || !processIdentityAlive(lock.pid, lock.processStartId);
}

export function loadVerifyResumeArtifacts({ runsRoot, currentRunId, suites }) {
  const receipts = {};
  const logs = {};
  let directories = [];
  try {
    assertPhysicalDirectory(runsRoot, { privateState: true });
    directories = readdirSync(runsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && entry.name !== currentRunId && SAFE_ID.test(entry.name))
      .map((entry) => {
        const path = join(runsRoot, entry.name);
        assertPhysicalDirectory(path, { privateState: true });
        return { path, mtimeMs: lstatSync(path).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path))
      .map((entry) => entry.path);
  } catch { return { receipts, logs }; }
  for (const suite of suites) {
    for (const directory of directories) {
      try {
        assertPhysicalDirectory(directory, { privateState: true });
        assertPhysicalDirectory(join(directory, "receipts"), { privateState: true });
        assertPhysicalDirectory(join(directory, "logs"), { privateState: true });
      } catch { continue; }
      const manifest = readJson(join(directory, "manifest.json"));
      if (!validManifest(manifest, directory) || !reusableRunLock(directory)
        || !manifest.suites.some((entry) => entry?.id === suite.id)) continue;
      const receipt = readJson(join(directory, "receipts", `${verifySuiteArtifactName(suite.id)}.json`));
      if (!receipt) continue;
      if (receipt.runId !== basename(directory)) {
        receipts[suite.id] = { ...receipt, receiptSha256: "0".repeat(64) };
        break;
      }
      receipts[suite.id] = receipt;
      const logPath = join(directory, "logs", `${verifySuiteArtifactName(suite.id)}.log`);
      const bytes = readPrivateBytes(logPath);
      if (bytes !== null) {
        const relativePath = relative(directory, logPath).split(sep).join("/");
        logs[suite.id] = { path: relativePath, fileSha256: sha(bytes), byteLength: bytes.length, truncated: receipt.log?.truncated === true };
      }
      break;
    }
  }
  return { receipts, logs };
}

export function compileVerifySuites({ repoRoot, suites, candidateTree, environment = process.env }) {
  const environmentContractSha256 = digestJson({
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    execPathSha256: sha(readFileSync(process.execPath)),
    variables: ["NODE_OPTIONS", "PATH", "PIPELINE_PHASE26_RESULT", "PIPELINE_PHASE3_RESULT"].map((name) => ({ name, valueSha256: sha(environment[name] ?? "") })),
  });
  return suites.map((suite) => {
    const absolute = resolve(suite.file);
    const rel = relative(repoRoot, absolute).split(sep).join("/");
    if (rel === "" || rel === ".." || rel.startsWith("../") || !regularPhysicalFile(absolute)) throw new Error(`VERIFY-SUITE-INPUT-UNSAFE:${suite.name}`);
    const implementationSha256 = sha(readFileSync(absolute));
    const inputs = {
      files: [{ path: rel, fileSha256: implementationSha256 }],
      nonFiles: [
        { kind: "candidate-tree", path: null, sha256: sha(candidateTree) },
        { kind: "suite-arguments", path: null, sha256: digestJson(suite.args ?? []) },
      ].sort((a, b) => a.kind.localeCompare(b.kind)),
    };
    return { id: suite.name, implementationSha256, inputs, environmentContractSha256, dependsOn: [...(suite.dependsOn ?? [])].sort() };
  });
}

function appendProgress(run, event, emit) {
  const line = `${JSON.stringify(event)}\n`;
  writeDurable(run.journalPath, Buffer.from(line), "a");
  emit(JSON.stringify(event));
}

function executeSuite({ suite, registration, run, candidate, policySha256, index, total, clock, spawn, emit }) {
  const startedAt = now(clock);
  appendProgress(run, { schema: VERIFY_PROGRESS_SCHEMA, runId: run.manifest.runId, candidate, suite: suite.name, index, total, state: "started", startedAt, completedAt: null, receiptSha256: null, diagnosticDigest: null }, emit);
  const result = spawn(process.execPath, [suite.file, ...(suite.args ?? [])], { encoding: "buffer", cwd: suite.cwd, maxBuffer: MAX_LOG_BYTES });
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? "");
  const diagnostic = result.error ? Buffer.from(`\n[verify-runner-error] ${result.error.code ?? "ERROR"}\n`) : Buffer.alloc(0);
  const combined = Buffer.concat([stdout, stderr, diagnostic]);
  const truncated = result.error?.code === "ENOBUFS" || combined.length > MAX_LOG_BYTES;
  const logBytes = combined.subarray(0, MAX_LOG_BYTES);
  const artifact = verifySuiteArtifactName(suite.name);
  const logPath = join(run.logsDir, `${artifact}.log`);
  writeDurable(logPath, logBytes, "wx");
  const exitCode = truncated ? 1 : (result.status ?? 1);
  const completedAt = now(clock);
  const receipt = sealVerifySuiteReceipt({
    runId: run.manifest.runId,
    candidate,
    suite: suite.name,
    implementationSha256: registration.implementationSha256,
    inputs: registration.inputs,
    environmentContractSha256: registration.environmentContractSha256,
    policySha256,
    status: "completed",
    exitCode,
    log: { path: `logs/${artifact}.log`, fileSha256: sha(logBytes), byteLength: logBytes.length, truncated },
    startedAt,
    completedAt,
  });
  atomicJson(join(run.receiptsDir, `${artifact}.json`), receipt);
  appendProgress(run, { schema: VERIFY_PROGRESS_SCHEMA, runId: run.manifest.runId, candidate, suite: suite.name, index, total, state: "completed", startedAt, completedAt, receiptSha256: receipt.receiptSha256, diagnosticDigest: digestJson({ exitCode, error: result.error?.code ?? null }) }, emit);
  return receipt;
}

function reuseSuite({ suite, registration, sourceReceipt, sourceLog, run, candidate, policySha256, index, total, clock, emit }) {
  const startedAt = now(clock);
  const sourceRunDir = dirname(dirname(resolve(run.runsRoot, sourceReceipt.runId, sourceLog.path)));
  const sourcePath = resolve(sourceRunDir, sourceLog.path);
  if (!sourcePath.startsWith(`${sourceRunDir}${sep}`) || !regularPrivateFile(sourcePath)) throw new Error("VERIFY-REUSE-LOG-UNSAFE");
  const bytes = readPrivateBytes(sourcePath);
  if (bytes === null || sha(bytes) !== sourceLog.fileSha256 || bytes.length !== sourceLog.byteLength || sourceLog.truncated) throw new Error("VERIFY-REUSE-LOG-DRIFT");
  const artifact = verifySuiteArtifactName(suite.name);
  const logPath = join(run.logsDir, `${artifact}.log`);
  writeDurable(logPath, bytes, "wx");
  const completedAt = now(clock);
  const receipt = sealVerifySuiteReceipt({ runId: run.manifest.runId, candidate, suite: suite.name, implementationSha256: registration.implementationSha256, inputs: registration.inputs, environmentContractSha256: registration.environmentContractSha256, policySha256, status: "completed", exitCode: 0, log: { path: `logs/${artifact}.log`, fileSha256: sha(bytes), byteLength: bytes.length, truncated: false }, startedAt, completedAt });
  atomicJson(join(run.receiptsDir, `${artifact}.json`), receipt);
  appendProgress(run, { schema: VERIFY_PROGRESS_SCHEMA, runId: run.manifest.runId, candidate, suite: suite.name, index, total, state: "reused", startedAt, completedAt, receiptSha256: receipt.receiptSha256, diagnosticDigest: digestJson({ sourceRunId: sourceReceipt.runId, sourceReceiptSha256: sourceReceipt.receiptSha256 }) }, emit);
  return receipt;
}

export function runVerifyJournal({ gitCommonDir, repoRoot, candidate, suites, policyInputs, registerRun, clock = Date.now, spawn = spawnSync, emit = console.log, runId = `verify-${Date.now()}-${randomBytes(8).toString("hex")}` }) {
  if (typeof emit !== "function") throw new Error("VERIFY-PROGRESS-EMIT-INVALID");
  const registrations = compileVerifySuites({ repoRoot, suites, candidateTree: candidate.tree });
  const policySha256 = digestJson({ schema: "pipeline.verify-policy.v1", maxLogBytes: MAX_LOG_BYTES, suites: registrations, policyInputs });
  const common = assertPhysicalDirectory(realpathSync(gitCommonDir));
  const runPath = join(common, "agent-pipeline", "verify", "runs", runId);
  const automaticRegistration = typeof registerRun === "function" ? null : registerBoundVerifyRun({ repoRoot, runId, runPath });
  const cleanupRegistration = automaticRegistration?.receipt
    ?? registerRun({ schema: "pipeline.verify-cleanup-registration-request.v1", runId, runPath, candidate, policySha256 });
  if (!validateCleanupRegistration(cleanupRegistration, { runId, runPath })) throw new Error("VERIFY-CLEANUP-REGISTRATION-INVALID");
  const run = createVerifyRun({ gitCommonDir, runId, candidate, policySha256, suites: registrations, cleanupRegistration, clock });
  let terminalWritten = false;
  try {
    const prior = loadVerifyResumeArtifacts({ runsRoot: run.runsRoot, currentRunId: runId, suites: registrations });
    const plan = planVerifyResume({ runId, candidate, suites: registrations, receipts: prior.receipts, logs: prior.logs, policySha256 });
    atomicJson(join(run.runDir, "resume-plan.json"), plan);
    const receiptBySuite = {};
    const steps = [];
    for (const [offset, suite] of suites.entries()) {
      const registration = registrations[offset];
      let receipt;
      if (plan.reusable.includes(suite.name)) receipt = reuseSuite({ suite, registration, sourceReceipt: prior.receipts[suite.name], sourceLog: prior.logs[suite.name], run, candidate, policySha256, index: offset + 1, total: suites.length, clock, emit });
      else receipt = executeSuite({ suite: { ...suite, cwd: repoRoot }, registration, run, candidate, policySha256, index: offset + 1, total: suites.length, clock, spawn, emit });
      receiptBySuite[suite.name] = receipt;
      steps.push({ name: suite.name, exitCode: receipt.exitCode, receiptSha256: receipt.receiptSha256, reused: plan.reusable.includes(suite.name) });
    }
    const completedAt = now(clock);
    const terminal = { schema: RUN_TERMINAL_SCHEMA, runId, candidate, policySha256, planSha256: plan.planSha256, receipts: Object.values(receiptBySuite).map((receipt) => receipt.receiptSha256).sort(), status: steps.every((step) => step.exitCode === 0) ? "passed" : "failed", durability: run.manifest.durability, completedAt, journalSha256: sha(readFileSync(run.journalPath)), terminalSha256: null };
    const { terminalSha256: omittedTerminalSha256, ...terminalBody } = terminal;
    terminal.terminalSha256 = digestJson(terminalBody);
    atomicJson(join(run.runDir, "terminal.json"), terminal);
    terminalWritten = true;
    return { runId, runDir: run.runDir, policySha256, cleanupRegistration, plan, terminal, steps };
  } finally {
    const closed = Buffer.from(`${JSON.stringify(verifyRunLock(runId, "closed", clock))}\n`);
    try { ftruncateSync(run.lockFd, 0); writeSync(run.lockFd, closed, 0, closed.length, 0); fsyncSync(run.lockFd); } finally { closeSync(run.lockFd); }
    if (terminalWritten && automaticRegistration !== null) {
      finalizeTemporaryResource(repoRoot, {
        sessionId: automaticRegistration.descriptor.sessionId,
        ownerNonce: automaticRegistration.descriptor.ownerNonce,
        resourceId: cleanupRegistration.resourceId,
        canaryRelative: "terminal.json",
      });
    }
  }
}
