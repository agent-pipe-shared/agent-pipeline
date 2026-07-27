// SPDX-License-Identifier: SUL-1.0
/** Machine-local, secret-free D1 supervisor-state repair. No worker is launched here. */
import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, parse, posix, relative, resolve, sep, win32 } from "node:path";

export const LOCAL_SUPERVISOR_STATE_SCHEMA = "pipeline.local-supervisor-state.v3";
const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const REPAIRS = new Set(["create", "readback", "recover-owned", "busy", "recovery-required", "noop", "unavailable"]);
const LOCK_SCHEMA = "pipeline.local-supervisor-repair-lock.v1";
const MAX_RECORD_BYTES = 65_536;
const PROCESS_UID = typeof process.getuid === "function" ? process.getuid() : null;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value) => typeof value === "string" && SHA256.test(value);
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : object(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const readJson = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };

export function localSupervisorStateDigest(value) { const { recordSha256: _recordSha256, ...unsigned } = value; return createHash("sha256").update(canonical(unsigned), "utf8").digest("hex"); }
export function sameOwner(left, right) { return left !== null && right !== null && left.nonce === right.nonce && left.pid === right.pid && left.processStartSha256 === right.processStartSha256 && left.bootSha256 === right.bootSha256; }
function validOwner(value) { return value === null || (exact(value, ["nonce", "pid", "processStartSha256", "bootSha256"]) && ID.test(value.nonce) && Number.isSafeInteger(value.pid) && value.pid > 0 && digest(value.processStartSha256) && digest(value.bootSha256)); }

/** Closed record validation; paths and secret bytes are deliberately absent. */
export function validateLocalSupervisorState(value) {
  if (!exact(value, ["schema", "repositoryFingerprint", "candidate", "subject", "revision", "status", "owner", "lease", "repair", "recordSha256"])
    || value.schema !== LOCAL_SUPERVISOR_STATE_SCHEMA || !digest(value.repositoryFingerprint) || !digest(value.candidate) || !ID.test(value.subject)
    || !Number.isSafeInteger(value.revision) || value.revision < 0 || !["ready", "recovery-required"].includes(value.status) || !validOwner(value.owner)
    || !exact(value.lease, ["heartbeatMs", "expiresAtMs", "leaseSha256"]) || !Number.isSafeInteger(value.lease.heartbeatMs) || value.lease.heartbeatMs < 0 || !Number.isSafeInteger(value.lease.expiresAtMs) || value.lease.expiresAtMs < 0 || !digest(value.lease.leaseSha256)
    || !exact(value.repair, ["kind", "evidenceSha256"]) || !REPAIRS.has(value.repair.kind) || !(value.repair.evidenceSha256 === null || digest(value.repair.evidenceSha256))
    || !digest(value.recordSha256) || localSupervisorStateDigest(value) !== value.recordSha256) return { ok: false, code: "LSS-INVALID" };
  if (value.status === "ready" && value.owner !== null) return { ok: false, code: "LSS-OWNER" };
  return { ok: true, code: "LSS-VALID" };
}

export function resolveLocalSupervisorRoot({ platform = process.platform, env = process.env, repositoryFingerprint } = {}) {
  if (!digest(repositoryFingerprint)) return { ok: false, code: "LSS-INPUT", root: null };
  const base = platform === "linux" ? env.XDG_STATE_HOME : platform === "darwin" ? env.HOME && join(env.HOME, "Library", "Application Support") : platform === "win32" ? env.LOCALAPPDATA : null;
  const pathApi = platform === "win32" ? win32 : posix;
  return typeof base === "string" && pathApi.isAbsolute(base) ? { ok: true, code: "LSS-ROOT", root: pathApi.join(base, platform === "win32" ? "Agent-Pipeline" : "agent-pipeline", "v1", repositoryFingerprint) } : { ok: false, code: "LSS-UNAVAILABLE", root: null };
}

export function planLocalSupervisorRepair({ repositoryFingerprint, candidate, subject, existing = null, lock = "available" } = {}) {
  if (!digest(repositoryFingerprint) || !digest(candidate) || !ID.test(subject) || !["available", "foreign", "unknown"].includes(lock)) return { ok: false, code: "LSS-INPUT", plan: null };
  if (lock === "foreign") return { ok: true, code: "LSS-BUSY", plan: { kind: "busy", state: null } };
  if (lock === "unknown") return { ok: true, code: "LSS-RECOVERY-REQUIRED", plan: { kind: "recovery-required", state: null } };
  if (existing === null) return { ok: true, code: "LSS-CREATE", plan: { kind: "create", state: null } };
  const checked = validateLocalSupervisorState(existing);
  return !checked.ok || existing.repositoryFingerprint !== repositoryFingerprint || existing.candidate !== candidate || existing.subject !== subject ? { ok: true, code: "LSS-RECOVERY-REQUIRED", plan: { kind: "recovery-required", state: null } } : { ok: true, code: "LSS-NOOP", plan: { kind: "noop", state: structuredClone(existing) } };
}

export function admitLocalSupervisorCleanup({ record, owner, leaseSha256, manifest, nowMs } = {}) {
  const checked = validateLocalSupervisorState(record);
  return checked.ok && record.owner !== null && sameOwner(record.owner, owner) && record.lease.leaseSha256 === leaseSha256 && Array.isArray(manifest) && manifest.every(digest) && manifest.includes(record.recordSha256) && Number.isSafeInteger(nowMs) && record.lease.expiresAtMs > nowMs ? { ok: true, code: "LSS-CLEANUP-ADMITTED" } : { ok: false, code: "LSS-CLEANUP-DENIED" };
}

function trustedAncestor(stat) {
  // A sticky system directory such as /tmp may host a private descendant, but
  // every non-sticky ancestor must reject group/world write access.
  return stat.isDirectory() && !stat.isSymbolicLink()
    && (((stat.mode & 0o022) === 0) || ((stat.mode & 0o1000) !== 0));
}
function ownedStateDirectory(stat) {
  return trustedAncestor(stat) && Number.isSafeInteger(PROCESS_UID) && stat.uid === PROCESS_UID
    && (stat.mode & 0o022) === 0;
}
function ownedStateFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && Number.isSafeInteger(PROCESS_UID)
    && stat.uid === PROCESS_UID && (stat.mode & 0o022) === 0 && stat.nlink === 1
    && stat.size <= MAX_RECORD_BYTES;
}
function secureDirectoryChain(root, create, allowMissingTail = false) {
  if (typeof root !== "string" || !isAbsolute(root) || resolve(root) !== root) return false;
  try {
    const parsed = parse(root); const parts = relative(parsed.root, root).split(sep).filter(Boolean); let current = parsed.root;
    for (const part of parts) {
      current = join(current, part);
      try {
        const stat = lstatSync(current);
        if (!trustedAncestor(stat)) return false;
      } catch {
        if (allowMissingTail) return true;
        if (!create) return false;
        mkdirSync(current, { mode: 0o700 });
        const stat = lstatSync(current);
        if (!ownedStateDirectory(stat)) return false;
      }
    }
    return ownedStateDirectory(lstatSync(root));
  } catch { return false; }
}
function secureDirectory(root) { return secureDirectoryChain(root, true); }
function secureExistingDirectory(root) { return secureDirectoryChain(root, false); }
function secureExistingOrMissingDirectory(root) { return secureDirectoryChain(root, false, true); }
function safeFile(path) {
  try {
    const stat = lstatSync(path);
    return ownedStateFile(stat) ? { present: true, safe: true } : { present: true, safe: false };
  } catch { return { present: false, safe: false }; }
}
function safeRecord(path) { const entry = safeFile(path); return entry.present && entry.safe ? { ...entry, value: readJson(path) } : { ...entry, value: null }; }
function inspectLock(path, nowMs) { const lock = safeRecord(path); if (!lock.present) return "missing"; return exact(lock.value, ["schema", "nonce", "pid", "expiresAtMs"]) && lock.value.schema === LOCK_SCHEMA && ID.test(lock.value.nonce) && Number.isSafeInteger(lock.value.pid) && lock.value.pid > 0 && Number.isSafeInteger(lock.value.expiresAtMs) && lock.value.expiresAtMs > nowMs ? "busy" : "recovery-required"; }
function writeLock(descriptor, nowMs) { writeFileSync(descriptor, `${JSON.stringify({ schema: LOCK_SCHEMA, nonce: randomBytes(12).toString("hex"), pid: process.pid, expiresAtMs: nowMs + 30_000 })}\n`, { encoding: "utf8" }); fsyncSync(descriptor); }
function recordFor({ repositoryFingerprint, candidate, subject, kind, revision = 0 }) {
  const value = { schema: LOCAL_SUPERVISOR_STATE_SCHEMA, repositoryFingerprint, candidate, subject, revision, status: "ready", owner: null, lease: { heartbeatMs: 0, expiresAtMs: 0, leaseSha256: createHash("sha256").update(`${repositoryFingerprint}\0${candidate}\0${subject}`).digest("hex") }, repair: { kind, evidenceSha256: null }, recordSha256: null };
  value.recordSha256 = localSupervisorStateDigest(value); return value;
}
function syncDirectory(path) { const descriptor = openSync(path, "r"); try { fsyncSync(descriptor); } finally { closeSync(descriptor); } }
function atomicWrite(path, value) { const temporary = `${path}.tmp-${randomBytes(12).toString("hex")}`; const descriptor = openSync(temporary, "wx", 0o600); try { writeFileSync(descriptor, `${JSON.stringify(value)}\n`, { encoding: "utf8" }); fsyncSync(descriptor); } finally { closeSync(descriptor); } renameSync(temporary, path); syncDirectory(dirname(path)); }

/** Read-only preflight used by onboarding and pipeline-start before any state mutation. */
export function planLocalSupervisorFilesystemRepair({ root, repositoryFingerprint, candidate, subject, nowMs = Date.now() } = {}) {
  if (typeof root !== "string" || root === "" || !digest(repositoryFingerprint) || !digest(candidate) || !ID.test(subject)) return { ok: false, code: "LSS-INPUT", disposition: "unavailable", state: null };
  if (!secureExistingOrMissingDirectory(root)) return { ok: false, code: "LSS-UNAVAILABLE", disposition: "unavailable", state: null };
  if (!existsSync(root)) return { ok: true, code: "LSS-CREATE", disposition: "create", state: null };
  if (!secureExistingDirectory(root)) return { ok: false, code: "LSS-UNAVAILABLE", disposition: "unavailable", state: null };
  const lockPath = join(root, "repair.lock"), statePath = join(root, "state.json"), journalPath = join(root, "prepared.json");
  const lock = inspectLock(lockPath, nowMs);
  if (lock === "busy") return { ok: true, code: "LSS-BUSY", disposition: "busy", state: null };
  if (lock === "recovery-required") return { ok: false, code: "LSS-RECOVERY-REQUIRED", disposition: "recovery-required", state: null };
  const existing = safeRecord(statePath);
  if (existing.present) { const plan = planLocalSupervisorRepair({ repositoryFingerprint, candidate, subject, existing: existing.value }); return plan.plan.kind === "noop" ? { ok: true, code: plan.code, disposition: "noop", state: plan.plan.state } : { ok: false, code: "LSS-RECOVERY-REQUIRED", disposition: "recovery-required", state: null }; }
  const journal = safeRecord(journalPath);
  if (journal.present && (journal.value === null || !validateLocalSupervisorState(journal.value).ok || journal.value.repositoryFingerprint !== repositoryFingerprint || journal.value.candidate !== candidate || journal.value.subject !== subject)) return { ok: false, code: "LSS-RECOVERY-REQUIRED", disposition: "recovery-required", state: null };
  return { ok: true, code: journal.present ? "LSS-RECOVER-OWNED" : "LSS-CREATE", disposition: journal.present ? "recover-owned" : "create", state: null };
}

/** Bounded setup/readback: one lock attempt, no retry loop, no worker/process launch. */
export function repairLocalSupervisorState({ root, repositoryFingerprint, candidate, subject, nowMs = Date.now() } = {}) {
  if (typeof root !== "string" || root === "" || !digest(repositoryFingerprint) || !digest(candidate) || !ID.test(subject)) return { ok: false, code: "LSS-INPUT", disposition: "unavailable", state: null };
  if (!secureDirectory(root)) return { ok: false, code: "LSS-UNAVAILABLE", disposition: "unavailable", state: null };
  const lockPath = join(root, "repair.lock"), statePath = join(root, "state.json"), journalPath = join(root, "prepared.json");
  const lockRecord = inspectLock(lockPath, nowMs);
  if (lockRecord === "busy") return { ok: true, code: "LSS-BUSY", disposition: "busy", state: null };
  if (lockRecord === "recovery-required") return { ok: false, code: "LSS-RECOVERY-REQUIRED", disposition: "recovery-required", state: null };
  let lock;
  try { lock = openSync(lockPath, "wx", 0o600); writeLock(lock, nowMs); } catch (error) { if (error?.code !== "EEXIST") return { ok: false, code: "LSS-IO", disposition: "unavailable", state: null }; return inspectLock(lockPath, nowMs) === "busy" ? { ok: true, code: "LSS-BUSY", disposition: "busy", state: null } : { ok: false, code: "LSS-RECOVERY-REQUIRED", disposition: "recovery-required", state: null }; }
  try {
    const current = safeRecord(statePath);
    if (current.present) {
      const planned = planLocalSupervisorRepair({ repositoryFingerprint, candidate, subject, existing: current.value });
      if (planned.plan.kind === "noop") return { ok: true, code: "LSS-NOOP", disposition: "noop", state: planned.plan.state };
      return { ok: false, code: "LSS-RECOVERY-REQUIRED", disposition: "recovery-required", state: null };
    }
    const journal = safeRecord(journalPath); const hasJournal = journal.present;
    const prepared = journal.value;
    if (hasJournal && (prepared === null || !validateLocalSupervisorState(prepared).ok || prepared.repositoryFingerprint !== repositoryFingerprint || prepared.candidate !== candidate || prepared.subject !== subject)) return { ok: false, code: "LSS-RECOVERY-REQUIRED", disposition: "recovery-required", state: null };
    const state = prepared === null ? recordFor({ repositoryFingerprint, candidate, subject, kind: "create" }) : { ...prepared, repair: { ...prepared.repair, kind: "recover-owned" }, recordSha256: null };
    state.recordSha256 = localSupervisorStateDigest(state);
    atomicWrite(journalPath, state); atomicWrite(statePath, state); rmSync(journalPath, { force: true }); syncDirectory(root);
    const readback = readJson(statePath);
    if (!readback || !validateLocalSupervisorState(readback).ok || readback.recordSha256 !== state.recordSha256) return { ok: false, code: "LSS-READBACK", disposition: "recovery-required", state: null };
    return { ok: true, code: prepared === null ? "LSS-CREATE" : "LSS-RECOVER-OWNED", disposition: prepared === null ? "create" : "recover-owned", state: readback };
  } catch { return { ok: false, code: "LSS-IO", disposition: "unavailable", state: null }; } finally { try { closeSync(lock); } catch {} try { rmSync(lockPath, { force: true }); } catch {} }
}
