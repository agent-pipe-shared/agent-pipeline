// SPDX-License-Identifier: SUL-1.0

/**
 * Private, digest-bound restart state for the Codex onboarding lifecycle.
 * Nothing in this module treats an on-disk projection, a PID, mtime, model
 * output, or App Server health as evidence that a new process loaded it.
 */
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { loadRuntimeProjectionV3OwnedKeys } from "./runtime-projection-v3.mjs";

export const BARRIER_SCHEMA = "pipeline.codex-runtime-restart-barrier.v1";
export const TICKET_SCHEMA = "pipeline.codex-onboarding-launch.v1";
export const READBACK_SCHEMA = "pipeline.codex-project-runtime-readback.v1";
export const CURRENT_READBACK_SCHEMA = "pipeline.codex-project-runtime-current-readback.v1";
const NATIVE_FS = {
  chmodSync, closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync,
  writeFileSync,
};
const HEX = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._-]{1,80}$/u;
const BARRIER_KEYS = [
  "schema", "revision", "priorStateSha256", "repositoryFingerprint", "sourceSha256",
  "runtimeTargets", "runtimeTargetsSha256", "transactionId", "writerGenerationSha256",
  "launcherSha256", "helperSha256", "codexExecutableSha256", "state",
];
const TICKET_KEYS = [
  "schema", "ticketId", "revision", "priorStateSha256", "issuedAtEpochMs", "expiresAtEpochMs",
  "barrierSha256", "repositoryFingerprint", "expectedSourceSha256", "expectedRuntimeTargetsSha256",
  "writerGenerationSha256", "tokenSha256", "state", "consumedBy",
];
const READBACK_KEYS = [
  "schema", "barrierSha256", "repositoryFingerprint", "sourceSha256", "runtimeTargetsSha256",
  "readerGenerationSha256", "effectiveConfigSha256", "validatedAgentsSha256", "ticketId", "observedAtEpochMs",
];
const CURRENT_READBACK_KEYS = [
  "schema", "barrierSha256", "priorBarrierSha256", "repositoryFingerprint",
  "sourceSha256", "runtimeTargetsSha256", "ticketId", "ticketSha256",
  "readerGenerationSha256", "effectiveConfigSha256", "validatedAgentsSha256",
  "observedAtEpochMs", "receiptSha256",
];
const HERE = dirname(fileURLToPath(import.meta.url));
export const LAUNCHER_PATH = join(HERE, "..", "scripts", "codex-onboarding-launch.mjs");
export const HELPER_PATH = join(HERE, "..", "scripts", "codex-project-runtime-readback-host.mjs");

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function canonicalSha256(value) { return sha256(canonicalJson(value)); }

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) throw new Error(`${label} has unexpected fields`);
}
function expectHex(value, label) { if (typeof value !== "string" || !HEX.test(value)) throw new Error(`${label} must be a lowercase SHA-256`); }
function expectId(value, label) { if (typeof value !== "string" || !ID.test(value)) throw new Error(`${label} is invalid`); }
function expectEpoch(value, label) { if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid`); }
function runtimeFilesystem(overrides = {}) { return { ...NATIVE_FS, ...overrides }; }
function physicalDirectory(path, label, fs = NATIVE_FS) {
  const info = fs.lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(path) !== path) throw new Error(`${label} is not a physical directory`);
  return path;
}
function physicalFile(path, label, fs = NATIVE_FS) {
  const info = fs.lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} is not a regular non-symlink file`);
  return path;
}
function safeJoin(root, ...parts) {
  const candidate = resolve(root, ...parts);
  const rel = relative(root, candidate);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw new Error("private-state path escaped its root");
  return candidate;
}
function canonicalRoot(rootDir, fs = NATIVE_FS) {
  const requested = resolve(rootDir);
  const info = fs.lstatSync(requested);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("project root is not a physical directory");
  return fs.realpathSync(requested);
}
function targetPaths() { return loadRuntimeProjectionV3OwnedKeys().targets.filter((target) => target.path.startsWith(".codex/")).map((target) => target.path).sort(); }
function fsyncDirectory(path, fs = NATIVE_FS) {
  let fd;
  try { fd = fs.openSync(path, "r"); fs.fsyncSync(fd); }
  catch (error) {
    if (!(process.platform === "win32" && ["EPERM", "EINVAL", "EISDIR", "ENOTSUP"].includes(error?.code))) throw error;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function directoryIdentity(path, fs = NATIVE_FS) {
  const info = fs.lstatSync(path);
  return { path, dev: String(info.dev), ino: String(info.ino) };
}
function sameDirectoryIdentity(expected, fs = NATIVE_FS) {
  try {
    const info = fs.lstatSync(expected.path);
    return info.isDirectory() && !info.isSymbolicLink() && fs.realpathSync(expected.path) === expected.path
      && String(info.dev) === expected.dev && String(info.ino) === expected.ino;
  } catch { return false; }
}
function sameFileIdentity(expected, fs = NATIVE_FS) {
  try {
    const info = fs.lstatSync(expected.path);
    return info.isFile() && !info.isSymbolicLink() && info.nlink === 1
      && String(info.dev) === expected.dev && String(info.ino) === expected.ino;
  } catch { return false; }
}
function ensurePrivateDirectory(root, parts, createdDirectories = [], createdDirectoryRecords = [], fs = NATIVE_FS) {
  let cursor = root;
  for (const part of parts) {
    cursor = safeJoin(root, relative(root, cursor), part);
    if (!fs.existsSync(cursor)) {
      fs.mkdirSync(cursor, { mode: 0o700 });
      createdDirectories.push(cursor);
      createdDirectoryRecords.push(directoryIdentity(cursor, fs));
    }
    physicalDirectory(cursor, "private-state directory", fs);
    if ((fs.lstatSync(cursor).mode & 0o777) !== 0o700) { fs.chmodSync(cursor, 0o700); }
    if ((fs.lstatSync(cursor).mode & 0o777) !== 0o700) throw new Error("private-state directory is not private");
  }
  return cursor;
}
function readGitCommonDirectory(root, spawn, fs = NATIVE_FS) {
  const result = spawn("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8", shell: false });
  // Some host bridges retain a sanitized spawn error alongside a completed
  // status-0 observation. The exit status plus absolute readback is the closed
  // success contract; a missing/nonzero status remains unavailable.
  if (result?.status !== 0) throw new Error("physical Git common directory is unavailable");
  const raw = String(result.stdout ?? "").trim();
  if (!isAbsolute(raw)) throw new Error("Git common directory was not absolute");
  const common = fs.realpathSync(raw);
  return physicalDirectory(common, "Git common directory", fs);
}

/** Resolve state without creating it; `create` is the only writer path. */
export function resolveOnboardingPrivateState(rootDir, repositoryCapability = "local", {
  create = false,
  spawn = spawnSync,
  createdDirectories = [],
  createdDirectoryRecords = [],
  fs = NATIVE_FS,
} = {}) {
  const root = canonicalRoot(rootDir, fs);
  let base; let parts;
  if (repositoryCapability === "host-managed") {
    const claude = safeJoin(root, ".claude");
    physicalDirectory(claude, ".claude", fs);
    base = claude; parts = [".runtime", "agent-pipeline", "onboarding"];
  } else if (repositoryCapability === "local") {
    base = readGitCommonDirectory(root, spawn, fs);
    parts = ["agent-pipeline", "onboarding"];
  } else throw new Error("repository capability cannot host private runtime state");
  let directory = base;
  for (const part of parts) directory = safeJoin(base, relative(base, directory), part);
  if (create) directory = ensurePrivateDirectory(base, parts, createdDirectories, createdDirectoryRecords, fs);
  else if (fs.existsSync(directory)) physicalDirectory(directory, "private-state directory", fs);
  return {
    root,
    directory,
    barrier: join(directory, "restart-barrier.json"),
    currentReadback: join(directory, "current-readback.json"),
    tickets: join(directory, "tickets"),
    lock: join(directory, ".writer-lock"),
  };
}

function privatePaths(rootDir, repositoryCapability, options = {}) {
  const spawn = options.spawn ?? options.deps?.spawnSync;
  const fs = runtimeFilesystem(options.deps);
  return resolveOnboardingPrivateState(rootDir, repositoryCapability, {
    create: options.create === true,
    spawn,
    createdDirectories: options.createdDirectories,
    createdDirectoryRecords: options.createdDirectoryRecords,
    fs,
  });
}
function readStored(path, validator, label, fs = NATIVE_FS) {
  physicalFile(path, label, fs);
  const info = fs.lstatSync(path);
  if (info.nlink !== 1) throw new Error(`${label} is not singly linked`);
  if ((info.mode & 0o777) !== 0o600) throw new Error(`${label} is not mode 0600`);
  const raw = fs.readFileSync(path);
  let value; try { value = JSON.parse(raw); } catch { throw new Error(`${label} is malformed`); }
  validator(value);
  if (!raw.equals(Buffer.from(canonicalJson(value), "utf8"))) throw new Error(`${label} is not canonically encoded`);
  return {
    value,
    rawSha256: sha256(raw),
    raw,
    path,
    dev: String(info.dev),
    ino: String(info.ino),
  };
}
function publicationPrecondition(path, expected, fs) {
  if (!expected) return;
  if (expected.status === "absent") {
    if (fs.existsSync(path)) throw new Error("private-state publication CAS drifted");
    return;
  }
  if (expected.status !== "present"
    || expected.path !== path
    || !sameFileIdentity(expected, fs)
    || sha256(fs.readFileSync(path)) !== expected.rawSha256) {
    throw new Error("private-state publication CAS drifted");
  }
}
function writeAtomic(path, value, fs = NATIVE_FS, publication = null, expected = null) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const temporary = join(dirname(path), `.${sha256(randomBytes(24)).slice(0, 32)}.tmp`);
  let fd;
  let temporaryIdentity = null;
  let primaryError = null;
  try {
    fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
    const opened = fs.fstatSync(fd);
    temporaryIdentity = { path: temporary, dev: String(opened.dev), ino: String(opened.ino) };
    fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    publicationPrecondition(path, expected, fs);
    fs.renameSync(temporary, path);
    const published = fs.lstatSync(path);
    if (!published.isFile() || published.isSymbolicLink()) throw new Error("published private state is not a physical file");
    if (publication) Object.assign(publication, {
      path, dev: String(published.dev), ino: String(published.ino), sha256: sha256(bytes),
    });
    fs.chmodSync(path, 0o600); fsyncDirectory(dirname(path), fs);
  } catch (error) {
    primaryError = error;
  }
  if (primaryError) {
    const cleanupErrors = [];
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (error) { cleanupErrors.push(error); }
    }
    try {
      if (fs.existsSync(temporary)) {
        if (!temporaryIdentity || !sameFileIdentity(temporaryIdentity, fs)) throw new Error("atomic temporary identity changed");
        fs.unlinkSync(temporary);
        fsyncDirectory(dirname(temporary), fs);
      }
    } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) throw new Error("atomic private-state cleanup failed");
    throw primaryError;
  }
  return sha256(bytes);
}
function withWriterLock(paths, action, fs = NATIVE_FS) {
  if (!fs.existsSync(paths.directory)) throw new Error("private-state directory is unavailable");
  let lockIdentity = null;
  let result;
  let primaryError = null;
  try {
    fs.mkdirSync(paths.lock, { mode: 0o700 });
    lockIdentity = directoryIdentity(paths.lock, fs);
    physicalDirectory(paths.lock, "private-state lock", fs);
    result = action();
  } catch (error) {
    primaryError = error;
  }
  let cleanupError = null;
  if (lockIdentity) {
    try {
      if (!sameDirectoryIdentity(lockIdentity, fs)) throw new Error("private-state lock identity changed");
      fs.rmdirSync(paths.lock);
      fsyncDirectory(paths.directory, fs);
    } catch (error) { cleanupError = error; }
  }
  if (cleanupError) throw new Error("private-state writer lock cleanup failed");
  if (primaryError) throw primaryError;
  return result;
}
function ticketPath(paths, ticketId) { expectId(ticketId, "ticketId"); return safeJoin(paths.tickets, `${ticketId}.json`); }
function ensureTickets(paths, fs = NATIVE_FS) {
  return ensurePrivateDirectory(paths.directory, ["tickets"], [], [], fs);
}
function readLaunchTicketSet(paths, fs = NATIVE_FS) {
  physicalDirectory(paths.tickets, "launch ticket directory", fs);
  if ((fs.lstatSync(paths.tickets).mode & 0o777) !== 0o700) throw new Error("launch ticket directory is not private");
  return fs.readdirSync(paths.tickets, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) throw new Error("launch ticket set contains an unsafe entry");
      const ticketId = entry.name.slice(0, -".json".length);
      expectId(ticketId, "launch ticket filename");
      const stored = readStored(ticketPath(paths, ticketId), validateLaunchTicket, "launch ticket", fs);
      if (stored.value.ticketId !== ticketId) throw new Error("launch ticket filename does not match its identity");
      return stored;
    });
}
function liveLaunchTickets(tickets, barrierSha256, now) {
  return tickets.filter(({ value }) => value.state === "issued"
    && value.barrierSha256 === barrierSha256 && now < value.expiresAtEpochMs);
}
function readSoleLiveLaunchTicket(paths, barrierSha256, ticketId, now, fs = NATIVE_FS) {
  const live = liveLaunchTickets(readLaunchTicketSet(paths, fs), barrierSha256, now);
  if (live.length !== 1 || live[0].value.ticketId !== ticketId) throw new Error("launch ticket is unavailable or replayed");
  return live[0];
}

export function repositoryFingerprint(rootDir) { return canonicalSha256({ root: canonicalRoot(rootDir) }); }
export function validateRuntimeTargets(runtimeTargets) {
  if (!Array.isArray(runtimeTargets) || runtimeTargets.length !== targetPaths().length) throw new Error("runtime target set is incomplete");
  const expected = targetPaths();
  runtimeTargets.forEach((target, index) => {
    exactKeys(target, ["path", "beforeSha256", "afterSha256"], "runtime target");
    if (target.path !== expected[index]) throw new Error("runtime target set is not frozen and sorted");
    if (target.beforeSha256 !== null) expectHex(target.beforeSha256, "runtime target preimage");
    expectHex(target.afterSha256, "runtime target postimage");
  });
  return true;
}
export function validateRestartBarrier(value) {
  exactKeys(value, BARRIER_KEYS, "restart barrier");
  if (value.schema !== BARRIER_SCHEMA || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error("restart barrier schema/revision invalid");
  if (value.revision === 0 ? value.priorStateSha256 !== null : !HEX.test(value.priorStateSha256 ?? "")) throw new Error("restart barrier CAS predecessor invalid");
  for (const key of ["repositoryFingerprint", "sourceSha256", "runtimeTargetsSha256", "writerGenerationSha256", "launcherSha256", "helperSha256", "codexExecutableSha256"]) expectHex(value[key], key);
  expectId(value.transactionId, "transactionId"); validateRuntimeTargets(value.runtimeTargets);
  if (value.runtimeTargetsSha256 !== canonicalSha256(value.runtimeTargets)) throw new Error("restart barrier target digest invalid");
  if (!new Set(["restart-required", "cleared"]).has(value.state)) throw new Error("restart barrier state invalid");
  return true;
}
export function validateLaunchTicket(value) {
  exactKeys(value, TICKET_KEYS, "launch ticket");
  if (value.schema !== TICKET_SCHEMA || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error("launch ticket schema/revision invalid");
  if (value.revision === 0 ? value.priorStateSha256 !== null : !HEX.test(value.priorStateSha256 ?? "")) throw new Error("launch ticket CAS predecessor invalid");
  expectId(value.ticketId, "ticketId"); expectEpoch(value.issuedAtEpochMs, "issuedAtEpochMs"); expectEpoch(value.expiresAtEpochMs, "expiresAtEpochMs");
  if (value.expiresAtEpochMs !== value.issuedAtEpochMs + 300000) throw new Error("launch ticket expiry invalid");
  for (const key of ["barrierSha256", "repositoryFingerprint", "expectedSourceSha256", "expectedRuntimeTargetsSha256", "writerGenerationSha256", "tokenSha256"]) expectHex(value[key], key);
  if (!new Set(["issued", "consumed"]).has(value.state)) throw new Error("launch ticket state invalid");
  if (value.state === "issued" ? value.consumedBy !== null : !value.consumedBy || typeof value.consumedBy !== "object") throw new Error("launch ticket consumer invalid");
  if (value.state === "consumed") {
    exactKeys(value.consumedBy, ["readerGenerationSha256", "effectiveConfigSha256", "validatedAgentsSha256"], "launch ticket consumer");
    for (const key of Object.keys(value.consumedBy)) expectHex(value.consumedBy[key], key);
  }
  return true;
}
export function validateRuntimeReadback(value) {
  exactKeys(value, READBACK_KEYS, "runtime readback");
  if (value.schema !== READBACK_SCHEMA) throw new Error("runtime readback schema invalid");
  for (const key of READBACK_KEYS.filter((key) => key.endsWith("Sha256"))) expectHex(value[key], key);
  expectId(value.ticketId, "ticketId"); expectEpoch(value.observedAtEpochMs, "observedAtEpochMs");
  return true;
}
export function validateCurrentRuntimeReadback(value) {
  exactKeys(value, CURRENT_READBACK_KEYS, "current runtime readback");
  if (value.schema !== CURRENT_READBACK_SCHEMA) throw new Error("current runtime readback schema invalid");
  for (const key of CURRENT_READBACK_KEYS.filter((key) => key.endsWith("Sha256"))) expectHex(value[key], key);
  expectId(value.ticketId, "ticketId");
  expectEpoch(value.observedAtEpochMs, "observedAtEpochMs");
  const receipt = {
    schema: READBACK_SCHEMA,
    barrierSha256: value.priorBarrierSha256,
    repositoryFingerprint: value.repositoryFingerprint,
    sourceSha256: value.sourceSha256,
    runtimeTargetsSha256: value.runtimeTargetsSha256,
    readerGenerationSha256: value.readerGenerationSha256,
    effectiveConfigSha256: value.effectiveConfigSha256,
    validatedAgentsSha256: value.validatedAgentsSha256,
    ticketId: value.ticketId,
    observedAtEpochMs: value.observedAtEpochMs,
  };
  validateRuntimeReadback(receipt);
  if (canonicalSha256(receipt) !== value.receiptSha256) throw new Error("current runtime readback receipt digest invalid");
  return true;
}
function pathDigest(path) { physicalFile(path, "bound runtime executable"); return sha256(readFileSync(path)); }
export function resolveRuntimeExecutable(name = "codex", pathValue = process.env.PATH ?? "") {
  for (const directory of pathValue.split(process.platform === "win32" ? ";" : ":")) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      const executable = realpathSync(candidate);
      return realpathSync(physicalFile(executable, "Codex executable"));
    } catch {}
  }
  throw new Error("Codex executable is unavailable");
}
export function prepareRuntimeRestartBinding({ rootDir, sourceSha256, runtimeTargets, codexExecutable = undefined, random = randomBytes } = {}) {
  expectHex(sourceSha256, "sourceSha256"); validateRuntimeTargets(runtimeTargets);
  const executable = realpathSync(codexExecutable ?? resolveRuntimeExecutable()); physicalFile(executable, "Codex executable");
  return {
    repositoryFingerprint: repositoryFingerprint(rootDir), sourceSha256, runtimeTargets: structuredClone(runtimeTargets),
    runtimeTargetsSha256: canonicalSha256(runtimeTargets), transactionId: random(20).toString("hex"),
    writerGenerationSha256: sha256(random(32)), launcherSha256: pathDigest(LAUNCHER_PATH), helperSha256: pathDigest(HELPER_PATH),
    codexExecutable: executable, codexExecutableSha256: pathDigest(executable),
  };
}
export function readRestartBarrier({ rootDir, repositoryCapability = "local", ...options } = {}) {
  const paths = privatePaths(rootDir, repositoryCapability, options);
  if (!existsSync(paths.directory) || !existsSync(paths.barrier)) return { status: "absent", paths, barrier: null, rawSha256: null };
  const stored = readStored(paths.barrier, validateRestartBarrier, "restart barrier");
  return { status: "present", paths, barrier: stored.value, rawSha256: stored.rawSha256 };
}
export function readCurrentRuntimeReadback({ rootDir, repositoryCapability = "local", ...options } = {}) {
  const paths = privatePaths(rootDir, repositoryCapability, options);
  if (!existsSync(paths.barrier) || !existsSync(paths.currentReadback)) {
    return { status: "absent", paths, barrier: null, marker: null, barrierSha256: null, readbackSha256: null };
  }
  const barrier = readStored(paths.barrier, validateRestartBarrier, "restart barrier");
  const marker = readStored(paths.currentReadback, validateCurrentRuntimeReadback, "current runtime readback");
  if (barrier.value.state !== "cleared"
    || marker.value.barrierSha256 !== barrier.rawSha256
    || marker.value.priorBarrierSha256 !== barrier.value.priorStateSha256
    || marker.value.repositoryFingerprint !== barrier.value.repositoryFingerprint
    || marker.value.sourceSha256 !== barrier.value.sourceSha256
    || marker.value.runtimeTargetsSha256 !== barrier.value.runtimeTargetsSha256) {
    throw new Error("current runtime readback is not bound to the cleared barrier");
  }
  const ticket = readStored(ticketPath(paths, marker.value.ticketId), validateLaunchTicket, "launch ticket");
  if (ticket.rawSha256 !== marker.value.ticketSha256 || ticket.value.state !== "consumed"
    || ticket.value.barrierSha256 !== marker.value.priorBarrierSha256
    || ticket.value.repositoryFingerprint !== marker.value.repositoryFingerprint
    || ticket.value.expectedSourceSha256 !== marker.value.sourceSha256
    || ticket.value.expectedRuntimeTargetsSha256 !== marker.value.runtimeTargetsSha256
    || ticket.value.writerGenerationSha256 !== barrier.value.writerGenerationSha256
    || ticket.value.consumedBy.readerGenerationSha256 !== marker.value.readerGenerationSha256
    || ticket.value.consumedBy.effectiveConfigSha256 !== marker.value.effectiveConfigSha256
    || ticket.value.consumedBy.validatedAgentsSha256 !== marker.value.validatedAgentsSha256) {
    throw new Error("current runtime readback is not bound to the consumed ticket");
  }
  return {
    status: "current",
    paths,
    barrier: barrier.value,
    marker: marker.value,
    barrierSha256: barrier.rawSha256,
    readbackSha256: marker.value.receiptSha256,
  };
}
function rollbackPublishedPrivateFile(publication, fs) {
  if (!publication?.path || !fs.existsSync(publication.path)) return;
  if (publication.replacedExisting === true) throw new Error("replaced private state cannot be removed as rollback");
  if (!sameFileIdentity(publication, fs)
    || sha256(fs.readFileSync(publication.path)) !== publication.sha256) {
    throw new Error("published private-state identity changed before rollback");
  }
  fs.unlinkSync(publication.path);
  fsyncDirectory(dirname(publication.path), fs);
}
function rollbackCreatedPrivateDirectories(records, fs) {
  const errors = [];
  for (const record of [...records].reverse()) {
    try {
      if (!fs.existsSync(record.path)) continue;
      if (!sameDirectoryIdentity(record, fs) || fs.readdirSync(record.path).length !== 0) {
        throw new Error("created private-state directory changed before rollback");
      }
      fs.rmdirSync(record.path);
      fsyncDirectory(dirname(record.path), fs);
    } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new Error("created private-state directory cleanup failed");
}
export function persistRestartBarrier({ rootDir, repositoryCapability = "local", binding, ...options } = {}) {
  const createdDirectories = [];
  const createdDirectoryRecords = [];
  const publication = {};
  const fs = runtimeFilesystem(options.deps);
  let paths;
  try {
    paths = privatePaths(rootDir, repositoryCapability, {
      ...options, create: true, createdDirectories, createdDirectoryRecords,
    });
    return withWriterLock(paths, () => {
      let prior = null;
      if (fs.existsSync(paths.barrier)) prior = readStored(paths.barrier, validateRestartBarrier, "restart barrier", fs);
      if (prior?.value.state === "restart-required"
        && prior.value.repositoryFingerprint === binding.repositoryFingerprint
        && prior.value.sourceSha256 === binding.sourceSha256
        && prior.value.runtimeTargetsSha256 === binding.runtimeTargetsSha256) {
        return { paths, barrier: prior.value, rawSha256: prior.rawSha256, written: false, createdDirectories };
      }
      const barrier = {
        schema: BARRIER_SCHEMA, revision: prior ? prior.value.revision + 1 : 0, priorStateSha256: prior ? prior.rawSha256 : null,
        repositoryFingerprint: binding.repositoryFingerprint, sourceSha256: binding.sourceSha256,
        runtimeTargets: binding.runtimeTargets, runtimeTargetsSha256: binding.runtimeTargetsSha256, transactionId: binding.transactionId,
        writerGenerationSha256: binding.writerGenerationSha256, launcherSha256: binding.launcherSha256,
        helperSha256: binding.helperSha256, codexExecutableSha256: binding.codexExecutableSha256, state: "restart-required",
      };
      validateRestartBarrier(barrier);
      publication.replacedExisting = prior !== null;
      return {
        paths,
        barrier,
        rawSha256: writeAtomic(
          paths.barrier,
          barrier,
          fs,
          publication,
          prior ? { status: "present", ...prior } : { status: "absent" },
        ),
        written: true, createdDirectories,
      };
    }, fs);
  } catch (primaryError) {
    const rollbackErrors = [];
    try { rollbackPublishedPrivateFile(publication, fs); } catch (error) { rollbackErrors.push(error); }
    try { rollbackCreatedPrivateDirectories(createdDirectoryRecords, fs); } catch (error) { rollbackErrors.push(error); }
    if (rollbackErrors.length) throw new Error("restart barrier persistence rollback failed");
    throw primaryError;
  }
}
export function removeRestartBarrierCas({ rootDir, repositoryCapability = "local", expectedRawSha256, ...options } = {}) {
  expectHex(expectedRawSha256, "expected barrier digest");
  const paths = privatePaths(rootDir, repositoryCapability, options);
  return withWriterLock(paths, () => {
    const current = readStored(paths.barrier, validateRestartBarrier, "restart barrier");
    if (current.rawSha256 !== expectedRawSha256) throw new Error("restart barrier CAS drifted");
    unlinkSync(paths.barrier); fsyncDirectory(paths.directory);
  });
}
export function issueLaunchTicket({ rootDir, repositoryCapability = "local", barrierSha256, now = Date.now(), random = randomBytes, ...options } = {}) {
  expectHex(barrierSha256, "barrierSha256"); expectEpoch(now, "clock");
  const fs = runtimeFilesystem(options.deps);
  const paths = privatePaths(rootDir, repositoryCapability, { ...options, create: true });
  return withWriterLock(paths, () => {
    const current = readStored(paths.barrier, validateRestartBarrier, "restart barrier", fs);
    const barrier = current.value;
    if (barrier.state !== "restart-required" || current.rawSha256 !== barrierSha256) throw new Error("restart barrier changed before launch");
    const executable = realpathSync(options.codexExecutable ?? resolveRuntimeExecutable());
    if (pathDigest(executable) !== barrier.codexExecutableSha256 || pathDigest(LAUNCHER_PATH) !== barrier.launcherSha256 || pathDigest(HELPER_PATH) !== barrier.helperSha256) throw new Error("restart binding drifted");
    ensureTickets(paths, fs);
    const tickets = readLaunchTicketSet(paths, fs);
    if (liveLaunchTickets(tickets, current.rawSha256, now).length !== 0) throw new Error("a live launch ticket already exists for this barrier");
    const token = random(32); const ticketId = random(20).toString("hex");
    if (tickets.some(({ value }) => value.ticketId === ticketId)) throw new Error("launch ticket identity already exists");
    const ticket = {
      schema: TICKET_SCHEMA, ticketId, revision: 0, priorStateSha256: null, issuedAtEpochMs: now, expiresAtEpochMs: now + 300000,
      barrierSha256, repositoryFingerprint: barrier.repositoryFingerprint, expectedSourceSha256: barrier.sourceSha256,
      expectedRuntimeTargetsSha256: barrier.runtimeTargetsSha256, writerGenerationSha256: barrier.writerGenerationSha256,
      tokenSha256: sha256(token), state: "issued", consumedBy: null,
    };
    validateLaunchTicket(ticket);
    writeAtomic(
      ticketPath(paths, ticketId),
      ticket,
      fs,
      null,
      { status: "absent" },
    );
    return { ticketId, token, expiresAtEpochMs: ticket.expiresAtEpochMs, executable, barrier };
  }, fs);
}
export function authenticateLaunchTicket({ rootDir, repositoryCapability = "local", ticketId, token, now = Date.now(), ...options } = {}) {
  expectId(ticketId, "ticketId"); if (!Buffer.isBuffer(token) || token.length !== 32) throw new Error("launch token is invalid"); expectEpoch(now, "clock");
  const fs = runtimeFilesystem(options.deps);
  const paths = privatePaths(rootDir, repositoryCapability, options);
  const barrier = readStored(paths.barrier, validateRestartBarrier, "restart barrier", fs);
  const ticket = readSoleLiveLaunchTicket(paths, barrier.rawSha256, ticketId, now, fs);
  if (ticket.value.state !== "issued" || ticket.value.tokenSha256 !== sha256(token) || now < ticket.value.issuedAtEpochMs || now >= ticket.value.expiresAtEpochMs
    || barrier.value.state !== "restart-required" || ticket.value.barrierSha256 !== barrier.rawSha256
    || ticket.value.repositoryFingerprint !== barrier.value.repositoryFingerprint || ticket.value.expectedSourceSha256 !== barrier.value.sourceSha256
    || ticket.value.expectedRuntimeTargetsSha256 !== barrier.value.runtimeTargetsSha256 || ticket.value.writerGenerationSha256 !== barrier.value.writerGenerationSha256) throw new Error("launch ticket is unavailable or replayed");
  return { paths, barrier, ticket };
}
export function consumeRuntimeReadback({ rootDir, repositoryCapability = "local", receipt, ticketId, token, now = Date.now(), ...options } = {}) {
  validateRuntimeReadback(receipt); if (receipt.ticketId !== ticketId) throw new Error("runtime receipt ticket mismatch");
  const fs = runtimeFilesystem(options.deps);
  const authenticated = authenticateLaunchTicket({ rootDir, repositoryCapability, ticketId, token, now, ...options });
  const { paths } = authenticated;
  return withWriterLock(paths, () => {
    const barrier = readStored(paths.barrier, validateRestartBarrier, "restart barrier", fs);
    const ticket = readSoleLiveLaunchTicket(paths, barrier.rawSha256, ticketId, now, fs);
    if (barrier.rawSha256 !== authenticated.barrier.rawSha256 || ticket.rawSha256 !== authenticated.ticket.rawSha256) throw new Error("runtime readback CAS drifted");
    const value = barrier.value;
    if (receipt.barrierSha256 !== barrier.rawSha256 || receipt.repositoryFingerprint !== value.repositoryFingerprint
      || receipt.sourceSha256 !== value.sourceSha256 || receipt.runtimeTargetsSha256 !== value.runtimeTargetsSha256
      || receipt.readerGenerationSha256 === value.writerGenerationSha256) throw new Error("runtime readback did not bind a fresh barrier");
    const consumed = { ...ticket.value, revision: ticket.value.revision + 1, priorStateSha256: ticket.rawSha256, state: "consumed", consumedBy: {
      readerGenerationSha256: receipt.readerGenerationSha256, effectiveConfigSha256: receipt.effectiveConfigSha256, validatedAgentsSha256: receipt.validatedAgentsSha256,
    } };
    const cleared = { ...value, revision: value.revision + 1, priorStateSha256: barrier.rawSha256, state: "cleared" };
    validateLaunchTicket(consumed); validateRestartBarrier(cleared);
    const ticketSha256 = canonicalSha256(consumed);
    const barrierSha256 = canonicalSha256(cleared);
    const receiptSha256 = canonicalSha256(receipt);
    const marker = {
      schema: CURRENT_READBACK_SCHEMA,
      barrierSha256,
      priorBarrierSha256: barrier.rawSha256,
      repositoryFingerprint: receipt.repositoryFingerprint,
      sourceSha256: receipt.sourceSha256,
      runtimeTargetsSha256: receipt.runtimeTargetsSha256,
      ticketId,
      ticketSha256,
      readerGenerationSha256: receipt.readerGenerationSha256,
      effectiveConfigSha256: receipt.effectiveConfigSha256,
      validatedAgentsSha256: receipt.validatedAgentsSha256,
      observedAtEpochMs: receipt.observedAtEpochMs,
      receiptSha256,
    };
    validateCurrentRuntimeReadback(marker);
    const markerPrecondition = fs.existsSync(paths.currentReadback)
      ? {
          status: "present",
          ...readStored(
            paths.currentReadback,
            validateCurrentRuntimeReadback,
            "current runtime readback",
            fs,
          ),
        }
      : { status: "absent" };
    // The cleared barrier is the final publication point. Until it lands, the
    // old restart-required barrier remains controlling even if the consumed
    // ticket and private marker were durably written.
    writeAtomic(
      ticketPath(paths, ticketId),
      consumed,
      fs,
      null,
      { status: "present", ...ticket },
    );
    writeAtomic(paths.currentReadback, marker, fs, null, markerPrecondition);
    const publishedBarrierSha256 = writeAtomic(
      paths.barrier,
      cleared,
      fs,
      null,
      { status: "present", ...barrier },
    );
    if (publishedBarrierSha256 !== barrierSha256) throw new Error("cleared barrier publication digest changed");
    return { barrier: cleared, barrierSha256, ticket: consumed, readbackSha256: receiptSha256 };
  }, fs);
}
