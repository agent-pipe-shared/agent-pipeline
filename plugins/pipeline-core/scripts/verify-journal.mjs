#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { createHash, randomBytes } from "node:crypto";
import { closeSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync, writeSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawn as spawnChildProcess, spawnSync } from "node:child_process";
import { isSuccessfulSpawn } from "../lib/successful-spawn.mjs";
import {
  VERIFY_PROGRESS_SCHEMA,
  digestJson,
  planVerifyResume,
  sealVerifySuiteReceipt,
  validateVerifySuiteReceipt,
} from "../lib/verify-resume.mjs";
import { parseVerifyCaseCompletion, validateVerifyCaseCompletionPolicy } from "../lib/verify-case-completion-receipt.mjs";
import { readOnboardingSessionCleanupBinding } from "../lib/onboarding-continuity.mjs";
import { finalizeTemporaryResource, loadSessionDescriptor, registerTemporaryIntent } from "../lib/worktree-lifecycle.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";
import { registerVerifyRunRecord, settleVerifyRunRecord, sweepStaleVerifyRunRecords } from "../lib/verify-run-record.mjs";

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

function linuxProcessGroupIdentity(pid) {
  if (process.platform !== "linux") return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/u);
    return { pid, state: fields[0], pgrp: Number(fields[2]), session: Number(fields[3]), startId: fields[19] };
  } catch { return null; }
}

function linuxProcessGroupMembers(groupId) {
  if (process.platform !== "linux") return null;
  let names;
  try { names = readdirSync("/proc"); } catch { return null; }
  const members = [];
  for (const name of names) {
    if (!/^\d+$/u.test(name)) continue;
    const identity = linuxProcessGroupIdentity(Number(name));
    if (identity?.pgrp === groupId) members.push(identity);
  }
  return members;
}

function delay(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)); }

async function terminateOwnedGroup(child, identity, graceMs = 750) {
  if (process.platform !== "linux" || !identity || identity.pid !== child.pid
    || identity.pgrp !== child.pid || identity.session !== child.pid) {
    try { child.kill("SIGTERM"); } catch {}
    return { proven: false, identity, remaining: null, method: "direct-child-only" };
  }
  const current = linuxProcessGroupIdentity(child.pid);
  if (!current || current.startId !== identity.startId || current.pgrp !== identity.pgrp || current.session !== identity.session) {
    return { proven: false, identity, remaining: null, method: "identity-drift" };
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error?.code !== "ESRCH") return { proven: false, identity, remaining: null, method: "term-refused" }; }
  await Promise.race([new Promise((resolveClose) => child.once("close", resolveClose)), delay(graceMs)]);
  let remaining = linuxProcessGroupMembers(child.pid);
  if (remaining === null) return { proven: false, identity, remaining: null, method: "group-read-unavailable" };
  if (remaining.length > 0) {
    const currentLeader = linuxProcessGroupIdentity(child.pid);
    if (currentLeader && currentLeader.startId !== identity.startId) return { proven: false, identity, remaining, method: "identity-drift" };
    try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error?.code !== "ESRCH") return { proven: false, identity, remaining, method: "kill-refused" }; }
    await Promise.race([new Promise((resolveClose) => child.once("close", resolveClose)), delay(graceMs)]);
    remaining = linuxProcessGroupMembers(child.pid);
  }
  return { proven: Array.isArray(remaining) && remaining.length === 0, identity, remaining, method: "verified-process-group" };
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

// ALFRED-RDY-20261005 (PO decision "Readiness root fix", 2026-10-05): Verify is a tool run, not a
// session. A session-less checkout (no bound session cleanup to borrow -- a CI runner, or a repository
// whose session never bound one) no longer starts a session descriptor or a cleanup binding for the
// run. The run records its own cleanup duty ("remove the unsealed run directory") in a separate private
// run record (lib/verify-run-record.mjs) with PID and process start evidence. A killed run leaves a
// STALE record that the next Verify (or a typed sweep) settles without a signature, and no run record
// is ever visible to session readiness. An existing bound session cleanup is still BORROWED for the
// run directory intent exactly as before and is never released here.
export function ensureVerifyRunRecordsDirectory(directory) {
  for (const path of [dirname(dirname(directory)), dirname(directory), directory]) ensurePrivateDirectory(path);
}

function registerRunRecordOwner({ gitCommonDir, runId, runPath }) {
  let written;
  try {
    written = registerVerifyRunRecord({
      gitCommonDir,
      runId,
      runPath,
      processStartId: processStartIdentity(process.pid),
      ensureDirectory: ensureVerifyRunRecordsDirectory,
    });
  } catch { throw new Error("VERIFY-CLEANUP-REGISTRATION-REQUIRED"); }
  return {
    descriptor: null,
    owner: null,
    runRecord: { gitCommonDir, runId },
    receipt: sealVerifyCleanupRegistration({
      status: "registered",
      runId,
      runPath,
      sessionId: `verify-run-${sha(runId).slice(0, 32)}`,
      descriptorSha256: written.recordSha256,
      resourceId: `verify-${sha(runId).slice(0, 32)}`,
      registeredAt: new Date().toISOString(),
    }),
  };
}

function registerBoundVerifyRun({ repoRoot, gitCommonDir, runId, runPath }) {
  let binding;
  try { binding = readOnboardingSessionCleanupBinding({ rootDir: repoRoot }); }
  catch { throw new Error("VERIFY-CLEANUP-REGISTRATION-REQUIRED"); }
  if (binding.status !== "bound" || binding.sessionCleanup === null) {
    return registerRunRecordOwner({ gitCommonDir, runId, runPath });
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
    owner: null,
    runRecord: null,
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

function pathPresent(path) {
  try { lstatSync(path); return true; } catch (error) { return error?.code !== "ENOENT"; }
}

// Idempotent close of the run lock; a lock still marked active by a live writer (this very process)
// would otherwise make the registered run directory un-drainable.
function closeRunLock(run, runId, clock) {
  if (run.lockClosed === true) return;
  run.lockClosed = true;
  const closed = Buffer.from(`${JSON.stringify(verifyRunLock(runId, "closed", clock))}\n`);
  try { ftruncateSync(run.lockFd, 0); writeSync(run.lockFd, closed, 0, closed.length, 0); fsyncSync(run.lockFd); } finally { closeSync(run.lockFd); }
}

const OWNER_EXIT_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"].filter((name) => name in osConstants.signals);

// While this invocation owns a session descriptor + binding it also owns the way the process can
// end around it. The FIRST termination signal asks the run to wind down gracefully (the child
// group is stopped and the interruption sealed by the normal path) and, unless the caller's own
// `signal` already handles that delivery, the process then exits with the conventional 128+signo
// code once the owner is retired. A SECOND signal forces the exit immediately; the `exit` listener
// -- which also covers an uncaught exception and any process.exit() -- retires the owner
// synchronously on the way out. Native Windows cannot deliver SIGINT/SIGTERM to a handler via
// kill(), but console Ctrl+C, Ctrl+Break (SIGBREAK) and console close (SIGHUP) do reach it.
function guardInvocationOwnerExit({ callerSignal, cancellation, retire }) {
  let deliveries = 0;
  let exitSignal = null;
  const onExit = () => {
    try { retire(); } catch (error) {
      try { process.stderr.write(`VERIFY-OWNER-CLEANUP-REQUIRED: ${error?.message ?? error}\n`); } catch { /* nothing left to report to */ }
    }
  };
  const listeners = OWNER_EXIT_SIGNALS.map((name) => {
    const listener = () => {
      deliveries += 1;
      if (deliveries > 1) process.exit(128 + osConstants.signals[name]);
      if (callerSignal?.aborted !== true) exitSignal = name;
      cancellation.abort(name);
    };
    process.on(name, listener);
    return [name, listener];
  });
  process.on("exit", onExit);
  return {
    exitCode: () => (exitSignal === null ? null : 128 + osConstants.signals[exitSignal]),
    dispose() {
      for (const [name, listener] of listeners) process.removeListener(name, listener);
      process.removeListener("exit", onExit);
    },
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
    suites: suites.map((suite) => ({ id: suite.id, implementationSha256: suite.implementationSha256, inputs: suite.inputs, environmentContractSha256: suite.environmentContractSha256, dependsOn: suite.dependsOn, caseCompletion: suite.caseCompletion ?? null })),
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

// ADR-0065 candidate (b): Tier-B narrowing is a lookup keyed by suite name/id, not a suite
// registration field -- so opting a suite in never needs an edit to the top-level Verify entry
// point (TP-3-protected, no active Guard Maintenance Window this session; its own TP-3 guard
// pattern matches only that one file, so this file and its own test are unaffected). A suite
// absent from this table stays Tier A. The default table is overridable via
// compileVerifySuites/runVerifyJournal's `tierBDeclarations` parameter purely so tests can
// exercise the mechanism against a synthetic suite without ever touching this production table.
const TIER_B_DECLARATIONS = Object.freeze({
  // Confirmed live before this dispatch: this suite performs zero filesystem/child-process I/O
  // beyond importing its one dependency, and needs no --allow-fs-write at all.
  "human-role-label-tests": Object.freeze({
    reads: Object.freeze([
      "plugins/pipeline-core/lib/human-role-labels.mjs",
      "plugins/pipeline-core/lib/human-role-labels.test.mjs",
    ]),
  }),
  // ADR-0065 candidate (c): same shape as human-role-label-tests above. Confirmed live before
  // this dispatch: recovery-preview-attestation.mjs has zero imports of its own (pure module,
  // no fs/child_process), so its test's entire real input is these two files; no --allow-fs-write
  // needed.
  "recovery-preview-attestation-tests": Object.freeze({
    reads: Object.freeze([
      "plugins/pipeline-core/lib/recovery-preview-attestation.mjs",
      "plugins/pipeline-core/lib/recovery-preview-attestation.test.mjs",
    ]),
  }),
  // ADR-0065 candidate (c), continuation (AGY-SWEEP-every-gate-binds-whole-tree). Same shape,
  // one of the eight candidates the 2026-08-19 progress note left for "the next dispatch in this
  // series" -- two of the eight (check-ownership-tests, sdlc-efficiency-metrics-tests) were
  // rejected this dispatch: their source pair lives outside the plugin tree, in a source-only
  // top-level script directory this table (itself inside the plugin tree) must not reference --
  // the repo's consumer-safe-paths check correctly flags that. This table stays self-referencing.
  // Confirmed live before this dispatch: control-catalog-migration.mjs has zero imports of its
  // own, and its test file imports only "node:assert/strict" plus this one module -- no fs, no
  // child_process, no os.tmpdir -- so its entire real input is these two files; confirmed by a
  // real `node --permission --allow-fs-read=<src> --allow-fs-read=<test> <test>` run (exit 0, no
  // other grant).
  "control-catalog-migration-tests": Object.freeze({
    reads: Object.freeze([
      "plugins/pipeline-core/lib/control-catalog-migration.mjs",
      "plugins/pipeline-core/lib/control-catalog-migration.test.mjs",
    ]),
  }),
  // Same dispatch, same shape. Confirmed live before this dispatch: critic-packet-governance.mjs
  // has zero imports of its own, and its test file imports only "node:assert/strict" plus this
  // one module -- no fs, no child_process, no os.tmpdir -- so its entire real input is these two
  // files; confirmed by a real `node --permission --allow-fs-read=<src> --allow-fs-read=<test>
  // <test>` run (7/7 checks passed, no other grant).
  "critic-packet-governance-tests": Object.freeze({
    reads: Object.freeze([
      "plugins/pipeline-core/lib/critic-packet-governance.mjs",
      "plugins/pipeline-core/lib/critic-packet-governance.test.mjs",
    ]),
  }),
  // ADR-0065 candidate (c), continuation (NVA-W2-TIERBDECL). Same shape, one of the two
  // remaining named candidates from the 2026-08-25 progress note that were audited but not yet
  // live-permission-tested. Confirmed live before this dispatch: parallel-dispatch-planner.mjs
  // has zero imports of its own, and its test file imports only "node:assert/strict" plus this
  // one module -- no fs, no child_process, no os.tmpdir -- so its entire real input is these two
  // files; confirmed by a real `node --permission --allow-fs-read=<src> --allow-fs-read=<test>
  // <test>` run (10/10 checks passed, no other grant).
  "parallel-dispatch-planner-tests": Object.freeze({
    reads: Object.freeze([
      "plugins/pipeline-core/lib/parallel-dispatch-planner.mjs",
      "plugins/pipeline-core/lib/parallel-dispatch-planner.test.mjs",
    ]),
  }),
  // ADR-0065 candidate (c), continuation (NVA-CF-BL11-TIERB). Same shape again. Confirmed live
  // before this dispatch: backlog-dispatch-reference.mjs has zero imports of its own, and its
  // test file imports only "node:assert/strict" and "node:test" plus this one module -- no fs,
  // no child_process, no os.tmpdir -- so its entire real input is these two files; confirmed by
  // a real `node --permission --allow-fs-read=<src> --allow-fs-read=<test> <test>` run (12/12
  // checks passed, no other grant).
  "backlog-dispatch-reference-tests": Object.freeze({
    reads: Object.freeze([
      "plugins/pipeline-core/lib/backlog-dispatch-reference.mjs",
      "plugins/pipeline-core/lib/backlog-dispatch-reference.test.mjs",
    ]),
  }),
});

function tierBDeclaredFiles({ suite, rel, implementationSha256, repoRoot, declaration }) {
  const byPath = new Map([[rel, implementationSha256]]);
  for (const declaredPath of declaration.reads ?? []) {
    const absolute = resolve(repoRoot, declaredPath);
    const declaredRel = relative(repoRoot, absolute).split(sep).join("/");
    if (declaredRel === "" || declaredRel === ".." || declaredRel.startsWith("../") || !regularPhysicalFile(absolute)) {
      throw new Error(`VERIFY-SUITE-TIER-B-INPUT-UNSAFE:${suite.name}`);
    }
    if (!byPath.has(declaredRel)) byPath.set(declaredRel, sha(readFileSync(absolute)));
  }
  return [...byPath.entries()]
    .map(([path, fileSha256]) => ({ path, fileSha256 }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function compileVerifySuites({ repoRoot, suites, candidateTree, environment = process.env, tierBDeclarations = TIER_B_DECLARATIONS }) {
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
    const dependsOn = [...(suite.dependsOn ?? [])].sort();
    const caseCompletion = suite.caseCompletion ?? null;
    if (!validateVerifyCaseCompletionPolicy(caseCompletion) && caseCompletion !== null) throw new Error(`VERIFY-SUITE-CASE-COMPLETION-INVALID:${suite.name}`);
    const declaration = tierBDeclarations[suite.name] ?? null;
    // "suite-dependencies" applies to every suite regardless of tier: it restores the one check
    // that dropping `suites: registrations` from policySha256 (below) would otherwise silently
    // lose -- a suite's OWN dependsOn list changing now invalidates its OWN receipt via
    // declared-input-drift instead of via the removed whole-policy digest.
    const sharedNonFiles = [
      { kind: "suite-arguments", path: null, sha256: digestJson(suite.args ?? []) },
      ...(caseCompletion === null ? [] : [{ kind: "suite-case-completion", path: null, sha256: digestJson(caseCompletion) }]),
      { kind: "suite-dependencies", path: null, sha256: digestJson(dependsOn) },
    ];
    // Tier A (ADR-0065 Decision 2, the default -- every suite not named in tierBDeclarations):
    // the suite still declares the repository root via "declared-tree:root", so behaviour stays
    // provably unchanged -- any candidate whose tree differs at all produces a different sha256
    // here and the suite still re-runs.
    // Tier B (this candidate, one suite only): "declared-tree:*" is dropped entirely, never
    // replaced by a `declared-tree:<slug>` subtree digest -- a suite whose real input is a small,
    // named set of leaf files needs no subtree form (that form is candidate (c)'s job, for a
    // suite whose declared input is a real subtree). `executeSuite` derives the exact Node
    // --permission grant from this same `inputs.files` list at run time (isTierBRegistration/
    // tierBSpawnFlags below), so the declaration and the runtime grant can never drift apart --
    // there is only one list, read once here and consulted again there.
    const inputs = declaration
      ? { files: tierBDeclaredFiles({ suite, rel, implementationSha256, repoRoot, declaration }), nonFiles: [...sharedNonFiles].sort((a, b) => a.kind.localeCompare(b.kind)) }
      : { files: [{ path: rel, fileSha256: implementationSha256 }], nonFiles: [{ kind: "declared-tree:root", path: null, sha256: sha(candidateTree) }, ...sharedNonFiles].sort((a, b) => a.kind.localeCompare(b.kind)) };
    return { id: suite.name, implementationSha256, inputs, environmentContractSha256, dependsOn, caseCompletion };
  });
}

function appendProgress(run, event, emit) {
  const line = `${JSON.stringify(event)}\n`;
  writeDurable(run.journalPath, Buffer.from(line), "a");
  emit(JSON.stringify(event));
}

// ADR-0065 candidate (b): a registration is Tier B iff it declares no "declared-tree:*" input --
// compileVerifySuites is the sole producer of registrations and only ever omits that kind for a
// suite named in tierBDeclarations. The exact Node --permission grant is derived below from the
// SAME `inputs.files` list the receipt itself carries, so the declaration and the runtime grant
// can never disagree with each other -- there is nothing here to keep in sync by hand. A Tier-B
// suite is NEVER given --allow-child-process (ADR-0065 Decision clarification 2, hard rule,
// Risk paragraph): this function has no parameter for one and never emits one, under any
// declaration.
function isTierBRegistration(registration) {
  return !registration.inputs.nonFiles.some((entry) => entry.kind.startsWith("declared-tree:"));
}

function tierBSpawnFlags(registration, repoRoot) {
  return ["--permission", ...registration.inputs.files.map((file) => `--allow-fs-read=${resolve(repoRoot, file.path)}`)];
}

// AGY-VERIFYTUNER-1: the async worker-pool's real child-process transport. Wraps
// `child_process.spawn` in a Promise, deliberately mirroring `spawnSync`'s return shape
// (`{ status, stdout, stderr, error }`) so `executeSuite` below needs no branching between a
// synchronous test mock and a real spawn -- `await spawn(...)` resolves either identically.
// `maxBuffer` is enforced by hand (spawn has no native equivalent to spawnSync's maxBuffer):
// once accumulated stdout+stderr crosses it, the child is killed and an ENOBUFS-shaped error is
// attached, matching spawnSync's own overflow signal that `executeSuite`'s truncation check
// already reads (`result.error?.code === "ENOBUFS"`).
function spawnAsync(command, argv, options = {}) {
  return new Promise((resolvePromise) => {
    const maxBuffer = typeof options.maxBuffer === "number" ? options.maxBuffer : Infinity;
    let child;
    try {
      const completion = options.caseCompletion ?? null;
      child = spawnChildProcess(command, argv, {
        cwd: options.cwd,
        env: options.env,
        stdio: completion === null ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe", "pipe"],
        detached: options.signal instanceof AbortSignal,
      });
    } catch (error) {
      resolvePromise({ status: null, closeStatusProved: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error });
      return;
    }
    const stdoutChunks = [];
    const stderrChunks = [];
    const completionChunks = [];
    // Per-stream totals, not a combined one: spawnSync's own `maxBuffer` bounds stdout and
    // stderr INDEPENDENTLY (Node's documented behavior), so a shared counter here would kill a
    // suite that spawnSync would have let pass -- confirmed live regression, delta-4 Critic F3.
    let stdoutTotal = 0;
    let stderrTotal = 0;
    let completionTotal = 0;
    let overflowed = false;
    let spawnError;
    let settled = false;
    let cancellation = null;
    const onAbort = () => {
      if (cancellation !== null) return;
      cancellation = terminateOwnedGroup(child, linuxProcessGroupIdentity(child.pid));
    };
    if (options.signal instanceof AbortSignal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }
    const settle = async (value) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener?.("abort", onAbort);
      resolvePromise({ ...value, cancellation: cancellation === null ? null : await cancellation });
    };
    const collect = (chunks, addLength) => (chunk) => {
      // Data handlers stay attached (never removed) after overflow so the child's pipes keep
      // draining -- detaching them here would let the killed child hang on backpressure.
      if (overflowed) return;
      if (addLength(chunk.length) > maxBuffer) {
        overflowed = true;
        spawnError = Object.assign(new Error("stdout/stderr maxBuffer exceeded"), { code: "ENOBUFS" });
        try { child.kill(); } catch { /* best-effort */ }
        return;
      }
      chunks.push(chunk);
    };
    child.stdout.on("data", collect(stdoutChunks, (length) => (stdoutTotal += length)));
    child.stderr.on("data", collect(stderrChunks, (length) => (stderrTotal += length)));
    if (options.caseCompletion !== null && options.caseCompletion !== undefined) {
      child.stdio[3].on("data", (chunk) => {
        completionTotal += chunk.length;
        if (completionTotal > options.caseCompletion.maxBytes) {
          overflowed = true;
          spawnError = Object.assign(new Error("case completion maxBytes exceeded"), { code: "ECASECOMPLETION" });
          try { child.kill(); } catch { /* best-effort */ }
          return;
        }
        completionChunks.push(chunk);
      });
    }
    child.once("error", (error) => {
      spawnError = spawnError ?? error;
      // WSL can report EPERM before delivering the child's real close status.
      // Preserve that one transport anomaly until close so status 0 remains
      // observable; a genuine spawn error still cannot create a success path.
      if (error?.code === "EPERM") return;
        void settle({ status: null, closeStatusProved: false, stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks), caseCompletion: Buffer.concat(completionChunks), error: spawnError });
    });
    child.once("close", (code, signal) => {
      void settle({ status: code, signal: signal ?? null, closeStatusProved: Number.isSafeInteger(code), stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks), caseCompletion: Buffer.concat(completionChunks), error: spawnError });
    });
  });
}

// AGY-VERIFYTUNER-2: default concurrency resolution. Precedence: an explicit `concurrency`
// argument to runVerifyJournal always wins (unchanged from stage 1); absent that, the env var
// wins over the calibration file, which wins over the hardcoded literal below. A fixed literal
// (not `os.availableParallelism()`) is deliberate: this repo runs on two machines, and a
// machine-derived default would make the wall-clock evidence and the pool width incomparable
// between them on a gate whose whole point is determinism (Advisor guidance, AGY-VERIFYTUNER-2).
const DEFAULT_VERIFY_CONCURRENCY = 8;
function resolveDefaultConcurrency(repoRoot, environment) {
  const envValue = environment?.PIPELINE_VERIFY_CONCURRENCY;
  if (typeof envValue === "string" && envValue.trim() !== "") {
    const parsed = Number(envValue);
    if (Number.isSafeInteger(parsed) && parsed >= 1) return parsed;
  }
  try {
    // project/pipeline.json is this repo's own calibration file (not TP-protected, not owned by
    // this dispatch's scope -- read only, never written by this mechanism). An absent or
    // unpopulated `verifyConcurrency` field is the ordinary case today; it falls through to the
    // hardcoded literal below, exactly like a read failure would.
    const calibration = JSON.parse(readFileSync(join(repoRoot, "project", "pipeline.json"), "utf8"));
    const declared = calibration?.verifyConcurrency;
    if (Number.isSafeInteger(declared) && declared >= 1) return declared;
  } catch { /* no calibration override available -- fall through to the hardcoded default */ }
  return DEFAULT_VERIFY_CONCURRENCY;
}

// AGY-VERIFYTUNER-2: the serial lane. Its STARTING POINT was derived MECHANICALLY
// (scratch/derive-serial-lane.mjs, a throwaway/gitignored script -- not committed; its exact
// patterns are reproduced below so that starting point is auditable without re-running anything)
// by scanning every suite registered in the Pipeline-source Verify entrypoint for three risk
// signals named in the design doc (scratch/stripped-verify-mjs-parallelization.md, "Serial
// lane"):
//   (a) a child_process call invoking "git" with no sign of an isolated fixture directory of its
//       own (mkdtempSync/tmpdir()) -- i.e. it can plausibly race the REAL repo's .git/index.lock;
//   (b) a reference to one of the real production modules/helpers that write under
//       .git/agent-pipeline/** (worktree-lifecycle.mjs, session-cleanup*, human-guard-override.mjs,
//       pipeline-state.mjs, verify-journal.mjs itself, nova-candidate-freeze.mjs,
//       resolveRunsRoot/registerTemporaryIntent);
//   (c) `.listen(` or a hardcoded-port `listen({ port: ... })` shape.
// This is a heuristic sweep, deliberately conservative: a suite the sweep flags is never proven
// unsafe, only plausibly so, and every suite the sweep does NOT flag stays in the ordinary pool.
//
// The set below is NOT what re-running that sweep produces today (it would reproduce 60
// members; the set below has 57). Re-running the sweep alone and trusting its output would
// silently reinstate three members removed since by per-signal assessment, undoing the gate-time
// win that removal bought:
//   - `project-onboarding-v3-tests` (removed `f16ab254`) -- verdict and citations in
//     `backlog/evidence/2026-09-06-nva-b-laneevict-1-signal-verdicts.md`.
//   - `session-cleanup-binding-tests` and `worktree-lifecycle-tests` (removed `fcaf8d5e`) --
//     verdicts and citations in
//     `backlog/evidence/2026-09-06-nva-b-laneevict-2-signal-verdicts.md`.
// One member, `guard-maintenance-window-tests`, clears all three signals and passes solo, but is
// RETAINED anyway for a tooling reason, not a safety one: the evidence-capture tool used to prove
// eviction refuses this suite's self-race output as if a fixture literal in its own test
// description were a leaked host path -- see
// `backlog/items/2026-09-06-the-evidence-capture-tool-refuses-a-fixture-literal-as-if-it-were-a-host-path.md`
// and the per-signal verdict in the LANEEVICT-2 evidence file above.
// Five members -- `codex-sandbox-runtime-tests`, `session-cleanup-power-tests`,
// `session-power-cli-tests`, `session-cleanup-owner-nonce-tests`,
// `lifecycle-ready-enforcement-tests` -- are in the lane UNASSESSED, not unsafe: only signal (c)
// was checked for them (it does not hold), signals (a)/(b) were never evaluated (see the
// LANEEVICT-2 evidence file's "Suites NOT assessed" section).
// Going forward, a member leaves this lane only by per-signal assessment recorded under
// `backlog/evidence/`, with this comment updated in the same commit -- never by re-deriving the
// set from the sweep alone, which would just regenerate the 60-member starting point above.
// Members of this lane run mutually exclusively of EACH OTHER (a dedicated 1-slot semaphore,
// `laneSemaphore` below) but freely concurrently with the rest of the pool -- the risk the sweep
// is defending against (two suites racing the same lock/port) is a risk between lane members,
// not between a lane member and an unrelated suite.
const SERIAL_LANE_SUITES = Object.freeze(new Set([
  "afk-claude-host-tests", "antigravity-pretool-guard-tests", "backlog-state-check",
  "codex-critic-probe-split-tests", "codex-pretool-guard-tests", "codex-sandbox-preflight-host-control-tests",
  "codex-sandbox-preflight-plugin-tests", "codex-sandbox-runtime-tests", "continuity-result-bootstrap-tests",
  "continuity-result-case-migration-tests", "continuity-result-close-tests", "continuity-result-rebind-tests",
  "continuity-state-tests", "critical-human-proof-gate-tests", "doc-contract-check", "gate-strength-guard-tests",
  "guard-devplan-tests", "guard-human-override-tests", "guard-lifecycle-ready-tests", "guard-maintenance-window-tests",
  "guard-testpath-override-tests", "human-guard-override-tests", "lifecycle-ready-enforcement-tests",
  "nova-b2-gitlab-ci-broker-core-tests", "nova-candidate-freeze-tests", "nova-verify-journal-tests",
  "onboarding-continuity-tests", "phase26-invariants-check", "pipeline-start-scratch-lifecycle-tests",
  "pipeline-start-v3-tests", "pipeline-state-approve-announce-tests", "pipeline-state-approve-push-argv-closure-tests",
  "pipeline-state-discard-feature-tests", "pipeline-state-inspect-tests", "pipeline-state-inspection-contract-tests",
  "pipeline-state-rebind-runner-tests", "pipeline-state-reopen-design-tests", "pipeline-state-revocation-tests",
  "pipeline-state-tests", "po-gate-authority-fixture-tests", "po-human-approval-tests", "product-capability-inventory-tests",
  "project-authority-migration-cli-tests", "project-authority-tests",
  "publication-executor-productive-flow-tests", "publication-state-authority-tests", "push-prepare-tests",
  "push-release-flow-docs-contract-tests", "reference-path-check", "repair-map-tests",
  "scoped-verify-registration-tests", "scripts-pipeline-state-tests",
  "session-cleanup-owner-nonce-tests", "session-cleanup-power-tests", "session-cleanup-recovery-tests",
  "session-power-cli-tests", "settings-allowlist-merge-tests",
]));

// AGY-VERIFYTUNER-2: the exclusive lane. Unlike SERIAL_LANE_SUITES (mutually exclusive of EACH
// OTHER, concurrent with everything else), a suite here must run with NOTHING ELSE in flight --
// pool or lane. Found by manual read (not the mechanical sweep above, which scans only the three
// git/agent-pipeline/port signals): `test-tmpdir-budget-tests`
// (plugins/pipeline-core/lib/test-tmpdir-budget.test.mjs, case TB07) directly re-invokes
// test-tmpdir-budget.mjs against THIS repo's real, shared scratch/test-tmp/ directory and asserts
// it is within a fixed byte/entry budget -- exactly the risk the design doc's own "Serial lane"
// section names by name ("this repo already hit a real temp-dir budget failure this session from
// unrelated volume, so N-way concurrent temp-dir churn is a real risk, not hypothetical"). Under
// concurrency, many unrelated pool suites create their own fixtures under that same shared
// directory via mkdtempTestScratch() for the suite's ENTIRE runtime, not briefly -- a live
// transient over-budget flake is a real risk, not a hypothetical one, so this suite runs alone,
// before the pool starts. `test-tmpdir-tests` (test-tmpdir.test.mjs, read in full) was
// deliberately NOT added: its own checks (unique-name non-collision, parent-directory reuse)
// never observe sibling fixture content, so they are immune to concurrent siblings.
export const EXCLUSIVE_SUITES = Object.freeze(new Set([
  "test-tmpdir-budget-tests",
  // Declared predecessor of the exclusive `security-scan`. An exclusive suite may only depend on
  // another exclusive suite (runSuitePool rejects otherwise), so this cheap manifest validation,
  // which has no checkout side effects, runs inside the exclusive phase, in order, before it.
  "validate-manifest",
  // This suite intentionally binds a consumer Verify run to the byte digest of the
  // complete installed plugin tree before and after its nested checks. Any sibling
  // suite that probes a source file in place can otherwise manufacture VEP-DRIFT.
  "verify-evidence-producer-tests",
  // The security suite verifies candidate working-tree cleanliness around all four adapters.
  // A concurrent suite can create and later remove a fixture inside the checkout, making every
  // adapter observe a dirty tree even when Verify itself starts and ends clean. Run this composite
  // security check alone; its required capabilities and scanner policy remain unchanged.
  "security-scan",
]));

// A minimal counting semaphore bounding how many suites may have a child process in flight at
// once. `acquire()` resolves immediately while under the limit; otherwise it queues and is woken
// FIFO by the next `release()`. This is the sole mechanism enforcing `concurrency` -- dependsOn
// gating (below, in runSuitePool) is a separate, independent constraint on top of it.
function createSemaphore(limit) {
  let active = 0;
  const queue = [];
  return {
    acquire() {
      if (active < limit) { active += 1; return Promise.resolve(); }
      return new Promise((resolve) => queue.push(resolve)).then(() => { active += 1; });
    },
    release() {
      active -= 1;
      const next = queue.shift();
      if (next) next();
    },
  };
}

// AGY-VERIFYTUNER-1: the bounded async worker pool. Every suite's own `runOne` first awaits its
// dependsOn suites' completion (execute or reuse, success or failure -- "completed" only, never
// "passed"), matching the briefing's scheduling gate; only a suite taking the execute path then
// acquires a pool slot (reuse has no child process, so it runs inline/eagerly once its
// dependencies clear, spending no concurrency slot). `steps[]` is written positionally at each
// suite's own registration-order `offset`, so its final order is always registration order
// regardless of real start/completion order -- the property the briefing calls out explicitly as
// what keeps `evidence/verify-latest.json` diff-stable between runs of the same candidate.
//
// No separate cycle guard is added here: `createVerifyRun` (called earlier in runVerifyJournal,
// before this function ever runs) already calls `planVerifyResume`, whose own `assertAcyclic`
// rejects a cyclic or self-referential dependsOn -- and `planVerifyResume` also rejects a
// dependsOn naming an id absent from the suite list -- so `completion.get(name)?.promise ??
// Promise.resolve()` below can never actually fall through to its fallback for a suite that
// reached this function; it stays only as defensive belt-and-braces, never load-bearing.
//
// AGY-VERIFYTUNER-2: two lanes layer on top of the stage-1 mechanism above, both keyed by suite
// NAME (never by offset, so they apply identically regardless of registration order):
//   - `exclusiveSuites` members run in a dedicated PRE-PHASE, one at a time, strictly before the
//     concurrent phase below even starts -- nothing else (pool or lane) is in flight while they
//     run. Their own dependsOn, if any, must resolve within the exclusive phase itself (asserted
//     up front, fails fast rather than deadlocking); none of today's registered suites define one.
//   - `serialLaneSuites` members share ONE dedicated 1-slot semaphore (`laneSemaphore`) instead of
//     the main pool semaphore, so they never overlap EACH OTHER, but still run concurrently
//     alongside ordinary pool suites during the concurrent phase.
async function runSuitePool({ suites, registrations, plan, prior, run, candidate, policySha256, clock, spawn, concurrency, repoRoot, signal = null, serialLaneSuites = SERIAL_LANE_SUITES, exclusiveSuites = EXCLUSIVE_SUITES }) {
  const total = suites.length;
  const steps = new Array(total);
  const receiptBySuite = {};
  const semaphore = createSemaphore(concurrency);
  const laneSemaphore = createSemaphore(1);
  const completion = new Map(suites.map((suite) => {
    let resolveFn;
    const promise = new Promise((resolve) => { resolveFn = resolve; });
    return [suite.name, { promise, resolveFn }];
  }));
  const closeProofBySuite = new Map();
  const childEvidence = [];
  const registrationByName = new Map(suites.map((suite, offset) => [suite.name, registrations[offset]]));
  for (const suite of suites) {
    if (!exclusiveSuites.has(suite.name)) continue;
    const badDependency = (registrationByName.get(suite.name)?.dependsOn ?? []).find((name) => !exclusiveSuites.has(name));
    if (badDependency) throw new Error(`VERIFY-EXCLUSIVE-SUITE-DEPENDS-ON-POOL-SUITE:${suite.name}->${badDependency}`);
  }
  async function runOne(suite, offset, gate) {
    if (signal?.aborted) return;
    const registration = registrations[offset];
    await Promise.all((registration.dependsOn ?? []).map((name) => completion.get(name)?.promise ?? Promise.resolve()));
    if (signal?.aborted) { completion.get(suite.name).resolveFn(); return; }
    let receipt;
    const reused = plan.reusable.includes(suite.name);
    if (reused) {
      receipt = reuseSuite({ suite, registration, sourceReceipt: prior.receipts[suite.name], sourceLog: prior.logs[suite.name], run, candidate, policySha256, index: offset + 1, total, clock });
      closeProofBySuite.set(suite.name, true);
    } else {
      await gate.acquire();
      try {
        if (signal?.aborted) return;
        const execution = await executeSuite({ suite: { ...suite, cwd: repoRoot }, registration, run, candidate, policySha256, index: offset + 1, total, clock, spawn, signal });
        if (execution.interrupted) {
          childEvidence.push(execution.childEvidence);
          closeProofBySuite.set(suite.name, execution.groupCloseProved);
          completion.get(suite.name).resolveFn();
          return;
        }
        receipt = execution.receipt;
        closeProofBySuite.set(suite.name, execution.childCloseProved);
      } finally {
        gate.release();
      }
    }
    receiptBySuite[suite.name] = receipt;
    steps[offset] = { name: suite.name, exitCode: receipt.exitCode, receiptSha256: receipt.receiptSha256, reused, durationMs: Date.parse(receipt.completedAt) - Date.parse(receipt.startedAt) };
    completion.get(suite.name).resolveFn();
  }
  const exclusiveGate = createSemaphore(1);
  const entries = suites.map((suite, offset) => ({ suite, offset }));
  const exclusiveEntries = entries.filter(({ suite }) => exclusiveSuites.has(suite.name));
  const poolEntries = entries.filter(({ suite }) => !exclusiveSuites.has(suite.name));
  // Exclusive phase: strictly sequential, nothing else scheduled yet -- awaited one at a time
  // rather than via Promise.all so a second exclusive suite never starts before the first's
  // child process (if any) has fully settled.
  for (const { suite, offset } of exclusiveEntries) {
    if (signal?.aborted) break;
    await runOne(suite, offset, exclusiveGate);
  }
  // Concurrent phase: ordinary pool suites use `semaphore` (bounded by `concurrency`); lane
  // suites use the separate `laneSemaphore` (bounded to 1, independent of `concurrency`).
  await Promise.all(poolEntries.map(({ suite, offset }) => runOne(suite, offset, serialLaneSuites.has(suite.name) ? laneSemaphore : semaphore)));
  return { steps: steps.filter(Boolean), receiptBySuite, childCloseProved: [...closeProofBySuite.values()].every((proved) => proved === true), interrupted: signal?.aborted === true, signal: signal?.reason ?? null, childEvidence };
}

async function executeSuite({ suite, registration, run, candidate, policySha256, index, total, clock, spawn, signal = null }) {
  const startedAt = now(clock);
  appendProgress(run, { schema: VERIFY_PROGRESS_SCHEMA, runId: run.manifest.runId, candidate, suite: suite.name, index, total, state: "started", startedAt, completedAt: null, receiptSha256: null, diagnosticDigest: null }, console.log);
  const permissionFlags = isTierBRegistration(registration) ? tierBSpawnFlags(registration, suite.cwd) : [];
  const completionPolicy = registration.caseCompletion ?? null;
  const result = await spawn(process.execPath, [...permissionFlags, suite.file, ...(suite.args ?? [])], {
    encoding: "buffer",
    cwd: suite.cwd,
    maxBuffer: MAX_LOG_BYTES,
    signal,
    env: completionPolicy === null ? undefined : {
      ...process.env,
      PIPELINE_VERIFY_CASE_COMPLETION_FD: "3",
      PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES: String(completionPolicy.maxBytes),
    },
    caseCompletion: completionPolicy,
  });
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? "");
  if (signal?.aborted) {
    const artifact = verifySuiteArtifactName(suite.name);
    const logBytes = Buffer.concat([stdout, stderr]).subarray(0, MAX_LOG_BYTES);
    writeDurable(join(run.logsDir, `${artifact}.interrupted.log`), logBytes, "wx");
    const evidence = { suite: suite.name, childPid: Number.isSafeInteger(result.cancellation?.identity?.pid) ? result.cancellation.identity.pid : null, processStartId: result.cancellation?.identity?.startId ?? null, groupId: result.cancellation?.identity?.pgrp ?? null, terminationMethod: result.cancellation?.method ?? "not-cancelled", groupCloseProved: result.cancellation?.proven === true, remaining: result.cancellation?.remaining ?? null, closeSignal: result.signal ?? null };
    appendProgress(run, { schema: VERIFY_PROGRESS_SCHEMA, runId: run.manifest.runId, candidate, suite: suite.name, index, total, state: "interrupted", startedAt, completedAt: now(clock), receiptSha256: null, diagnosticDigest: digestJson(evidence) }, console.log);
    return { interrupted: true, childEvidence: evidence, groupCloseProved: evidence.groupCloseProved };
  }
  let caseCompletion = null;
  let completionError = null;
  if (completionPolicy !== null) {
    try { caseCompletion = parseVerifyCaseCompletion(Buffer.isBuffer(result.caseCompletion) ? result.caseCompletion : Buffer.from(result.caseCompletion ?? ""), completionPolicy); }
    catch (error) { completionError = error; }
  }
  const diagnostics = [];
  const spawnSucceeded = isSuccessfulSpawn(result);
  if (!spawnSucceeded && result.error) diagnostics.push(`[verify-runner-error] ${result.error.code ?? "ERROR"}`);
  if (completionError) diagnostics.push(`[verify-case-completion-error] ${completionError.message}`);
  const diagnostic = diagnostics.length > 0 ? Buffer.from(`\n${diagnostics.join("\n")}\n`) : Buffer.alloc(0);
  const combined = Buffer.concat([stdout, stderr, diagnostic]);
  const truncated = result.error?.code === "ENOBUFS" || combined.length > MAX_LOG_BYTES;
  const logBytes = combined.subarray(0, MAX_LOG_BYTES);
  const artifact = verifySuiteArtifactName(suite.name);
  const logPath = join(run.logsDir, `${artifact}.log`);
  writeDurable(logPath, logBytes, "wx");
  const exitCode = truncated || completionError !== null
    ? 1
    : (spawnSucceeded ? 0 : (typeof result.status === "number" && result.status !== 0 ? result.status : 1));
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
    caseCompletion,
    startedAt,
    completedAt,
  });
  atomicJson(join(run.receiptsDir, `${artifact}.json`), receipt);
  appendProgress(run, { schema: VERIFY_PROGRESS_SCHEMA, runId: run.manifest.runId, candidate, suite: suite.name, index, total, state: "completed", startedAt, completedAt, receiptSha256: receipt.receiptSha256, diagnosticDigest: digestJson({ exitCode, error: result.error?.code ?? null, caseCompletionError: completionError?.message ?? null }) }, console.log);
  return {
    receipt,
    childCloseProved: spawn === spawnAsync && result.closeStatusProved === true && Number.isSafeInteger(result.status),
  };
}

function reuseSuite({ suite, registration, sourceReceipt, sourceLog, run, candidate, policySha256, index, total, clock }) {
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
  const receipt = sealVerifySuiteReceipt({ runId: run.manifest.runId, candidate, suite: suite.name, implementationSha256: registration.implementationSha256, inputs: registration.inputs, environmentContractSha256: registration.environmentContractSha256, policySha256, status: "completed", exitCode: 0, log: { path: `logs/${artifact}.log`, fileSha256: sha(bytes), byteLength: bytes.length, truncated: false }, caseCompletion: sourceReceipt.caseCompletion ?? null, startedAt, completedAt });
  atomicJson(join(run.receiptsDir, `${artifact}.json`), receipt);
  appendProgress(run, { schema: VERIFY_PROGRESS_SCHEMA, runId: run.manifest.runId, candidate, suite: suite.name, index, total, state: "reused", startedAt, completedAt, receiptSha256: receipt.receiptSha256, diagnosticDigest: digestJson({ sourceRunId: sourceReceipt.runId, sourceReceiptSha256: sourceReceipt.receiptSha256 }) }, console.log);
  return receipt;
}

// AGY-VERIFYTUNER-1: `concurrency` bounds how many suites may have a child process in flight at
// once (see runSuitePool/createSemaphore above). `spawn` defaults to the new async `spawnAsync`
// (not the old `spawnSync`): production's call site never passes its own `spawn`, so the default
// IS the production path, and it must be genuinely async for concurrency > 1 to ever put more
// than one child process in flight.
// AGY-VERIFYTUNER-2: an explicit `concurrency` argument still always wins (unchanged from stage
// 1 -- this is how every stage-1 test above pins its own exact concurrency). Only when the
// caller passes NOTHING -- exactly this repository's top-level Verify entry point's real,
// unmodified call shape (the Pipeline-source Verify entrypoint never passes `concurrency`) -- does the
// default now resolve via `resolveDefaultConcurrency` (env var > project/pipeline.json
// calibration > DEFAULT_VERIFY_CONCURRENCY), raising real production concurrency above 1 for the
// first time. `environment` mirrors compileVerifySuites' own existing convention (defaults to
// `process.env`, overridable so a test never depends on ambient environment or leaks into it).
export async function runVerifyJournal({ gitCommonDir, repoRoot, candidate, suites, policyInputs, registerRun, environment = process.env, clock = Date.now, spawn = spawnAsync, signal = null, runId = `verify-${Date.now()}-${randomBytes(8).toString("hex")}`, tierBDeclarations = TIER_B_DECLARATIONS, allowCrossCandidateReuse = false, reuseReceipts = true, concurrency = resolveDefaultConcurrency(repoRoot, environment), serialLaneSuites = SERIAL_LANE_SUITES, exclusiveSuites = EXCLUSIVE_SUITES }) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new TypeError("VERIFY-JOURNAL-CONCURRENCY");
  if (typeof reuseReceipts !== "boolean") throw new TypeError("VERIFY-JOURNAL-REUSE");
  const registrations = compileVerifySuites({ repoRoot, suites, candidateTree: candidate.tree, tierBDeclarations, environment });
  // ADR-0065 coupling (3): this digest no longer covers `suites: registrations`, so one suite's
  // registration changing no longer invalidates every OTHER suite's receipt via
  // verify-policy-drift. Everything that term contributed per-suite is already checked per-suite
  // by firstDrift (id/implementationSha256/inputs/environmentContractSha256), and dependsOn --
  // the one field nothing else compared -- is now carried as the "suite-dependencies" non-file
  // input inside `inputs` itself (see compileVerifySuites above), so that check is not lost.
  const policySha256 = digestJson({ schema: "pipeline.verify-policy.v1", maxLogBytes: MAX_LOG_BYTES, policyInputs });
  const common = assertPhysicalDirectory(realpathSync(gitCommonDir));
  const runPath = join(common, "agent-pipeline", "verify", "runs", runId);
  // ALFRED-RF1: refuse a reused run id BEFORE any owner exists, so retirement can only ever drain a
  // run directory this invocation itself created.
  // ALFRED-RDY-20261005: settle the stale run records of killed runs first (typed sweep, no signature,
  // never any session state), so this run's own record is the only live one.
  sweepStaleVerifyRunRecords({ gitCommonDir: common, exceptRunId: runId, processAlive: processIdentityAlive });
  if (typeof registerRun !== "function" && pathPresent(runPath)) throw new Error(`VERIFY-JOURNAL-RUN-EXISTS:${runId}`);
  const automaticRegistration = typeof registerRun === "function" ? null : registerBoundVerifyRun({ repoRoot, gitCommonDir: common, runId, runPath });
  const ownsSession = automaticRegistration !== null && automaticRegistration.runRecord !== null;
  let cleanupRegistration;
  let run = null;
  let terminalWritten = false;
  let interruptionWritten = false;
  let childCloseProved = false;
  let ownerRetired = false;
  let primaryFailure = null;
  // The owner's own cancellation channel: it carries the caller's `signal` (when any) plus this
  // module's process-level signal handling, so a signal that reaches an owning run is always
  // wound down through the same interruption path.
  const cancellation = new AbortController();
  let unlinkCallerSignal = null;
  if (ownsSession && signal) {
    if (signal.aborted) cancellation.abort(signal.reason);
    else {
      const forward = () => cancellation.abort(signal.reason);
      signal.addEventListener("abort", forward, { once: true });
      unlinkCallerSignal = () => signal.removeEventListener("abort", forward);
    }
  }
  const effectiveSignal = ownsSession ? cancellation.signal : signal;
  const retireOwner = () => {
    if (ownerRetired) return;
    if (run !== null) closeRunLock(run, runId, clock);
    // `ownsSession` now means "this invocation owns a run record" (no session descriptor exists).
    // Drains the unsealed run directory only; a sealed run is retained evidence.
    settleVerifyRunRecord({ gitCommonDir: automaticRegistration.runRecord.gitCommonDir, runId });
    ownerRetired = true;
  };
  const guard = ownsSession ? guardInvocationOwnerExit({ callerSignal: signal, cancellation, retire: retireOwner }) : null;
  try {
    cleanupRegistration = automaticRegistration?.receipt
      ?? registerRun({ schema: "pipeline.verify-cleanup-registration-request.v1", runId, runPath, candidate, policySha256 });
    if (!validateCleanupRegistration(cleanupRegistration, { runId, runPath })) throw new Error("VERIFY-CLEANUP-REGISTRATION-INVALID");
    run = createVerifyRun({ gitCommonDir, runId, candidate, policySha256, suites: registrations, cleanupRegistration, clock });
    const prior = loadVerifyResumeArtifacts({ runsRoot: run.runsRoot, currentRunId: runId, suites: registrations });
    const plan = planVerifyResume({ runId, candidate, suites: registrations, receipts: prior.receipts, logs: prior.logs, policySha256, allowCrossCandidateReuse, reuseReceipts });
    atomicJson(join(run.runDir, "resume-plan.json"), plan);
    // durationMs (inside runSuitePool) is derived from each receipt's OWN startedAt/completedAt,
    // never borrowed from a prior run's receipt. For a freshly executed suite that is its real
    // wall-clock cost. For a reused suite it is deliberately the (near-zero) cost of the reuse
    // operation itself -- reading and re-sealing the prior log -- because this artifact records
    // what THIS run actually spent, and a stale duration copied from a different run/environment
    // would misrepresent both this run's own timing and how much the reuse mechanism is saving.
    // `steps` is materialized in registration order regardless of real completion order (see
    // runSuitePool's own comment) -- never completion order.
    const pooled = await runSuitePool({ suites, registrations, plan, prior, run, candidate, policySha256, clock, spawn, concurrency, repoRoot, signal: effectiveSignal, serialLaneSuites, exclusiveSuites });
    const { steps, receiptBySuite, childCloseProved: allChildrenClosed } = pooled;
    childCloseProved = allChildrenClosed;
    if (pooled.interrupted) {
      const interruption = {
        schema: "pipeline.verify-run-interruption.v1", runId, candidate, policySha256,
        status: "interrupted", signal: typeof pooled.signal === "string" ? pooled.signal : null,
        startedAt: run.manifest.startedAt, interruptedAt: now(clock),
        children: pooled.childEvidence,
        dispatchedSuiteCount: pooled.childEvidence.length,
        terminal: null,
      };
      const { interruptionSha256: omitted, ...body } = interruption;
      interruption.interruptionSha256 = digestJson(body);
      atomicJson(join(run.runDir, "interruption.json"), interruption);
      interruptionWritten = true;
      return { runId, runDir: run.runDir, policySha256, cleanupRegistration, status: "interrupted", interruption, steps, execution: null };
    }
    const completedAt = now(clock);
    const execution = deriveVerifyExecutionMetrics({
      steps,
      startedAt: run.manifest.startedAt,
      completedAt,
      concurrency,
      serialLaneSuites,
      exclusiveSuites,
    });
    const terminal = { schema: RUN_TERMINAL_SCHEMA, runId, candidate, policySha256, planSha256: plan.planSha256, receipts: Object.values(receiptBySuite).map((receipt) => receipt.receiptSha256).sort(), status: steps.every((step) => step.exitCode === 0) ? "passed" : "failed", durability: run.manifest.durability, completedAt, journalSha256: sha(readFileSync(run.journalPath)), terminalSha256: null };
    const { terminalSha256: omittedTerminalSha256, ...terminalBody } = terminal;
    terminal.terminalSha256 = digestJson(terminalBody);
    atomicJson(join(run.runDir, "terminal.json"), terminal);
    terminalWritten = true;
    return { runId, runDir: run.runDir, policySha256, cleanupRegistration, plan, terminal, steps, execution };
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    try {
      if (run !== null) closeRunLock(run, runId, clock);
      if (!(terminalWritten || interruptionWritten) && ownsSession) {
        // Any exit that sealed neither a terminal nor an interruption (a planning error, a failed
        // run creation, an exception out of the pool): retire the own owner and its unsealed run.
        retireOwner();
      } else if ((terminalWritten || interruptionWritten) && automaticRegistration !== null) {
        const canaryRelative = interruptionWritten ? "interruption.json" : "terminal.json";
        if (automaticRegistration.runRecord === null) {
          finalizeTemporaryResource(repoRoot, {
            sessionId: automaticRegistration.descriptor.sessionId,
            ownerNonce: automaticRegistration.descriptor.ownerNonce,
            resourceId: cleanupRegistration.resourceId,
            canaryRelative,
          });
        } else if (childCloseProved) {
          // The run sealed: its directory is retained evidence, only the run record is retired.
          settleVerifyRunRecord({ gitCommonDir: automaticRegistration.runRecord.gitCommonDir, runId });
          ownerRetired = true;
        } else if (terminalWritten) {
          throw new Error("numeric child close was not proved for every executed suite");
        }
      }
    } catch (error) {
      if (ownsSession) {
        // Keep the original failure visible: it is the diagnosis the caller needs most.
        throw primaryFailure === null
          ? new Error(`VERIFY-OWNER-CLEANUP-REQUIRED:${runId}`, { cause: error })
          : new AggregateError([primaryFailure, error], `VERIFY-OWNER-CLEANUP-REQUIRED:${runId}: ${primaryFailure?.message ?? primaryFailure}`);
      }
      throw error;
    } finally {
      guard?.dispose();
      unlinkCallerSignal?.();
      // A termination signal that nobody else handles ends the process with the conventional code,
      // but only AFTER the owner above has been retired.
      const exitCode = guard?.exitCode() ?? null;
      if (exitCode !== null) process.exit(exitCode);
    }
  }
}

export function deriveVerifyExecutionMetrics({ steps, startedAt, completedAt, concurrency, serialLaneSuites, exclusiveSuites }) {
  if (!Array.isArray(steps)) throw new Error("VERIFY-EXECUTION-METRICS: steps must be an array");
  if (!Number.isSafeInteger(concurrency) || concurrency < 0) {
    throw new Error("VERIFY-EXECUTION-METRICS: concurrency must be a non-negative safe integer");
  }
  const startedAtMs = new Date(startedAt).getTime();
  const completedAtMs = new Date(completedAt).getTime();
  if (!Number.isSafeInteger(startedAtMs) || !Number.isSafeInteger(completedAtMs)) {
    throw new Error("VERIFY-EXECUTION-METRICS: timestamps must be valid dates");
  }
  let executedSuiteDurationMs = 0;
  let reusedSuiteDurationMs = 0;
  const executed = { pool: 0, serial: 0, exclusive: 0 };
  const reused = { pool: 0, serial: 0, exclusive: 0 };
  const includes = (collection, suite) => collection?.has?.(suite) ?? collection?.includes?.(suite) ?? false;

  for (const step of steps) {
    if (typeof step?.name !== "string" || step.name.length === 0) {
      throw new Error("VERIFY-EXECUTION-METRICS: every step needs a name");
    }
    if (!Number.isSafeInteger(step.durationMs) || step.durationMs < 0) {
      throw new Error("VERIFY-EXECUTION-METRICS: every step duration must be a non-negative safe integer");
    }
    if (typeof step.reused !== "boolean") {
      throw new Error("VERIFY-EXECUTION-METRICS: every step reused flag must be boolean");
    }
    if (step.reused) {
      reusedSuiteDurationMs += step.durationMs;
      if (includes(exclusiveSuites, step.name)) reused.exclusive++;
      else if (includes(serialLaneSuites, step.name)) reused.serial++;
      else reused.pool++;
    } else {
      executedSuiteDurationMs += step.durationMs;
      if (includes(exclusiveSuites, step.name)) executed.exclusive++;
      else if (includes(serialLaneSuites, step.name)) executed.serial++;
      else executed.pool++;
    }
  }

  const wallDurationMs = Math.max(0, completedAtMs - startedAtMs);
  const parallelWorkRatio = wallDurationMs > 0 ? executedSuiteDurationMs / wallDurationMs : 0;

  return {
    schema: "pipeline.verify-execution-metrics.v1",
    poolWidth: concurrency,
    wallDurationMs,
    executedSuiteDurationMs,
    reusedSuiteDurationMs,
    executed,
    reused,
    parallelWorkRatio
  };
}
