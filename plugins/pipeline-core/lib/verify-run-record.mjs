// SPDX-License-Identifier: SUL-1.0
//
// ALFRED-RDY-20261005: the Verify run record.
//
// A Verify run is a TOOL run, not a session. It used to borrow the session machinery
// (a session descriptor, a cleanup manifest, a private cleanup binding) to hold its one
// cleanup duty -- "remove this run directory if the run never sealed" -- and a killed
// run therefore left a foreign session descriptor behind that locked every later
// session's readiness (PO decision "Readiness root fix", 2026-10-05).
//
// The run record keeps that duty OUTSIDE session readiness: one small private JSON file
// per run under `<git-common-dir>/agent-pipeline/verify/run-records/`, carrying the run
// id, the exact run directory, and the owning process's PID plus start evidence. Nothing
// here reads or writes a session descriptor, a session manifest or a cleanup binding.
// A record whose owner is dead (or whose PID was reused by another process) is stale and
// is settled by the next Verify run or by a typed sweep -- no signature, never a session
// lock. A sealed run directory (terminal.json / interruption.json) is retained evidence
// and is never deleted here; only an unsealed run directory is drained.

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, rmSync, unlinkSync, writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export const VERIFY_RUN_RECORD_SCHEMA = "pipeline.verify-run-record.v1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const RECORD_KEYS = ["schema", "runId", "runPath", "pid", "processStartId", "startedAt", "cleanupDuty"];

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function verifyRunRecordsDirectory(gitCommonDir) {
  return join(resolve(gitCommonDir), "agent-pipeline", "verify", "run-records");
}

export function verifyRunDirectory(gitCommonDir, runId) {
  return join(resolve(gitCommonDir), "agent-pipeline", "verify", "runs", runId);
}

export function defaultProcessStartIdentity(pid) {
  if (process.platform !== "linux") return `pid-${pid}`;
  try { return readFileSync(`/proc/${pid}/stat`, "utf8").trim().split(" ")[21] || `pid-${pid}`; }
  catch { return `pid-${pid}`; }
}

// Alive unless the PID is provably gone or now belongs to a different process.
export function defaultProcessAlive(pid, processStartId) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); } catch (error) { return error?.code !== "ESRCH"; }
  return defaultProcessStartIdentity(pid) === processStartId;
}

function recordPath(gitCommonDir, runId) {
  if (typeof runId !== "string" || !SAFE_ID.test(runId)) throw new TypeError("VERIFY-RUN-RECORD-ID");
  return join(verifyRunRecordsDirectory(gitCommonDir), `${runId}.json`);
}

function validRecord(value, runId, gitCommonDir) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === RECORD_KEYS.length && RECORD_KEYS.every((key) => key in value)
    && value.schema === VERIFY_RUN_RECORD_SCHEMA && value.runId === runId
    && typeof value.runPath === "string" && isAbsolute(value.runPath)
    && value.runPath === verifyRunDirectory(gitCommonDir, runId)
    && Number.isSafeInteger(value.pid) && value.pid > 0
    && typeof value.processStartId === "string" && value.processStartId.length > 0
    && typeof value.startedAt === "string" && !Number.isNaN(Date.parse(value.startedAt))
    && value.cleanupDuty !== null && typeof value.cleanupDuty === "object"
    && value.cleanupDuty.kind === "remove-unsealed-run-directory" && value.cleanupDuty.path === value.runPath;
}

function writeAtomic(path, bytes) {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const fd = openSync(temp, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
}

/** Record one run and its cleanup duty. Refuses a run id that already has a record. */
export function registerVerifyRunRecord({
  gitCommonDir, runId, runPath, pid = process.pid, processStartId,
  now = () => new Date().toISOString(), ensureDirectory = (path) => mkdirSync(path, { recursive: true, mode: 0o700 }),
}) {
  const path = recordPath(gitCommonDir, runId);
  if (runPath !== verifyRunDirectory(gitCommonDir, runId)) throw new Error("VERIFY-RUN-RECORD-PATH");
  ensureDirectory(dirname(path));
  if (existsSync(path)) throw new Error(`VERIFY-RUN-RECORD-EXISTS:${runId}`);
  const record = {
    schema: VERIFY_RUN_RECORD_SCHEMA,
    runId,
    runPath,
    pid,
    processStartId: processStartId ?? defaultProcessStartIdentity(pid),
    startedAt: now(),
    cleanupDuty: { kind: "remove-unsealed-run-directory", path: runPath },
  };
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
  writeAtomic(path, bytes);
  return { path, record, recordSha256: sha256(bytes) };
}

/** Read every record; a malformed one is reported, never trusted and never thrown on. */
export function readVerifyRunRecords({ gitCommonDir }) {
  const directory = verifyRunRecordsDirectory(gitCommonDir);
  if (!existsSync(directory)) return [];
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name.startsWith(".")) continue;
    const runId = entry.name.slice(0, -".json".length);
    let record = null;
    try {
      const parsed = JSON.parse(readFileSync(join(directory, entry.name), "utf8"));
      if (SAFE_ID.test(runId) && validRecord(parsed, runId, gitCommonDir)) record = parsed;
    } catch { record = null; }
    out.push({ runId, path: join(directory, entry.name), record });
  }
  return out.sort((left, right) => left.runId.localeCompare(right.runId, "en"));
}

function sealed(runPath) {
  return existsSync(join(runPath, "terminal.json")) || existsSync(join(runPath, "interruption.json"));
}

/**
 * Settle one run: drain its run directory only when it never sealed, then retire the
 * record. A sealed run is retained evidence. Idempotent; an absent record is "absent".
 */
export function settleVerifyRunRecord({ gitCommonDir, runId }) {
  const path = recordPath(gitCommonDir, runId);
  const runPath = verifyRunDirectory(gitCommonDir, runId);
  const present = existsSync(path);
  let drained = false;
  let retained = false;
  if (existsSync(runPath)) {
    if (lstatSync(runPath).isSymbolicLink()) throw new Error("VERIFY-RUN-RECORD-UNSAFE-RUN-DIRECTORY");
    if (sealed(runPath)) retained = true;
    else { rmSync(runPath, { recursive: true, force: true }); drained = true; }
  }
  if (present) unlinkSync(path);
  return { status: present ? "retired" : "absent", runId, drainedRunDirectory: drained, retainedSealedRun: retained };
}

/**
 * Typed sweep: settle every record whose owner is provably gone. A live owner is never
 * touched; `exceptRunId` is the caller's own run. Errors are collected, never thrown --
 * a sweep must not fail a Verify run, and it never reads session state.
 */
export function sweepStaleVerifyRunRecords({ gitCommonDir, exceptRunId = null, processAlive = defaultProcessAlive }) {
  const settled = [];
  const retained = [];
  const errors = [];
  for (const entry of readVerifyRunRecords({ gitCommonDir })) {
    if (entry.runId === exceptRunId) continue;
    if (entry.record !== null && processAlive(entry.record.pid, entry.record.processStartId)) { retained.push(entry.runId); continue; }
    try {
      if (entry.record === null) { unlinkSync(entry.path); settled.push(entry.runId); continue; }
      settleVerifyRunRecord({ gitCommonDir, runId: entry.runId });
      settled.push(entry.runId);
    } catch (error) { errors.push({ runId: entry.runId, code: error?.code ?? error?.message ?? "unknown" }); }
  }
  return { schema: "pipeline.verify-run-record-sweep.v1", settled, retained, errors };
}
