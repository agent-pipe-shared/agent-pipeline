// SPDX-License-Identifier: SUL-1.0

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  bindOnboardingSessionCleanup,
  quarantineClosedPrivateCleanupReleaseReceipt,
  readOnboardingSessionCleanupBinding,
  recordClosedOnboardingSessionCleanupRelease,
  releaseOnboardingSessionCleanup,
  previewOnboardingSessionCleanupRelease,
} from "./onboarding-continuity.mjs";
import {
  inspectSessionRetirement,
  inspectExternallyArchivedSession,
  inspectSessionClosure,
  listActiveSessionDescriptors,
  loadSessionDescriptor,
  retireExternallyArchivedSession,
  retireSessionDescriptor,
} from "./worktree-lifecycle.mjs";
import {
  assessWindowsPrivatePath,
  hardenWindowsPrivateDirectory,
} from "./windows-private-state.mjs";

export const SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA = "pipeline.session-cleanup-recovery-plan.v1";
export const SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA = "pipeline.session-cleanup-recovery-apply.v1";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCRIPT = join(HERE, "..", "scripts", "session-cleanup.mjs");
const SHA256 = /^[a-f0-9]{64}$/u;
const COMPOSITE_JOURNAL_SCHEMA = "pipeline.session-cleanup-composite-recovery-journal.v1";
const COMPOSITE_LOCK_SCHEMA = "pipeline.session-cleanup-composite-recovery-lock.v1";

export class SessionCleanupRecoveryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SessionCleanupRecoveryError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SessionCleanupRecoveryError(code, message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(Buffer.from(canonicalJson(value), "utf8")).digest("hex");
}

function recoveryBinding(plan) {
  const binding = {
    schema: plan.schema,
    root: plan.root,
    stateSha256: plan.stateSha256,
    revision: plan.revision,
    sessionCleanup: plan.sessionCleanup,
    closure: plan.closure,
    activeDescriptorCount: plan.activeDescriptorCount,
    recovery: plan.recovery,
    releaseProof: plan.releaseProof ?? null,
    coordinatorCloseSha256: plan.coordinatorCloseSha256 ?? null,
  };
  if (Object.hasOwn(plan, "orphanDescriptors")) {
    binding.orphanDescriptors = plan.orphanDescriptors;
  }
  if (Object.hasOwn(plan, "externalRetirements")) {
    binding.externalRetirements = plan.externalRetirements;
  }
  if (Object.hasOwn(plan, "expectedBindingStatus")) {
    binding.expectedBindingStatus = plan.expectedBindingStatus;
  }
  if (Object.hasOwn(plan, "privateReceiptRecoverySha256")) {
    binding.privateReceiptRecoverySha256 = plan.privateReceiptRecoverySha256;
  }
  if (Object.hasOwn(plan, "expectedPostStateSha256")) {
    binding.expectedPostStateSha256 = plan.expectedPostStateSha256;
  }
  if (Object.hasOwn(plan, "expectedPostRevision")) {
    binding.expectedPostRevision = plan.expectedPostRevision;
  }
  if (Object.hasOwn(plan, "writerIdentity")) {
    binding.writerIdentity = plan.writerIdentity;
  }
  return binding;
}

function observeWriterIdentity(scriptPath, deps) {
  if (typeof deps.observeWriterIdentityFn === "function") {
    return deps.observeWriterIdentityFn(scriptPath);
  }
  try {
    const physicalPath = realpathSync(scriptPath);
    const before = lstatSync(physicalPath);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) return null;
    const bytes = readFileSync(physicalPath);
    const after = lstatSync(physicalPath);
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1
      || before.dev !== after.dev || before.ino !== after.ino
      || before.mode !== after.mode || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs) return null;
    const pluginRoot = realpathSync(resolve(dirname(physicalPath), ".."));
    const manifestPath = realpathSync(join(pluginRoot, ".codex-plugin", "plugin.json"));
    const manifestBefore = lstatSync(manifestPath);
    if (!manifestBefore.isFile() || manifestBefore.isSymbolicLink()
      || manifestBefore.nlink !== 1) return null;
    const manifestBytes = readFileSync(manifestPath);
    const manifestAfter = lstatSync(manifestPath);
    if (!manifestAfter.isFile() || manifestAfter.isSymbolicLink()
      || manifestAfter.nlink !== 1
      || manifestBefore.dev !== manifestAfter.dev
      || manifestBefore.ino !== manifestAfter.ino
      || manifestBefore.mode !== manifestAfter.mode
      || manifestBefore.size !== manifestAfter.size
      || manifestBefore.mtimeMs !== manifestAfter.mtimeMs) return null;
    let manifest;
    try { manifest = JSON.parse(manifestBytes); } catch { return null; }
    if (manifest?.name !== "pipeline-core" || typeof manifest.version !== "string") return null;
    return {
      path: physicalPath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      identity: {
        dev: String(before.dev),
        ino: String(before.ino),
        mode: String(before.mode),
        size: String(before.size),
        mtimeMs: String(before.mtimeMs),
      },
      plugin: {
        root: pluginRoot,
        name: manifest.name,
        version: manifest.version,
        manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
        identity: {
          dev: String(manifestBefore.dev),
          ino: String(manifestBefore.ino),
          mode: String(manifestBefore.mode),
          size: String(manifestBefore.size),
          mtimeMs: String(manifestBefore.mtimeMs),
        },
      },
    };
  } catch {
    return null;
  }
}

function securePrivateDirectory(path, {
  platform = process.platform,
  assessWindowsPrivatePathFn = assessWindowsPrivatePath,
  hardenWindowsPrivateDirectoryFn = hardenWindowsPrivateDirectory,
} = {}) {
  const existed = existsSync(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("WT-SESSION-RECOVERY-JOURNAL", "composite recovery directory is unsafe");
  }
  if (platform === "win32") {
    const assurance = existed
      ? assessWindowsPrivatePathFn(path)
      : hardenWindowsPrivateDirectoryFn(path);
    if (assurance.status !== "secure") {
      fail("WT-SESSION-RECOVERY-JOURNAL", "composite recovery directory DACL is unsafe");
    }
  } else if ((info.mode & 0o077) !== 0) {
    try { chmodSync(path, 0o700); } catch {}
    if ((lstatSync(path).mode & 0o077) !== 0) {
      fail("WT-SESSION-RECOVERY-JOURNAL", "composite recovery directory permissions are unsafe");
    }
  }
}

function safePrivateFile(path, {
  platform = process.platform,
  assessWindowsPrivatePathFn = assessWindowsPrivatePath,
} = {}) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    fail("WT-SESSION-RECOVERY-JOURNAL", "composite recovery file is unsafe");
  }
  if (platform === "win32") {
    if (assessWindowsPrivatePathFn(path).status !== "secure") {
      fail("WT-SESSION-RECOVERY-JOURNAL", "composite recovery file DACL is unsafe");
    }
  } else if ((info.mode & 0o077) !== 0) {
    fail("WT-SESSION-RECOVERY-JOURNAL", "composite recovery file permissions are unsafe");
  }
  return info;
}

function recoveryJournalPaths(root, expectedPlanSha256, deps, { create = true } = {}) {
  const spawn = deps.spawn ?? spawnSync;
  const result = spawn("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 5000,
  });
  if (result?.status !== 0 || result?.error) {
    fail("WT-SESSION-RECOVERY-JOURNAL", "Git common directory is unavailable");
  }
  const raw = String(result.stdout ?? "").trim();
  const common = realpathSync(isAbsolute(raw) ? raw : resolve(root, raw));
  const info = lstatSync(common);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("WT-SESSION-RECOVERY-JOURNAL", "Git common directory is unsafe");
  }
  const directory = join(common, "agent-pipeline", "session-cleanup-recovery");
  const security = {
    platform: deps.platform ?? process.platform,
    assessWindowsPrivatePathFn: deps.assessWindowsPrivatePathFn ?? assessWindowsPrivatePath,
    hardenWindowsPrivateDirectoryFn: deps.hardenWindowsPrivateDirectoryFn ?? hardenWindowsPrivateDirectory,
  };
  if (create) {
    securePrivateDirectory(directory, security);
  } else if (existsSync(directory)) {
    const directoryInfo = lstatSync(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      fail("WT-SESSION-RECOVERY-JOURNAL", "composite recovery directory is unsafe");
    }
  }
  return {
    journal: join(directory, `${expectedPlanSha256}.json`),
    lock: join(directory, `${expectedPlanSha256}.lock`),
  };
}

function writeExclusivePrivate(path, bytes, security = {}) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
  safePrivateFile(path, security);
}

function writeAtomicPrivate(path, bytes, security = {}) {
  const temporary = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeExclusivePrivate(temporary, bytes, security);
    renameSync(temporary, path);
    safePrivateFile(path, security);
  } finally {
    try { unlinkSync(temporary); } catch {}
  }
}

function resolveGitCommonDirectoryForBackup(root, deps) {
  const spawn = deps.spawn ?? spawnSync;
  const result = spawn("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 5000,
  });
  if (result?.status !== 0 || result?.error) {
    fail("WT-SESSION-RECOVERY-BACKUP", "Git common directory is unavailable");
  }
  const raw = String(result.stdout ?? "").trim();
  const common = realpathSync(isAbsolute(raw) ? raw : resolve(root, raw));
  const info = lstatSync(common);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("WT-SESSION-RECOVERY-BACKUP", "Git common directory is unsafe");
  }
  return common;
}

/**
 * Safety net paired with removing PO confirmation for the six auto-executed
 * recovery kinds (2026-08-18 PO decision, backlog item
 * pipeline.self-healing-local-cleanup-recovery): every private file a
 * recovery is about to mutate is snapshotted here FIRST, unconditionally,
 * before the underlying mutating call runs. Backups live in a directory this
 * module already owns and secures -- deliberately never inside a directory a
 * DIFFERENT module readdir-scans and fails closed on an unexpected entry
 * (e.g. worktree-lifecycle.mjs's session-descriptors/active/, which throws
 * WT-SESSION-DESCRIPTOR-DIRECTORY on any non-`.json` entry) -- and are named
 * by a caller-supplied label, one rolling backup per label: a second recovery
 * attempt overwrites the first rather than accumulating unbounded history,
 * since the backup's only job is "restore the immediately-prior state", not
 * an audit trail. Design choice, left unspecified by the PO.
 */
function recoveryBackupDirectory(root, deps) {
  const common = resolveGitCommonDirectoryForBackup(root, deps);
  const directory = join(common, "agent-pipeline", "session-cleanup-recovery", "backups");
  const security = {
    platform: deps.platform ?? process.platform,
    assessWindowsPrivatePathFn: deps.assessWindowsPrivatePathFn ?? assessWindowsPrivatePath,
    hardenWindowsPrivateDirectoryFn: deps.hardenWindowsPrivateDirectoryFn ?? hardenWindowsPrivateDirectory,
  };
  securePrivateDirectory(directory, security);
  return { directory, security };
}

/**
 * Back up exactly one file's pre-recovery bytes to `<label>.bak` under
 * recoveryBackupDirectory(). A no-op (returns null) when the source does not
 * exist yet -- nothing to preserve, and several recovery kinds legitimately
 * mutate a file that is absent going in (e.g. a fresh private binding write).
 * Fails closed (never silently skips) if the source exists but is not a
 * plain regular file, since that is exactly the shape a symlink attack or a
 * damaged private store would take.
 *
 * CORRECTED 2026-08-19 (Critic finding F3, dispatch W4-CRITIC-2C): the
 * absence check used to be `!existsSync(sourcePath)`, which FOLLOWS
 * symlinks -- a DANGLING symlink at sourcePath made existsSync() return
 * false, so the function returned null (silently "nothing to back up")
 * instead of reaching the isSymbolicLink() check below and failing closed.
 * lstatSync() never follows the link, so it succeeds on a dangling symlink
 * (reporting the link itself) and only throws ENOENT when sourcePath is
 * truly absent -- that is the one case this function still treats as
 * legitimately absent.
 */
function backupBeforeMutation(root, deps, label, sourcePath) {
  let info;
  try {
    info = lstatSync(sourcePath);
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    fail("WT-SESSION-RECOVERY-BACKUP", "cleanup recovery backup source is unsafe");
  }
  const bytes = readFileSync(sourcePath);
  const { directory, security } = recoveryBackupDirectory(root, deps);
  const backupPath = join(directory, `${label}.bak`);
  writeAtomicPrivate(backupPath, bytes, security);
  return backupPath;
}

/**
 * Back up every regular file currently in the private onboarding store
 * (`agent-pipeline/onboarding/`, the same directory
 * onboarding-continuity.mjs's resolvePrivate(root, "local", ...) resolves to)
 * before a recovery kind that goes on to call into that module's binding/
 * receipt writers (bind-orphan, release-lost-binding, release-closed-feature,
 * quarantine-private-receipt, and the release half of
 * retire-orphans-release-lost-binding). A directory sweep rather than named
 * basenames deliberately: the private binding/key/release-receipt basenames
 * are internal to onboarding-continuity.mjs (not exported), so backing up by
 * name here would either duplicate them as magic strings or require touching
 * that file -- both worse than backing up whatever is actually present.
 *
 * CORRECTED 2026-08-19 (still-open F3 sibling gap, disclosed in the
 * 2026-08-19 round-2 implementation status): a symlink entry (or any other
 * non-regular, non-directory entry -- a fifo, a device node) used to hit
 * `continue`, silently skipping it -- exactly the shape a symlink attack or
 * a damaged private store would take, and exactly the failure mode
 * `backupBeforeMutation` itself already fails closed on. This sweep now
 * fails closed the same way. A genuine SUBDIRECTORY (e.g.
 * `intake-checkpoint-evidence/`) is not itself unsafe and is still skipped
 * here unchanged -- only its own file entries get individually swept when
 * this same directory is that subdirectory's own onboardingDirectory in a
 * future recursive extension; this function is not itself recursive.
 */
function backupOnboardingPrivateState(root, deps) {
  const common = resolveGitCommonDirectoryForBackup(root, deps);
  const onboardingDirectory = join(common, "agent-pipeline", "onboarding");
  if (!existsSync(onboardingDirectory)) return [];
  const info = lstatSync(onboardingDirectory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("WT-SESSION-RECOVERY-BACKUP", "onboarding private state directory is unsafe");
  }
  const backedUp = [];
  for (const name of readdirSync(onboardingDirectory).sort()) {
    const path = join(onboardingDirectory, name);
    const entryInfo = lstatSync(path);
    if (entryInfo.isSymbolicLink()) {
      fail("WT-SESSION-RECOVERY-BACKUP", "onboarding private state directory contains an unsafe symlink entry");
    }
    if (entryInfo.isDirectory()) continue;
    if (!entryInfo.isFile()) {
      fail("WT-SESSION-RECOVERY-BACKUP", "onboarding private state directory contains an unsafe non-regular entry");
    }
    const backupPath = backupBeforeMutation(root, deps, `onboarding-private.${name}`, path);
    if (backupPath) backedUp.push(backupPath);
  }
  return backedUp;
}

/**
 * Back up the external-archive cleanup manifest retireExternallyArchivedSession
 * is about to delete. `session-cleanup/active/<sessionId>.json` under the Git
 * common dir is worktree-lifecycle.mjs's own un-exported cleanupManifestPath()
 * convention (confirmed by direct source read, not guessed); reconstructed
 * here rather than exported because widening that module's surface is outside
 * this change's file scope. Only reached by retire-externally-archived-orphans
 * / retire-mixed-orphans, and only for descriptors requiring external
 * retirement -- disclosed, deliberate coupling, not an oversight.
 *
 * Path construction is split into `externalRetirementManifestPath()` (below)
 * so a regression test can pin this duplicated convention against
 * worktree-lifecycle.mjs's real `cleanupManifestPath()` by comparing the two
 * routes' output for the same inputs, without exporting either module's
 * internals to the other (Critic finding F5, 2026-08-19).
 */
function externalRetirementManifestPath(root, deps, sessionId) {
  const common = resolveGitCommonDirectoryForBackup(root, deps);
  return join(common, "agent-pipeline", "session-cleanup", "active", `${sessionId}.json`);
}

function backupExternalRetirementManifest(root, deps, sessionId) {
  return backupBeforeMutation(
    root,
    deps,
    `external-manifest.${sessionId}`,
    externalRetirementManifestPath(root, deps, sessionId),
  );
}

function validateCompositeJournal(value, expectedPlanSha256) {
  const keys = Object.keys(value ?? {}).sort();
  const expected = [
    "binding",
    "completedSessionIds",
    "expectedPostStateSha256",
    "expectedPostRevision",
    "pendingSessionId",
    "phase",
    "planSha256",
    "revision",
    "schema",
  ].sort();
  if (!isObject(value)
    || keys.length !== expected.length
    || !keys.every((key, index) => key === expected[index])
    || value.schema !== COMPOSITE_JOURNAL_SCHEMA
    || value.planSha256 !== expectedPlanSha256
    || digest(value.binding) !== expectedPlanSha256
    || value.binding.recovery !== "retire-orphans-release-lost-binding"
    || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !new Set(["prepared", "retiring", "retired", "releasing", "released"]).has(value.phase)
    || !Array.isArray(value.completedSessionIds)
    || value.completedSessionIds.some((sessionId) => typeof sessionId !== "string")
    || !(value.pendingSessionId === null || typeof value.pendingSessionId === "string")
    || value.expectedPostRevision !== value.binding.expectedPostRevision
    || !SHA256.test(value.expectedPostStateSha256 ?? "")
    || value.expectedPostStateSha256 !== value.binding.expectedPostStateSha256) {
    fail("WT-SESSION-RECOVERY-JOURNAL", "composite recovery journal is invalid");
  }
  const expectedSessions = value.binding.orphanDescriptors.map(({ sessionId }) => sessionId);
  const completed = new Set(value.completedSessionIds);
  if (completed.size !== value.completedSessionIds.length
    || value.completedSessionIds.some((sessionId) => !expectedSessions.includes(sessionId))
    || (value.pendingSessionId !== null && (!expectedSessions.includes(value.pendingSessionId)
      || completed.has(value.pendingSessionId)))) {
    fail("WT-SESSION-RECOVERY-JOURNAL", "composite recovery journal descriptor set is invalid");
  }
  return value;
}

function readCompositeJournal(path, expectedPlanSha256, security = {}) {
  safePrivateFile(path, security);
  let value;
  try { value = JSON.parse(readFileSync(path, "utf8")); }
  catch { fail("WT-SESSION-RECOVERY-JOURNAL", "composite recovery journal is malformed"); }
  return validateCompositeJournal(value, expectedPlanSha256);
}

function persistCompositeJournal(path, journal, security = {}) {
  const validated = validateCompositeJournal(journal, journal.planSha256);
  writeAtomicPrivate(path, Buffer.from(`${JSON.stringify(validated)}\n`, "utf8"), security);
  return validated;
}

function initialCompositeJournal(plan) {
  return validateCompositeJournal({
    schema: COMPOSITE_JOURNAL_SCHEMA,
    planSha256: plan.planSha256,
    binding: recoveryBinding(plan),
    phase: "prepared",
    revision: 0,
    pendingSessionId: null,
    completedSessionIds: [],
    expectedPostRevision: plan.expectedPostRevision ?? plan.revision + 1,
    expectedPostStateSha256: plan.expectedPostStateSha256,
  }, plan.planSha256);
}

function defaultProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    return null;
  }
}

function defaultProcessIdentity(pid) {
  if (process.platform !== "linux") return null;
  try {
    const bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const closing = stat.lastIndexOf(")");
    const fields = stat.slice(closing + 2).trim().split(/\s+/u);
    const startTicks = fields[19];
    if (!/^[a-f0-9-]{36}$/iu.test(bootId) || !/^[0-9]+$/u.test(startTicks ?? "")) return null;
    return `${bootId.toLowerCase()}:${startTicks}`;
  } catch {
    return null;
  }
}

function acquireCompositeLock(paths, plan, security, deps) {
  const value = {
    schema: COMPOSITE_LOCK_SCHEMA,
    planSha256: plan.planSha256,
    pid: process.pid,
    processIdentity: (deps.processIdentityFn ?? defaultProcessIdentity)(process.pid),
    nonce: randomBytes(16).toString("hex"),
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeExclusivePrivate(paths.lock, Buffer.from(`${JSON.stringify(value)}\n`, "utf8"), security);
      return { value, identity: safePrivateFile(paths.lock, security) };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let prior;
      let identity;
      try {
        identity = safePrivateFile(paths.lock, security);
        prior = JSON.parse(readFileSync(paths.lock, "utf8"));
      } catch {
        fail("WT-SESSION-RECOVERY-LOCKED", "composite recovery lock is unsafe");
      }
      if (!isObject(prior)
        || prior.schema !== COMPOSITE_LOCK_SCHEMA
        || prior.planSha256 !== plan.planSha256
        || !Number.isSafeInteger(prior.pid) || prior.pid < 1
        || !(prior.processIdentity === null
          || /^[a-f0-9-]{36}:[0-9]+$/iu.test(prior.processIdentity))
        || typeof prior.nonce !== "string" || !/^[a-f0-9]{32}$/u.test(prior.nonce)) {
        fail("WT-SESSION-RECOVERY-LOCKED", "composite recovery lock is invalid");
      }
      const processIdentity = (deps.processIdentityFn ?? defaultProcessIdentity)(prior.pid);
      const reusedPid = prior.processIdentity !== null
        && processIdentity !== null
        && processIdentity !== prior.processIdentity;
      const alive = reusedPid
        ? false
        : (deps.isProcessAliveFn ?? defaultProcessAlive)(prior.pid);
      if (alive !== false) {
        fail("WT-SESSION-RECOVERY-LOCKED", "composite recovery is already active");
      }
      const readback = safePrivateFile(paths.lock, security);
      if (readback.dev !== identity.dev || readback.ino !== identity.ino) {
        fail("WT-SESSION-RECOVERY-LOCKED", "composite recovery lock identity changed");
      }
      unlinkSync(paths.lock);
    }
  }
  fail("WT-SESSION-RECOVERY-LOCKED", "composite recovery lock could not be acquired");
}

function releaseCompositeLock(paths, owned, security) {
  try {
    const observed = safePrivateFile(paths.lock, security);
    if (observed.dev !== owned.identity.dev || observed.ino !== owned.identity.ino) {
      fail("WT-SESSION-RECOVERY-LOCKED", "composite recovery lock identity changed");
    }
    const value = JSON.parse(readFileSync(paths.lock, "utf8"));
    if (canonicalJson(value) !== canonicalJson(owned.value)) {
      fail("WT-SESSION-RECOVERY-LOCKED", "composite recovery lock ownership changed");
    }
    unlinkSync(paths.lock);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
}

function updateCompositeJournal(paths, journal, patch, security = {}) {
  return persistCompositeJournal(paths.journal, {
    ...journal,
    ...patch,
    revision: journal.revision + 1,
  }, security);
}

function compositePlanFromJournal(journal) {
  return {
    ...journal.binding,
    status: "ready",
    planSha256: journal.planSha256,
  };
}

function applyCompositeSessionCleanupRecovery({
  plan,
  expectedPlanSha256,
  scriptPath,
  deps,
}) {
  const paths = recoveryJournalPaths(plan.root, expectedPlanSha256, deps);
  const journalSecurity = {
    platform: deps.platform ?? process.platform,
    assessWindowsPrivatePathFn: deps.assessWindowsPrivatePathFn ?? assessWindowsPrivatePath,
    hardenWindowsPrivateDirectoryFn: deps.hardenWindowsPrivateDirectoryFn ?? hardenWindowsPrivateDirectory,
  };
  const ownedLock = acquireCompositeLock(paths, plan, journalSecurity, deps);
  try {
    let journal;
    if (existsSync(paths.journal)) {
      journal = readCompositeJournal(paths.journal, expectedPlanSha256, journalSecurity);
      if (canonicalJson(journal.binding) !== canonicalJson(recoveryBinding(plan))) {
        fail("WT-SESSION-RECOVERY-JOURNAL", "composite recovery journal plan binding changed");
      }
    } else {
      journal = initialCompositeJournal(plan);
      writeExclusivePrivate(
        paths.journal,
        Buffer.from(`${JSON.stringify(journal)}\n`, "utf8"),
        journalSecurity,
      );
    }
    const beganReleased = journal.phase === "released";
    const writerIdentity = observeWriterIdentity(scriptPath, deps);
    if (writerIdentity === null
      || canonicalJson(writerIdentity) !== canonicalJson(plan.writerIdentity)) {
      fail("WT-SESSION-RECOVERY-PLAN", "composite recovery writer identity changed");
    }
    const readBinding = deps.readOnboardingSessionCleanupBindingFn
      ?? readOnboardingSessionCleanupBinding;
    const listDescriptors = deps.listActiveSessionDescriptorsFn
      ?? listActiveSessionDescriptors;
    const inspectRetirement = deps.inspectSessionRetirementFn
      ?? inspectSessionRetirement;
    const loadDescriptor = deps.loadSessionDescriptorFn ?? loadSessionDescriptor;
    const retireDescriptor = deps.retireSessionDescriptorFn
      ?? retireSessionDescriptor;
    const expectedById = new Map(plan.orphanDescriptors.map((entry) => [entry.sessionId, entry]));
    const completed = new Set(journal.completedSessionIds);
    const initialBinding = readBinding({ rootDir: plan.root });
    const atPreimage = initialBinding.status === "bound"
      && initialBinding.stateSha256 === plan.stateSha256
      && initialBinding.revision === plan.revision
      && canonicalJson(initialBinding.sessionCleanup) === canonicalJson(plan.sessionCleanup);
    const atPostimage = initialBinding.sessionCleanup === null
      && initialBinding.revision === journal.expectedPostRevision
      && initialBinding.stateSha256 === journal.expectedPostStateSha256;
    if (!atPreimage && !(new Set(["releasing", "released"]).has(journal.phase) && atPostimage)) {
      fail("WT-SESSION-RECOVERY-READBACK", "composite cleanup recovery State preimage changed");
    }
    if (atPreimage) {
      for (const expected of plan.orphanDescriptors) {
        if (completed.has(expected.sessionId)) continue;
        let active = listDescriptors(plan.root);
        const activeById = new Map(active.map((entry) => [entry.sessionId, entry]));
        for (const observed of active) {
          if (!expectedById.has(observed.sessionId) || completed.has(observed.sessionId)) {
            fail("WT-SESSION-RECOVERY-PLAN", "active orphan descriptor set changed");
          }
        }
        const observedActive = activeById.get(expected.sessionId);
        if (journal.pendingSessionId === null) {
          if (!observedActive
            || observedActive.descriptorSha256 !== expected.descriptorSha256) {
            fail("WT-SESSION-RECOVERY-PLAN", "orphan descriptor disappeared before write-ahead retirement");
          }
          journal = updateCompositeJournal(paths, journal, {
            phase: "retiring",
            pendingSessionId: expected.sessionId,
          }, journalSecurity);
        } else if (journal.pendingSessionId !== expected.sessionId) {
          fail("WT-SESSION-RECOVERY-JOURNAL", "composite recovery pending descriptor changed");
        }
        active = listDescriptors(plan.root);
        const current = active.find((entry) => entry.sessionId === expected.sessionId);
        if (current) {
          if (current.descriptorSha256 !== expected.descriptorSha256) {
            fail("WT-SESSION-RECOVERY-PLAN", "orphan descriptor digest changed");
          }
          const retirement = inspectRetirement(plan.root, expected.sessionId, {
            expectedDescriptorSha256: expected.descriptorSha256,
          });
          if (retirement.status !== "retirable"
            || retirement.ownerStatus !== expected.ownerStatus
            || retirement.descriptorSha256 !== expected.descriptorSha256) {
            fail("WT-SESSION-RECOVERY-PLAN", "orphan descriptor retirement binding changed");
          }
          const descriptor = loadDescriptor(plan.root, expected.sessionId, {
            expectedDescriptorSha256: expected.descriptorSha256,
          });
          backupBeforeMutation(plan.root, deps, `session-descriptor.${descriptor.sessionId}`, descriptor.path);
          retireDescriptor(plan.root, {
            sessionId: descriptor.sessionId,
            descriptorSha256: descriptor.descriptorSha256,
            ownerNonce: descriptor.ownerNonce,
          });
          deps.compositeCrashFn?.("after-retire-before-journal", {
            sessionId: expected.sessionId,
            planSha256: plan.planSha256,
          });
        }
        completed.add(expected.sessionId);
        journal = updateCompositeJournal(paths, journal, {
          phase: "prepared",
          pendingSessionId: null,
          completedSessionIds: [...completed].sort(),
        }, journalSecurity);
      }
      if (listDescriptors(plan.root).length !== 0
        || completed.size !== plan.orphanDescriptors.length) {
        fail("WT-SESSION-RECOVERY-READBACK", "composite retirement did not clear the exact orphan set");
      }
      if (journal.phase !== "retired") {
        journal = updateCompositeJournal(paths, journal, {
          phase: "retired",
          pendingSessionId: null,
          completedSessionIds: [...completed].sort(),
        }, journalSecurity);
      }
    }
    let currentBinding = readBinding({ rootDir: plan.root });
    if (currentBinding.status === "bound") {
      if (currentBinding.stateSha256 !== plan.stateSha256
        || currentBinding.revision !== plan.revision
        || canonicalJson(currentBinding.sessionCleanup) !== canonicalJson(plan.sessionCleanup)
        || listDescriptors(plan.root).length !== 0) {
        fail("WT-SESSION-RECOVERY-READBACK", "composite release preimage changed");
      }
      journal = updateCompositeJournal(paths, journal, { phase: "releasing" }, journalSecurity);
      backupOnboardingPrivateState(plan.root, deps);
      const release = deps.releaseOnboardingSessionCleanupFn
        ?? releaseOnboardingSessionCleanup;
      const released = release({
        rootDir: plan.root,
        expectedStateSha256: plan.stateSha256,
        expectedRevision: plan.revision,
        sessionCleanup: plan.sessionCleanup,
      });
      if (released.status !== "released" || released.sessionCleanup !== null
        || released.revision !== journal.expectedPostRevision
        || released.stateSha256 !== journal.expectedPostStateSha256) {
        fail("WT-SESSION-RECOVERY-READBACK", "composite cleanup recovery did not release the exact lost State handle");
      }
      deps.compositeCrashFn?.("after-release-before-journal", {
        planSha256: plan.planSha256,
        stateSha256: released.stateSha256,
      });
      journal = updateCompositeJournal(paths, journal, {
        phase: "released",
      }, journalSecurity);
      currentBinding = readBinding({ rootDir: plan.root });
    } else if (journal.phase === "releasing"
      && currentBinding.sessionCleanup === null
      && currentBinding.revision === journal.expectedPostRevision
      && currentBinding.stateSha256 === journal.expectedPostStateSha256) {
      journal = updateCompositeJournal(paths, journal, {
        phase: "released",
      }, journalSecurity);
    }
    if (journal.phase !== "released"
      || currentBinding.sessionCleanup !== null
      || currentBinding.revision !== journal.expectedPostRevision
      || currentBinding.stateSha256 !== journal.expectedPostStateSha256
      || listDescriptors(plan.root).length !== 0) {
      fail("WT-SESSION-RECOVERY-READBACK", "composite cleanup recovery final readback is invalid");
    }
    return {
      schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      status: "recovered",
      root: plan.root,
      planSha256: plan.planSha256,
      stateSha256: currentBinding.stateSha256,
      revision: currentBinding.revision,
      retiredDescriptorCount: plan.orphanDescriptors.length,
      mutated: !beganReleased,
    };
  } finally {
    releaseCompositeLock(paths, ownedLock, journalSecurity);
  }
}

function readyRecoveryPlan(partial, scriptPath) {
  const planSha256 = digest(recoveryBinding(partial));
  const status = partial.recovery === "bind-orphan"
    ? "rebound"
    : new Set([
      "retire-orphans",
      "retire-externally-archived-orphans",
      "retire-mixed-orphans",
    ]).has(partial.recovery)
      ? "retired"
      : "recovered";
  const applyAction = {
    kind: "command",
    executable: "node",
    argv: [
      scriptPath,
      "apply-recovery",
      "--repo",
      partial.root,
      "--plan-sha256",
      planSha256,
      "--activate",
    ],
    mutation: true,
    // Auto-executed per the PO's explicit 2026-08-18 decision (backlog item
    // pipeline.self-healing-local-cleanup-recovery): ALL SIX typed recovery
    // kinds this function backs (bind-orphan; retire-orphans /
    // retire-externally-archived-orphans / retire-mixed-orphans;
    // retire-orphans-release-lost-binding; release-lost-binding;
    // release-closed-feature; quarantine-private-receipt) share this one
    // applyAction construction site, so flipping this flag here covers all
    // of them at once. The safety net required in place of the removed gate
    // is `.bak` snapshotting every private file a recovery is about to
    // mutate -- see backupBeforeMutation/backupOnboardingPrivateState below,
    // called unconditionally before each underlying mutating call.
    requiresConfirmation: false,
    executionBoundary: "local-process",
    expected: {
      schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      statuses: [status],
    },
  };
  const plan = { ...partial, applyAction };
  return {
    ...plan,
    status: "ready",
    planSha256: digest(recoveryBinding(plan)),
  };
}

function descriptorRecoveryBinding(descriptor) {
  return {
    sessionId: descriptor.sessionId,
    descriptorSha256: descriptor.descriptorSha256,
    ownerStatus: descriptor.ownerStatus,
  };
}

function externalRetirementBinding(entry) {
  return {
    sessionId: entry.sessionId,
    descriptorSha256: entry.descriptorSha256,
    ownerStatus: entry.ownerStatus,
    manifestSha256: entry.manifestSha256,
    resources: entry.resources,
  };
}

/**
 * A historical root may retain more than one orphan descriptor.  Some may
 * have been externally archived under the exceptional worktree procedure,
 * while other capability-only descriptors have no manifest and are normally
 * retirable.  Treat every descriptor independently: a missing worktree alone
 * never authorizes retirement, and a regular descriptor never inherits the
 * external-archive exception from a neighbour.
 */
function planExactOrphanRetirement({
  binding,
  activeDescriptors,
  orphanDescriptors,
  externalRetirements,
  scriptPath,
}) {
  const external = externalRetirements.filter((entry) => entry.status === "ready");
  const externallyArchivedIds = new Set(external.map((entry) => entry.sessionId));
  const eligible = orphanDescriptors.every((descriptor) => externallyArchivedIds.has(descriptor.sessionId)
    || descriptor.status === "retirable");
  if (!eligible) return null;
  const recovery = external.length === 0
    ? "retire-orphans"
    : external.length === activeDescriptors.length
      ? "retire-externally-archived-orphans"
      : "retire-mixed-orphans";
  return readyRecoveryPlan({
    schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
    root: binding.root,
    stateSha256: binding.stateSha256,
    revision: binding.revision,
    sessionCleanup: null,
    closure: recovery === "retire-externally-archived-orphans"
      ? "unbound-externally-archived-orphans"
      : recovery === "retire-mixed-orphans"
        ? "unbound-mixed-orphans"
        : "unbound-orphans",
    activeDescriptorCount: activeDescriptors.length,
    recovery,
    expectedBindingStatus: binding.status,
    orphanDescriptors: orphanDescriptors.map(descriptorRecoveryBinding),
    ...(external.length > 0 ? { externalRetirements: external.map(externalRetirementBinding) } : {}),
    applyAction: null,
  }, scriptPath);
}

/**
 * Plan only closed crash residues. A single validated unbound active
 * descriptor can be rebound. Multiple exact descriptors may be retired only
 * when each one either has no cleanup manifest and is independently
 * retirable, or carries the separate external-archive proof. A bound handle
 * whose private descriptor and closure receipt are both absent can be
 * released. Active bound descriptors still require ordinary cleanup and
 * closed ones release-binding.
 *
 * SUPERSEDED 2026-08-18 (PO decision, backlog item
 * pipeline.self-healing-local-cleanup-recovery): this comment used to call
 * the single-unbound-descriptor (bind-orphan) case above "a Human-only,
 * digest-bound recovery rather than an automatic cleanup." That no longer
 * controls. All six typed recovery kinds readyRecoveryPlan() produces --
 * including bind-orphan -- now carry requiresConfirmation: false and
 * auto-execute, deliberately wider than a prior design analysis's narrower
 * recommendation. The safety net required in its place is a `.bak` snapshot
 * of every private file about to be mutated, written unconditionally before
 * the mutating call (backupBeforeMutation / backupOnboardingPrivateState,
 * defined below). Only the untyped plan-human-recovery escape hatch --
 * reached when no typed plan exists at all -- remains a human decision.
 */
export function planSessionCleanupRecovery({
  rootDir,
  scriptPath = DEFAULT_SCRIPT,
  deps = {},
} = {}) {
  const readBinding = deps.readOnboardingSessionCleanupBindingFn
    ?? readOnboardingSessionCleanupBinding;
  const inspectClosure = deps.inspectSessionClosureFn ?? inspectSessionClosure;
  const inspectRetirement = deps.inspectSessionRetirementFn
    ?? inspectSessionRetirement;
  const listDescriptors = deps.listActiveSessionDescriptorsFn
    ?? listActiveSessionDescriptors;
  const binding = readBinding({ rootDir });
  if (binding.status === "released") {
    return {
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      status: "not-needed",
    };
  }
  if (binding.status === "closed-receipt-invalid") {
    const activeDescriptors = listDescriptors(binding.root);
    if (activeDescriptors.length !== 0 || !SHA256.test(binding.privateReceiptSha256 ?? "")) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "closed-recovery-unavailable",
      };
    }
    return readyRecoveryPlan({
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      root: binding.root,
      stateSha256: binding.stateSha256,
      revision: binding.revision,
      sessionCleanup: null,
      closure: "private-receipt-invalid",
      activeDescriptorCount: 0,
      recovery: "quarantine-private-receipt",
      expectedBindingStatus: "closed-unbound",
      privateReceiptRecoverySha256: binding.privateReceiptSha256,
      applyAction: null,
    }, scriptPath);
  }
  if (new Set(["closed-unbound", "design-unbound"]).has(binding.status)) {
    const activeDescriptors = listDescriptors(binding.root);
    if (activeDescriptors.length === 0) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "not-needed",
      };
    }
    const orphanDescriptors = activeDescriptors.map((descriptor) => inspectRetirement(
      binding.root,
      descriptor.sessionId,
      { expectedDescriptorSha256: descriptor.descriptorSha256 },
    ));
    const inspectExternal = deps.inspectExternallyArchivedSessionFn
      ?? inspectExternallyArchivedSession;
    const externalRetirements = activeDescriptors.map((descriptor) => inspectExternal(
      binding.root,
      descriptor.sessionId,
      { expectedDescriptorSha256: descriptor.descriptorSha256 },
    ));
    const plan = planExactOrphanRetirement({
      binding,
      activeDescriptors,
      orphanDescriptors,
      externalRetirements,
      scriptPath,
    });
    if (plan !== null) return plan;
    if (orphanDescriptors.some((descriptor) => descriptor.status !== "retirable")) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "orphan-recovery-unavailable",
        activeDescriptorCount: activeDescriptors.length,
      };
    }
    fail("WT-SESSION-RECOVERY-PLAN", "orphan retirement proof was not constructible");
  }
  if (binding.status === "closed-bound") {
    const closure = inspectClosure(binding.root, binding.sessionCleanup.sessionId, {
      expectedDescriptorSha256: binding.sessionCleanup.descriptorSha256,
    });
    if (closure.status === "active") {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "cleanup-required",
        nextAction: {
          kind: "command",
          executable: "node",
          argv: [
            scriptPath,
            "cleanup",
            "--repo",
            binding.root,
            "--session-descriptor",
            binding.sessionCleanup.sessionId,
            "--expected-descriptor-sha256",
            binding.sessionCleanup.descriptorSha256,
          ],
          mutation: true,
          requiresConfirmation: false,
          executionBoundary: "local-process",
          expected: { statuses: ["complete"] },
        },
      };
    }
    if (closure.status !== "closed" || !SHA256.test(closure.receiptSha256 ?? "")) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "closed-recovery-unavailable",
      };
    }
    const privateCoordinatorRelease = binding.releaseProof === undefined;
    if (privateCoordinatorRelease && !SHA256.test(binding.coordinatorCloseSha256 ?? "")) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "closed-recovery-unavailable",
      };
    }
    const partial = {
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      root: binding.root,
      stateSha256: binding.stateSha256,
      revision: binding.revision,
      // A neutral closed-state release is authenticated again under the State
      // lock from private storage.  Do not leak its session tuple into the
      // portable recovery plan.
      sessionCleanup: privateCoordinatorRelease ? null : binding.sessionCleanup,
      closure,
      activeDescriptorCount: 0,
      recovery: "release-closed-feature",
      releaseProof: binding.releaseProof ?? null,
      ...(privateCoordinatorRelease ? {
        coordinatorCloseSha256: binding.coordinatorCloseSha256,
        expectedBindingStatus: "closed-unbound",
      } : { expectedBindingStatus: "released" }),
      applyAction: null,
    };
    const preliminary = readyRecoveryPlan(partial, scriptPath);
    const privateReceiptNeedsRecovery = privateCoordinatorRelease
      && binding.privateReceiptStatus !== undefined
      && (binding.privateReceiptStatus !== "valid"
        || binding.releasePlanSha256 !== preliminary.planSha256);
    if (!privateReceiptNeedsRecovery) return preliminary;
    if (!SHA256.test(binding.privateReceiptSha256 ?? "")) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "closed-recovery-unavailable",
      };
    }
    return readyRecoveryPlan({
      ...partial,
      privateReceiptRecoverySha256: binding.privateReceiptSha256,
    }, scriptPath);
  }
  if (binding.status === "unbound") {
    const activeDescriptors = listDescriptors(binding.root);
    if (activeDescriptors.length === 0) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "not-needed",
      };
    }
    const orphanDescriptors = activeDescriptors.map((descriptor) => inspectRetirement(
      binding.root,
      descriptor.sessionId,
      { expectedDescriptorSha256: descriptor.descriptorSha256 },
    ));
    const inspectExternal = deps.inspectExternallyArchivedSessionFn
      ?? inspectExternallyArchivedSession;
    const externalRetirements = activeDescriptors.map((descriptor) => inspectExternal(
      binding.root,
      descriptor.sessionId,
      { expectedDescriptorSha256: descriptor.descriptorSha256 },
    ));
    if (activeDescriptors.length > 1 || externalRetirements.some((entry) => entry.status === "ready")) {
      const plan = planExactOrphanRetirement({
        binding,
        activeDescriptors,
        orphanDescriptors,
        externalRetirements,
        scriptPath,
      });
      if (plan !== null) return plan;
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "orphan-recovery-unavailable",
        activeDescriptorCount: activeDescriptors.length,
      };
    }
    if (activeDescriptors.length !== 1) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "orphan-recovery-unavailable",
        activeDescriptorCount: activeDescriptors.length,
      };
    }
    return readyRecoveryPlan({
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      root: binding.root,
      stateSha256: binding.stateSha256,
      revision: binding.revision,
      sessionCleanup: activeDescriptors[0],
      closure: "active",
      activeDescriptorCount: 1,
      recovery: "bind-orphan",
      applyAction: null,
    }, scriptPath);
  }
  if (binding.status !== "bound") {
    fail("WT-SESSION-RECOVERY-BINDING", "cleanup recovery binding status is invalid");
  }
  const closure = inspectClosure(binding.root, binding.sessionCleanup.sessionId, {
    expectedDescriptorSha256: binding.sessionCleanup.descriptorSha256,
  });
  if (closure.status === "active") {
    return {
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      status: "cleanup-required",
    };
  }
  if (closure.status === "closed") {
    return {
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      status: "release-ready",
      nextAction: {
        kind: "command",
        executable: "node",
        argv: [scriptPath, "release-binding", "--repo", binding.root],
        mutation: true,
        requiresConfirmation: false,
        executionBoundary: "local-process",
        expected: { codes: ["WT-SESSION-BINDING-RELEASED"] },
      },
    };
  }
  const activeDescriptors = listDescriptors(binding.root);
  if (activeDescriptors.length !== 0) {
    const orphanDescriptors = activeDescriptors
      .map((descriptor) => inspectRetirement(
        binding.root,
        descriptor.sessionId,
        { expectedDescriptorSha256: descriptor.descriptorSha256 },
      ))
      .sort((left, right) => left.sessionId.localeCompare(right.sessionId));
    if (orphanDescriptors.some((descriptor) => descriptor.status !== "retirable")) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "orphan-recovery-unavailable",
        activeDescriptorCount: activeDescriptors.length,
      };
    }
    const writerIdentity = observeWriterIdentity(scriptPath, deps);
    if (writerIdentity === null) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "orphan-recovery-unavailable",
        activeDescriptorCount: activeDescriptors.length,
      };
    }
    let postimage;
    try {
      const preview = deps.previewOnboardingSessionCleanupReleaseFn
        ?? previewOnboardingSessionCleanupRelease;
      postimage = preview({
        rootDir: binding.root,
        expectedStateSha256: binding.stateSha256,
        expectedRevision: binding.revision,
        sessionCleanup: binding.sessionCleanup,
      });
      if (postimage.status !== "previewed"
        || !new Set([binding.revision, binding.revision + 1]).has(postimage.revision)
        || !SHA256.test(postimage.stateSha256 ?? "")) {
        throw new Error("invalid cleanup release preview");
      }
    } catch {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "orphan-recovery-unavailable",
        activeDescriptorCount: activeDescriptors.length,
      };
    }
    return readyRecoveryPlan({
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      root: binding.root,
      stateSha256: binding.stateSha256,
      revision: binding.revision,
      sessionCleanup: binding.sessionCleanup,
      closure: "unknown",
      activeDescriptorCount: activeDescriptors.length,
      recovery: "retire-orphans-release-lost-binding",
      expectedBindingStatus: "bound",
      expectedPostStateSha256: postimage.stateSha256,
      expectedPostRevision: postimage.revision,
      writerIdentity,
      orphanDescriptors: orphanDescriptors.map((descriptor) => ({
        sessionId: descriptor.sessionId,
        descriptorSha256: descriptor.descriptorSha256,
        ownerStatus: descriptor.ownerStatus,
      })),
      applyAction: null,
    }, scriptPath);
  }
  const partial = {
    schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
    root: binding.root,
    stateSha256: binding.stateSha256,
    revision: binding.revision,
    sessionCleanup: binding.sessionCleanup,
    closure: "unknown",
    activeDescriptorCount: 0,
    recovery: "release-lost-binding",
    applyAction: null,
  };
  return readyRecoveryPlan(partial, scriptPath);
}

export function applySessionCleanupRecovery({
  rootDir,
  expectedPlanSha256,
  activate = false,
  scriptPath = DEFAULT_SCRIPT,
  deps = {},
} = {}) {
  if (activate !== true) {
    fail("WT-SESSION-RECOVERY-ACTIVATION", "cleanup recovery requires explicit activation");
  }
  const readBinding = deps.readOnboardingSessionCleanupBindingFn
    ?? readOnboardingSessionCleanupBinding;
  const before = readBinding({ rootDir });
  if (new Set(["released", "closed-unbound"]).has(before.status)
    && SHA256.test(expectedPlanSha256 ?? "")
    && before.releasePlanSha256 === expectedPlanSha256) {
    return {
      schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      status: "recovered",
      root: before.root,
      planSha256: expectedPlanSha256,
      stateSha256: before.stateSha256,
      revision: before.revision,
      mutated: false,
    };
  }
  let journalPlan = null;
  if (SHA256.test(expectedPlanSha256 ?? "")) {
    const paths = recoveryJournalPaths(before.root, expectedPlanSha256, deps, { create: false });
    if (existsSync(paths.journal)) {
      journalPlan = compositePlanFromJournal(
        readCompositeJournal(paths.journal, expectedPlanSha256, {
          platform: deps.platform ?? process.platform,
          assessWindowsPrivatePathFn: deps.assessWindowsPrivatePathFn ?? assessWindowsPrivatePath,
        }),
      );
    }
  }
  const plan = journalPlan
    ?? planSessionCleanupRecovery({ rootDir, scriptPath, deps });
  if (plan.status !== "ready"
    || !SHA256.test(expectedPlanSha256 ?? "")
    || plan.planSha256 !== expectedPlanSha256
    || digest(recoveryBinding(plan)) !== expectedPlanSha256) {
    fail("WT-SESSION-RECOVERY-PLAN", "cleanup recovery plan digest does not match");
  }
  if (plan.recovery === "quarantine-private-receipt") {
    backupOnboardingPrivateState(plan.root, deps);
    const quarantine = deps.quarantineClosedPrivateCleanupReleaseReceiptFn
      ?? quarantineClosedPrivateCleanupReleaseReceipt;
    const result = quarantine({
      rootDir: plan.root,
      expectedStateSha256: plan.stateSha256,
      expectedReceiptSha256: plan.privateReceiptRecoverySha256,
      recoveryPlanSha256: plan.planSha256,
      deps: { spawn: deps.spawn, now: deps.now },
    });
    if (result.status !== "closed-unbound" || result.sessionCleanup !== null) {
      fail("WT-SESSION-RECOVERY-READBACK", "private cleanup receipt recovery did not converge");
    }
    const readback = readBinding({ rootDir: plan.root });
    if (readback.status !== "closed-unbound"
      || readback.releasePlanSha256 !== plan.planSha256) {
      fail("WT-SESSION-RECOVERY-READBACK", "private cleanup receipt recovery readback is invalid");
    }
    return {
      schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      status: "recovered",
      root: plan.root,
      planSha256: plan.planSha256,
      stateSha256: result.stateSha256,
      revision: result.revision,
      mutated: result.mutated,
    };
  }
  if (plan.recovery === "bind-orphan") {
    const loadDescriptor = deps.loadSessionDescriptorFn ?? loadSessionDescriptor;
    const bind = deps.bindOnboardingSessionCleanupFn ?? bindOnboardingSessionCleanup;
    const descriptor = loadDescriptor(plan.root, plan.sessionCleanup.sessionId, {
      expectedDescriptorSha256: plan.sessionCleanup.descriptorSha256,
    });
    backupOnboardingPrivateState(plan.root, deps);
    const result = bind({
      rootDir: plan.root,
      expectedStateSha256: plan.stateSha256,
      expectedRevision: plan.revision,
      sessionCleanup: {
        sessionId: descriptor.sessionId,
        descriptorSha256: descriptor.descriptorSha256,
      },
    });
    if (!new Set(["bound", "reused"]).has(result.status)
      || result.sessionCleanup.sessionId !== plan.sessionCleanup.sessionId
      || result.sessionCleanup.descriptorSha256 !== plan.sessionCleanup.descriptorSha256) {
      fail("WT-SESSION-RECOVERY-READBACK", "cleanup recovery did not bind the exact active descriptor");
    }
    return {
      schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      status: "rebound",
      root: plan.root,
      planSha256: plan.planSha256,
      stateSha256: result.stateSha256,
      revision: result.revision,
    };
  }
  if (plan.recovery === "retire-orphans-release-lost-binding") {
    return applyCompositeSessionCleanupRecovery({
      plan,
      expectedPlanSha256,
      scriptPath,
      deps,
    });
  }
  if (new Set([
    "retire-orphans",
    "retire-externally-archived-orphans",
    "retire-mixed-orphans",
  ]).has(plan.recovery)) {
    const inspectRetirement = deps.inspectSessionRetirementFn
      ?? inspectSessionRetirement;
    const loadDescriptor = deps.loadSessionDescriptorFn ?? loadSessionDescriptor;
    const retireDescriptor = deps.retireSessionDescriptorFn
      ?? retireSessionDescriptor;
    const listDescriptors = deps.listActiveSessionDescriptorsFn
      ?? listActiveSessionDescriptors;
    const inspectExternal = deps.inspectExternallyArchivedSessionFn
      ?? inspectExternallyArchivedSession;
    const retireExternal = deps.retireExternallyArchivedSessionFn
      ?? retireExternallyArchivedSession;
    const externalById = new Map((plan.externalRetirements ?? []).map((entry) => [entry.sessionId, entry]));
    const prepared = plan.orphanDescriptors.map((expected) => {
      const observed = inspectRetirement(plan.root, expected.sessionId, {
        expectedDescriptorSha256: expected.descriptorSha256,
      });
      const requiresExternalRetirement = plan.recovery === "retire-externally-archived-orphans"
        || (plan.recovery === "retire-mixed-orphans" && externalById.has(expected.sessionId));
      const expectedRetirementStatus = requiresExternalRetirement
        ? "cleanup-required" : "retirable";
      if (observed.status !== expectedRetirementStatus
        || observed.ownerStatus !== expected.ownerStatus
        || observed.descriptorSha256 !== expected.descriptorSha256) {
        fail("WT-SESSION-RECOVERY-PLAN", "orphan descriptor retirement binding changed");
      }
      return loadDescriptor(plan.root, expected.sessionId, {
        expectedDescriptorSha256: expected.descriptorSha256,
      });
    });
    for (const descriptor of prepared) {
      backupBeforeMutation(plan.root, deps, `session-descriptor.${descriptor.sessionId}`, descriptor.path);
      const requiresExternalRetirement = plan.recovery === "retire-externally-archived-orphans"
        || (plan.recovery === "retire-mixed-orphans" && externalById.has(descriptor.sessionId));
      if (requiresExternalRetirement) {
        const expected = externalById.get(descriptor.sessionId);
        if (!expected || expected.descriptorSha256 !== descriptor.descriptorSha256) {
          fail("WT-SESSION-RECOVERY-PLAN", "external retirement descriptor binding changed");
        }
        const observed = inspectExternal(plan.root, descriptor.sessionId, {
          expectedDescriptorSha256: descriptor.descriptorSha256,
        });
        if (observed.status !== "ready"
          || observed.ownerStatus !== expected.ownerStatus
          || observed.manifestSha256 !== expected.manifestSha256
          || canonicalJson(observed.resources) !== canonicalJson(expected.resources)) {
          fail("WT-SESSION-RECOVERY-PLAN", "external retirement proof changed since planning");
        }
        backupExternalRetirementManifest(plan.root, deps, descriptor.sessionId);
        retireExternal(plan.root, {
          sessionId: descriptor.sessionId,
          descriptorSha256: descriptor.descriptorSha256,
          ownerNonce: descriptor.ownerNonce,
          expectedManifestSha256: expected.manifestSha256,
        });
      }
      retireDescriptor(plan.root, {
        sessionId: descriptor.sessionId,
        descriptorSha256: descriptor.descriptorSha256,
        ownerNonce: descriptor.ownerNonce,
      });
    }
    if (listDescriptors(plan.root).length !== 0) {
      fail("WT-SESSION-RECOVERY-READBACK", "orphan descriptor retirement did not clear the exact active set");
    }
    const readback = readBinding({ rootDir: plan.root });
    const expectedStatuses = new Set(["unbound", "closed-unbound", "design-unbound"]);
    if (!expectedStatuses.has(plan.expectedBindingStatus)
      || readback.status !== plan.expectedBindingStatus
      || readback.stateSha256 !== plan.stateSha256
      || readback.revision !== plan.revision
    ) {
      fail("WT-SESSION-RECOVERY-READBACK", "orphan descriptor retirement changed continuity authority");
    }
    return {
      schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      status: "retired",
      root: plan.root,
      planSha256: plan.planSha256,
      stateSha256: readback.stateSha256,
      revision: readback.revision,
      retiredDescriptorCount: prepared.length,
      externallyArchivedDescriptorCount: ["retire-externally-archived-orphans", "retire-mixed-orphans"].includes(plan.recovery)
        ? externalById.size : 0,
    };
  }
  if (plan.recovery === "release-closed-feature") {
    backupOnboardingPrivateState(plan.root, deps);
    const recordRelease = deps.recordClosedOnboardingSessionCleanupReleaseFn
      ?? recordClosedOnboardingSessionCleanupRelease;
    const result = recordRelease({
      rootDir: plan.root,
      expectedStateSha256: plan.stateSha256,
      releaseProof: plan.releaseProof,
      closureReceiptSha256: plan.closure.receiptSha256,
      recoveryPlanSha256: plan.planSha256,
      coordinatorCloseSha256: plan.coordinatorCloseSha256 ?? null,
      privateReceiptRecoverySha256: plan.privateReceiptRecoverySha256 ?? null,
      deps: {
        spawn: deps.spawn,
        afterReceiptWrite: deps.afterPrivateReleaseReceiptWrite,
        afterBindingUnlink: deps.afterPrivateReleaseBindingUnlink,
      },
    });
    if (!new Set(["released", "closed-unbound"]).has(result.status) || result.sessionCleanup !== null) {
      fail("WT-SESSION-RECOVERY-READBACK", "closed cleanup recovery did not record the exact release");
    }
    const readback = readBinding({ rootDir: plan.root });
    if (readback.status !== plan.expectedBindingStatus) {
      fail("WT-SESSION-RECOVERY-READBACK", "closed cleanup release readback is invalid");
    }
    return {
      schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      status: "recovered",
      root: plan.root,
      planSha256: plan.planSha256,
      stateSha256: result.stateSha256,
      revision: result.revision,
      mutated: result.mutated,
    };
  }
  if (plan.recovery !== "release-lost-binding") {
    fail("WT-SESSION-RECOVERY-PLAN", "cleanup recovery plan mode is invalid");
  }
  backupOnboardingPrivateState(plan.root, deps);
  const release = deps.releaseOnboardingSessionCleanupFn
    ?? releaseOnboardingSessionCleanup;
  const result = release({
    rootDir: plan.root,
    expectedStateSha256: plan.stateSha256,
    expectedRevision: plan.revision,
    sessionCleanup: plan.sessionCleanup,
  });
  if (result.status !== "released" || result.sessionCleanup !== null) {
    fail("WT-SESSION-RECOVERY-READBACK", "cleanup recovery did not release the exact State handle");
  }
  return {
    schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
    status: "recovered",
    root: plan.root,
    planSha256: plan.planSha256,
    stateSha256: result.stateSha256,
    revision: result.revision,
  };
}

// ---------------------------------------------------------------------------
// In-repository scratch descriptor binding (backlog item
// 2026-08-07-session-scratchpad-is-unwritable-under-the-cross-repo-guard.md,
// Candidate 2). A scratch directory is the SAME lifecycle problem the
// composite recovery machinery above solves for worktrees -- "does this
// claimed resource still belong to a live session, and can it be reclaimed
// safely when it does not" -- with a simpler target: one plain directory
// under the project's own `scratch/` (inside the guard's project-root
// containment boundary, so no guard exception is needed). This comment used to
// assert the directory was "already gitignored"; it was not, in any consumer
// project, until onboarding began seeding a `.gitignore` on 2026-08-09 -- and it
// still is not in a project that already owns one, which onboarding does not
// touch. Cleanup does not depend on the ignore rule, so the correction is to the
// claim, not to the mechanism. This is deliberately NOT routed through
// worktree-lifecycle.mjs's
// typed registerTemporaryIntent/finalizeTemporaryResource/cleanupSession
// resource system: that system's allowedRootFor() hard-binds every
// "scratch-file"/"scratch-directory" resource to the OS temp root
// (tmpdir()), which is exactly the host-temp placement this backlog item
// exists to move away from, and widening that binding touches
// worktree-lifecycle.mjs, outside this change's file scope. Instead this
// reuses THIS file's own already-proven primitives -- securePrivateDirectory/
// safePrivateFile/writeAtomicPrivate for crash-safe private state, and the
// same pid+processIdentity liveness check acquireCompositeLock already uses
// for stale-lock detection -- rather than inventing an unrelated second
// cleanup mechanism.
export const SCRATCH_DESCRIPTOR_SCHEMA = "pipeline.scratch-descriptor.v1";

const SAFE_SCRATCH_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/u;
const SAFE_SCRATCH_DIR_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

function scratchDescriptorDirectory(root, deps) {
  const spawn = deps.spawn ?? spawnSync;
  const result = spawn("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 5000,
  });
  if (result?.status !== 0 || result?.error) {
    fail("WT-SCRATCH-DESCRIPTOR", "Git common directory is unavailable");
  }
  const raw = String(result.stdout ?? "").trim();
  const common = realpathSync(isAbsolute(raw) ? raw : resolve(root, raw));
  const info = lstatSync(common);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("WT-SCRATCH-DESCRIPTOR", "Git common directory is unsafe");
  }
  const directory = join(common, "agent-pipeline", "scratch-descriptors");
  const security = {
    platform: deps.platform ?? process.platform,
    assessWindowsPrivatePathFn: deps.assessWindowsPrivatePathFn ?? assessWindowsPrivatePath,
    hardenWindowsPrivateDirectoryFn: deps.hardenWindowsPrivateDirectoryFn ?? hardenWindowsPrivateDirectory,
  };
  securePrivateDirectory(directory, security);
  return { directory, security };
}

function physicalScratchRoot(root) {
  const scratchRoot = resolve(root, "scratch");
  mkdirSync(scratchRoot, { recursive: true });
  const info = lstatSync(scratchRoot);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("WT-SCRATCH-ROOT", "scratch/ is not a plain directory");
  }
  const physical = realpathSync(scratchRoot);
  if (physical !== scratchRoot) {
    fail("WT-SCRATCH-ROOT", "scratch/ resolves through a symlink");
  }
  return physical;
}

function scratchDescriptorPath(descriptorDirectory, sessionId) {
  return join(descriptorDirectory, `${sessionId}.json`);
}

function validateScratchDescriptor(value, sessionId) {
  const keys = Object.keys(value ?? {}).sort();
  const expected = ["boundAt", "pid", "processIdentity", "schema", "scratchRelativePath", "sessionId"].sort();
  if (!isObject(value)
    || keys.length !== expected.length
    || !keys.every((key, index) => key === expected[index])
    || value.schema !== SCRATCH_DESCRIPTOR_SCHEMA
    || value.sessionId !== sessionId
    || !SAFE_SCRATCH_SESSION_ID.test(value.sessionId)
    || typeof value.scratchRelativePath !== "string"
    || !value.scratchRelativePath.startsWith("scratch/")
    || !SAFE_SCRATCH_DIR_NAME.test(value.scratchRelativePath.slice("scratch/".length))
    || !Number.isSafeInteger(value.pid) || value.pid < 1
    || !(value.processIdentity === null || /^[a-f0-9-]{36}:[0-9]+$/iu.test(value.processIdentity))
    || typeof value.boundAt !== "string" || value.boundAt === "") {
    fail("WT-SCRATCH-DESCRIPTOR", "scratch descriptor is invalid");
  }
  return value;
}

function removeClaimedScratchDirectory(scratchRoot, descriptor) {
  const dirName = descriptor.scratchRelativePath.slice("scratch/".length);
  const claimed = join(scratchRoot, dirName);
  if (!existsSync(claimed)) return;
  const info = lstatSync(claimed);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    fail("WT-SCRATCH-DESCRIPTOR", "claimed scratch path is not a plain directory");
  }
  if (dirname(claimed) !== scratchRoot) {
    fail("WT-SCRATCH-DESCRIPTOR", "claimed scratch path is not a direct child of scratch/");
  }
  rmSync(claimed, { recursive: true, force: false });
}

/**
 * Bind this session's own scratch subdirectory. Idempotent: a session that
 * calls this twice (e.g. a resumed bootstrap) gets back its own already-bound
 * directory rather than a second one. The directory name carries a
 * cryptographically random suffix so two sessions started at once cannot
 * collide without coordinating with each other; `mkdirSync` without
 * `recursive` makes the filesystem itself the collision judge -- on EEXIST
 * this draws a fresh suffix and retries rather than ever adopting a
 * directory it did not create.
 */
export function bindScratchDescriptor({ rootDir, sessionId, deps = {} } = {}) {
  if (typeof sessionId !== "string" || !SAFE_SCRATCH_SESSION_ID.test(sessionId)) {
    fail("WT-SCRATCH-DESCRIPTOR", "session ID is unsafe");
  }
  const root = realpathSync(resolve(rootDir));
  const scratchRoot = physicalScratchRoot(root);
  const { directory: descriptorDirectory, security } = scratchDescriptorDirectory(root, deps);
  const descriptorPath = scratchDescriptorPath(descriptorDirectory, sessionId);
  if (existsSync(descriptorPath)) {
    safePrivateFile(descriptorPath, security);
    const existing = validateScratchDescriptor(JSON.parse(readFileSync(descriptorPath, "utf8")), sessionId);
    const existingAbsolute = join(scratchRoot, existing.scratchRelativePath.slice("scratch/".length));
    if (existsSync(existingAbsolute)
      && lstatSync(existingAbsolute).isDirectory()
      && !lstatSync(existingAbsolute).isSymbolicLink()) {
      return { status: "reused", scratchRelativePath: existing.scratchRelativePath, descriptorPath };
    }
    fail("WT-SCRATCH-DESCRIPTOR", "bound scratch directory is missing or unsafe");
  }
  const now = (deps.now ?? (() => new Date()))();
  const pid = (deps.pidFn ?? (() => process.pid))();
  const processIdentity = (deps.processIdentityFn ?? defaultProcessIdentity)(pid);
  const randomHex = deps.randomHexFn ?? (() => randomBytes(4).toString("hex"));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const dirName = `${sessionId}-${randomHex()}`;
    if (!SAFE_SCRATCH_DIR_NAME.test(dirName)) continue;
    const candidate = join(scratchRoot, dirName);
    try {
      mkdirSync(candidate);
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw error;
    }
    const descriptor = validateScratchDescriptor({
      schema: SCRATCH_DESCRIPTOR_SCHEMA,
      sessionId,
      scratchRelativePath: `scratch/${dirName}`,
      boundAt: now.toISOString(),
      pid,
      processIdentity,
    }, sessionId);
    writeAtomicPrivate(descriptorPath, Buffer.from(`${JSON.stringify(descriptor)}\n`, "utf8"), security);
    return { status: "bound", scratchRelativePath: descriptor.scratchRelativePath, descriptorPath };
  }
  fail("WT-SCRATCH-DESCRIPTOR", "scratch directory name could not be allocated");
}

/**
 * Release this session's own scratch directory at session close. Deletes
 * ONLY the exact path this session's own descriptor claims -- never a glob,
 * never the whole `scratch/` root.
 */
export function releaseScratchDescriptor({ rootDir, sessionId, deps = {} } = {}) {
  if (typeof sessionId !== "string" || !SAFE_SCRATCH_SESSION_ID.test(sessionId)) {
    fail("WT-SCRATCH-DESCRIPTOR", "session ID is unsafe");
  }
  const root = realpathSync(resolve(rootDir));
  const scratchRoot = physicalScratchRoot(root);
  const { directory: descriptorDirectory, security } = scratchDescriptorDirectory(root, deps);
  const descriptorPath = scratchDescriptorPath(descriptorDirectory, sessionId);
  if (!existsSync(descriptorPath)) return { status: "not-bound" };
  safePrivateFile(descriptorPath, security);
  const descriptor = validateScratchDescriptor(JSON.parse(readFileSync(descriptorPath, "utf8")), sessionId);
  removeClaimedScratchDirectory(scratchRoot, descriptor);
  unlinkSync(descriptorPath);
  return { status: "released", scratchRelativePath: descriptor.scratchRelativePath };
}

/**
 * Read-only inspection of every bound scratch descriptor plus a liveness
 * verdict for each, reusing the exact same pid+processIdentity check
 * acquireCompositeLock already uses to distinguish a live owner from a
 * crashed one (PID reuse defeats a bare `process.kill(pid, 0)` check; the
 * recorded boot_id+start-ticks identity does not).
 */
export function planOrphanScratchRetirement({ rootDir, deps = {} } = {}) {
  const root = realpathSync(resolve(rootDir));
  const { directory: descriptorDirectory, security } = scratchDescriptorDirectory(root, deps);
  const names = existsSync(descriptorDirectory)
    ? readdirSync(descriptorDirectory).filter((name) => name.endsWith(".json"))
    : [];
  const entries = [];
  for (const name of names) {
    const sessionId = name.slice(0, -".json".length);
    if (!SAFE_SCRATCH_SESSION_ID.test(sessionId)) continue;
    const descriptorPath = join(descriptorDirectory, name);
    let descriptor;
    try {
      safePrivateFile(descriptorPath, security);
      descriptor = validateScratchDescriptor(JSON.parse(readFileSync(descriptorPath, "utf8")), sessionId);
    } catch {
      entries.push({ sessionId, descriptorPath, status: "invalid" });
      continue;
    }
    const processIdentity = (deps.processIdentityFn ?? defaultProcessIdentity)(descriptor.pid);
    const reusedPid = descriptor.processIdentity !== null
      && processIdentity !== null
      && processIdentity !== descriptor.processIdentity;
    const alive = reusedPid ? false : (deps.isProcessAliveFn ?? defaultProcessAlive)(descriptor.pid);
    entries.push({
      sessionId,
      descriptorPath,
      scratchRelativePath: descriptor.scratchRelativePath,
      status: alive === false ? "orphan" : "active",
    });
  }
  return entries;
}

/**
 * Retire every verified-orphaned scratch descriptor found by
 * planOrphanScratchRetirement -- called on a LATER bootstrap, never inline in
 * the crashed session itself, and never a wholesale clear of `scratch/`.
 * Immediately before deleting, each descriptor is re-read and re-validated
 * unchanged (defends against a race with a concurrent legitimate rebind of
 * the same session ID); a descriptor that no longer matches is retained
 * rather than forced.
 */
export function retireOrphanScratchDescriptors({ rootDir, deps = {} } = {}) {
  const root = realpathSync(resolve(rootDir));
  const scratchRoot = physicalScratchRoot(root);
  const { security } = scratchDescriptorDirectory(root, deps);
  const plan = planOrphanScratchRetirement({ rootDir, deps });
  let retired = 0;
  const retained = [];
  for (const entry of plan) {
    if (entry.status !== "orphan") {
      retained.push(entry);
      continue;
    }
    let descriptor;
    try {
      safePrivateFile(entry.descriptorPath, security);
      descriptor = validateScratchDescriptor(
        JSON.parse(readFileSync(entry.descriptorPath, "utf8")),
        entry.sessionId,
      );
    } catch {
      retained.push({ ...entry, status: "invalid" });
      continue;
    }
    if (descriptor.scratchRelativePath !== entry.scratchRelativePath) {
      retained.push({ ...entry, status: "changed" });
      continue;
    }
    removeClaimedScratchDirectory(scratchRoot, descriptor);
    try { unlinkSync(entry.descriptorPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    retired += 1;
  }
  return { retiredCount: retired, retained };
}

const SAFE_WORKTREE_DIR_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

/**
 * Read-only: which absolute paths `git worktree list --porcelain` currently reports for
 * `root`'s repository, resolved through realpathSync so a symlinked or differently-cased
 * mount matches the same directory this sweep inspects on disk. `null` on any command
 * failure -- callers MUST fail closed on `null` (never treat "the list command broke" as
 * "git knows about nothing"), exactly the same discipline `recoveryJournalPaths` already
 * applies to its own `git rev-parse --git-common-dir` call.
 */
/**
 * Shared low-level spawn: raw `git worktree list --porcelain` stdout for `root`'s repository, or
 * `null` on any command failure. Both `listRegisteredGitWorktrees` (orphan-directory sweep,
 * unchanged below) and `planRegisteredWorktreeRetirement` (registered-worktree retirement,
 * further below) parse this same raw text independently -- extracting the SPAWN call as the one
 * shared helper, deliberately NOT a shared parser, keeps each branch's own admission logic
 * untouched by the other's needs.
 */
function spawnWorktreeListPorcelain(root, deps) {
  const spawn = deps.spawn ?? spawnSync;
  const result = spawn("git", ["worktree", "list", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 5000,
  });
  if (result?.status !== 0 || result?.error || typeof result.stdout !== "string") return null;
  return result.stdout;
}

function listRegisteredGitWorktrees(root, deps) {
  const stdout = spawnWorktreeListPorcelain(root, deps);
  if (stdout === null) return null;
  const registered = new Set();
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("worktree ")) continue;
    const raw = line.slice("worktree ".length).trim();
    if (raw === "") continue;
    try { registered.add(realpathSync(raw)); } catch { /* the path no longer exists; not a live match either way */ }
  }
  return registered;
}

/**
 * Reads a worktree checkout's own `.git` FILE (never a directory -- that is a separate
 * clone, not a worktree remnant) and returns its recorded `gitdir:` target, resolved to an
 * absolute path. `null` on anything that does not look like a genuine worktree pointer file.
 */
function readWorktreeGitdirTarget(gitFilePath, worktreeDirectory) {
  let content;
  try { content = readFileSync(gitFilePath, "utf8"); } catch { return null; }
  const match = /^gitdir:\s*(.+)$/mu.exec(content);
  if (!match) return null;
  const target = match[1].trim();
  if (target === "") return null;
  return isAbsolute(target) ? target : resolve(worktreeDirectory, target);
}

/**
 * Read-only inspection of every directory directly under `.claude/worktrees/` (the Agent
 * tool / Workflow `agent()` worktree-isolation convention -- CLAUDE.md's own worktree
 * self-heal note; NOT the `.git/agent-pipeline/**` administrative registry
 * `worktree-lifecycle.mjs` owns, which this function never reads or touches). NEVER creates
 * `.claude/worktrees/` -- absence reads as "nothing to sweep", exactly like
 * `runBootstrapScratchLifecycle`'s own "no pre-existing scratch/, no sweep" rule, so a
 * project that has never used worktree isolation is never dirtied by this check.
 *
 * A directory is "orphan" -- the ONLY status `retireOrphanWorktreeDirectories` will ever
 * remove -- when ALL of the following hold, checked in order, each one fail-closed to a
 * non-"orphan" status on any doubt:
 *   1. Its name is safe and it is a plain direct-child directory of `.claude/worktrees/`,
 *      never a symlink.
 *   2. `git worktree list --porcelain` (from THIS repository root) does not report it -- the
 *      AC-3 hard rule inverted: a worktree git still knows about is NEVER a candidate,
 *      regardless of age. A `null` (list command failed) fails every entry closed to
 *      "unknown-git-worktree-list-unavailable", never to "orphan".
 *   3. It actually carries the fingerprint of a genuine worktree checkout: a `.git` FILE
 *      (not a directory -- a full clone is a different, more dangerous thing to touch and is
 *      always left alone) containing a `gitdir:` pointer. A directory the write-path
 *      allowlist merely permitted an agent to `mkdir -p` for unrelated scratch-like use, with
 *      no such file, is never a candidate -- it was never a worktree in the first place.
 *   4. The `.git` file's own recorded `gitdir:` target no longer exists on disk -- git's own
 *      administrative record for it is confirmed gone, not merely absent from one `list`
 *      invocation that might itself be racing a legitimate, in-progress `git worktree add`.
 * Any directory failing one of these is reported with an explicit non-"orphan" status and is
 * therefore always retained by the caller below -- ambiguity always resolves to leaving the
 * directory alone (AC-2).
 */
export function planOrphanWorktreeDirectories({ rootDir, deps = {} } = {}) {
  const root = realpathSync(resolve(rootDir));
  const worktreesRoot = resolve(root, ".claude", "worktrees");
  if (!existsSync(worktreesRoot)) return [];
  const rootInfo = lstatSync(worktreesRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    fail("WT-WORKTREE-SWEEP", ".claude/worktrees is not a plain directory");
  }
  const registered = listRegisteredGitWorktrees(root, deps);
  const entries = [];
  for (const name of readdirSync(worktreesRoot).sort()) {
    if (!SAFE_WORKTREE_DIR_NAME.test(name)) {
      entries.push({ name, status: "skipped-unsafe-name" });
      continue;
    }
    const candidate = join(worktreesRoot, name);
    let candidateInfo;
    try { candidateInfo = lstatSync(candidate); } catch { continue; }
    if (!candidateInfo.isDirectory() || candidateInfo.isSymbolicLink() || dirname(candidate) !== worktreesRoot) {
      entries.push({ name, status: "skipped-not-plain-directory" });
      continue;
    }
    if (registered === null) {
      entries.push({ name, status: "unknown-git-worktree-list-unavailable" });
      continue;
    }
    let realCandidate;
    try { realCandidate = realpathSync(candidate); } catch { entries.push({ name, status: "unknown" }); continue; }
    if (registered.has(realCandidate)) {
      entries.push({ name, status: "active-registered" });
      continue;
    }
    const gitFile = join(candidate, ".git");
    let gitFileInfo;
    try { gitFileInfo = lstatSync(gitFile); } catch { entries.push({ name, status: "not-a-worktree-checkout" }); continue; }
    if (!gitFileInfo.isFile() || gitFileInfo.isSymbolicLink()) {
      entries.push({ name, status: "not-a-worktree-checkout" });
      continue;
    }
    const gitdirTarget = readWorktreeGitdirTarget(gitFile, candidate);
    if (gitdirTarget === null) {
      entries.push({ name, status: "unknown" });
      continue;
    }
    entries.push({
      name,
      status: existsSync(gitdirTarget) ? "unknown" : "orphan",
      path: candidate,
    });
  }
  return entries;
}

/**
 * Retire every verified-orphaned worktree directory found by planOrphanWorktreeDirectories.
 * Mirrors retireOrphanScratchDescriptors's own discipline exactly: never a wholesale clear of
 * `.claude/worktrees/`, and every candidate is re-checked against a FRESH
 * `git worktree list --porcelain` immediately before deletion (defends against a race with a
 * concurrent, legitimate `git worktree add` landing between the plan and this call).
 */
export function retireOrphanWorktreeDirectories({ rootDir, deps = {} } = {}) {
  const root = realpathSync(resolve(rootDir));
  const worktreesRoot = resolve(root, ".claude", "worktrees");
  const plan = planOrphanWorktreeDirectories({ rootDir, deps });
  let retired = 0;
  const retained = [];
  for (const entry of plan) {
    if (entry.status !== "orphan") {
      retained.push(entry);
      continue;
    }
    const candidate = join(worktreesRoot, entry.name);
    let info;
    try { info = lstatSync(candidate); } catch { retained.push({ ...entry, status: "changed" }); continue; }
    if (!info.isDirectory() || info.isSymbolicLink() || dirname(candidate) !== worktreesRoot) {
      retained.push({ ...entry, status: "changed" });
      continue;
    }
    const registered = listRegisteredGitWorktrees(root, deps);
    if (registered === null) {
      retained.push({ ...entry, status: "unknown-git-worktree-list-unavailable" });
      continue;
    }
    let realCandidate;
    try { realCandidate = realpathSync(candidate); } catch { retained.push({ ...entry, status: "changed" }); continue; }
    if (registered.has(realCandidate)) {
      retained.push({ ...entry, status: "active-registered" });
      continue;
    }
    rmSync(candidate, { recursive: true, force: false });
    retired += 1;
  }
  return { retiredCount: retired, retained };
}

export const REGISTERED_WORKTREE_RETIREMENT_PLAN_SCHEMA = "pipeline.registered-worktree-retirement-plan.v1";

const HEAD_SHA_SHAPE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;

/**
 * Parses `git worktree list --porcelain` stdout into one record per worktree block (blocks are
 * blank-line separated per git-worktree(1)). Pure text parsing -- never resolves a path or
 * spawns anything -- kept separate from spawnWorktreeListPorcelain so a test can feed it captured
 * porcelain text directly. A block with no recognizable `worktree <path>` header line is dropped
 * rather than guessed at.
 */
function parseWorktreeListPorcelain(stdout) {
  const entries = [];
  for (const block of stdout.split("\n\n")) {
    const lines = block.split("\n").filter((line) => line !== "");
    if (lines.length === 0 || !lines[0].startsWith("worktree ")) continue;
    const rawPath = lines[0].slice("worktree ".length).trim();
    if (rawPath === "") continue;
    let headSha = null;
    let locked = false;
    for (const line of lines.slice(1)) {
      if (line.startsWith("HEAD ")) headSha = line.slice("HEAD ".length).trim();
      else if (line === "locked" || line.startsWith("locked ")) locked = true;
    }
    entries.push({ rawPath, headSha, locked });
  }
  return entries;
}

/**
 * Read-only: the repository's own main-worktree path (`git rev-parse --show-toplevel`, run from
 * `root`), resolved through realpathSync. `null` on any command failure -- callers MUST fail
 * closed, exactly like spawnWorktreeListPorcelain's own null contract. Used to identify the main
 * worktree by DIRECT comparison against every candidate's own resolved path, rather than by
 * trusting `git worktree list --porcelain`'s documented main-worktree-first ordering --
 * misidentifying the main worktree here is the one mistake this module cannot afford.
 */
function resolveMainWorktreePath(root, deps) {
  const spawn = deps.spawn ?? spawnSync;
  const result = spawn("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 5000,
  });
  if (result?.status !== 0 || result?.error || typeof result.stdout !== "string") return null;
  const raw = result.stdout.trim();
  if (raw === "") return null;
  try { return realpathSync(raw); } catch { return null; }
}

/**
 * Read-only: `git status --porcelain` output for the worktree at `worktreePath`, or `null` on
 * any command failure (fail-closed: an unreadable status is never treated as "clean").
 */
function spawnWorktreeStatusPorcelain(worktreePath, deps) {
  const spawn = deps.spawn ?? spawnSync;
  const result = spawn("git", ["status", "--porcelain"], {
    cwd: worktreePath,
    encoding: "utf8",
    shell: false,
    timeout: 5000,
  });
  if (result?.status !== 0 || result?.error || typeof result.stdout !== "string") return null;
  return result.stdout;
}

/**
 * Read-only: whether `headSha` is contained in (an ancestor of, or equal to) at least one LOCAL
 * branch tip -- `git branch --contains` is exactly this relation by definition (git-branch(1)).
 * `null` on any command failure (fail-closed: an unreadable answer is never treated as "yes").
 */
function spawnHeadContainedInLocalBranch(root, headSha, deps) {
  const spawn = deps.spawn ?? spawnSync;
  const result = spawn("git", ["branch", "--format=%(refname:short)", "--contains", headSha], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 5000,
  });
  if (result?.status !== 0 || result?.error || typeof result.stdout !== "string") return null;
  return result.stdout.trim() !== "";
}

/**
 * How long (ms) since a worktree's own gitdir last recorded a REF-CHANGING git operation before
 * the sweep will consider it a candidate at all (NVA-B-WTLIVE-1, fifth AC-2 condition, below).
 *
 * Evidence base (scratch/nva-b-wtlive-1-probe.mjs, run 2026-09-05, not committed -- see this
 * file's own commit message and NVA-B-WTLIVE-1's dispatch record for the reproduced numbers):
 *   - Real inter-commit gaps sampled from this repository's own committed
 *     evidence/dispatch-record-*.json `commits` arrays (resolved to commit timestamps via
 *     `git log`): 12 multi-commit dispatch records, 16 gaps total, max 361s, median 125s,
 *     p90 356s between two consecutive commits made by the SAME live dispatch. That is the
 *     fastest-moving legitimate signal this repository's own history can measure.
 *   - But the reflog only advances on a REF-CHANGING operation (commit, checkout, merge, reset,
 *     `worktree add` itself) -- a live dispatch reading, investigating, or running a long verify
 *     pass between commits produces NO reflog activity at all, and this repository's dispatch
 *     records track tool-use counts, not wall-clock time, so the true worst-case "live but
 *     git-silent" stretch cannot be measured directly from repo data. That gap is disclosed, not
 *     papered over: the threshold below carries a large safety multiplier over the measured
 *     361s ceiling specifically to cover it.
 *   - The one real abandonment this mechanism exists for (backlog:
 *     pipeline.a-registered-but-abandoned-worktree-is-never-retired, 2026-08-28) was stale by
 *     TWO DAYS (172800s) before anyone noticed. A threshold far below that still catches it.
 * 6 hours (21600s) is ~60x the measured 361s worst-case commit-to-commit gap, and ~1/8 of the one
 * measured real abandonment span -- comfortably on the decline side of "might still be live",
 * comfortably on the retire side of "definitely abandoned by everyone".
 */
const WORKTREE_LIVENESS_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/**
 * Read-only: milliseconds since `worktreePath`'s own linked gitdir (resolved via its `.git` FILE's
 * `gitdir:` pointer, exactly like readWorktreeGitdirTarget above) last recorded a REF-CHANGING git
 * operation, read from the mtime of `<gitdir>/logs/HEAD` -- the per-worktree HEAD reflog every
 * linked worktree gets from `git worktree add` onward, for BOTH an attached-branch worktree
 * (createBranchWorktree's shape) and a detached one (the shape `git worktree list --porcelain`
 * itself reports "detached", and the shape the 2026-08-28 backlog incident actually found).
 * Deliberately NOT the `.git/index` mtime: confirmed empirically
 * (scratch/nva-b-wtlive-1-probe.mjs) that this module's OWN read-only admission checks
 * (`git status --porcelain`, `git branch --contains`) refresh the index's mtime themselves, which
 * would make every sweep run see its own immediately-prior sweep as "recent activity" and never
 * retire anything. The reflog carries no such self-contamination: confirmed empirically that
 * neither of those two calls ever touches it, while an actual commit always does, for both
 * worktree shapes. `null` on any failure to resolve the gitdir or read the reflog's mtime --
 * callers MUST fail closed (an undeterminable age is never "old enough to retire").
 */
function readWorktreeLivenessAgeMs(worktreePath) {
  let gitdirTarget;
  try { gitdirTarget = readWorktreeGitdirTarget(join(worktreePath, ".git"), worktreePath); }
  catch { return null; }
  if (gitdirTarget === null) return null;
  let stat;
  try { stat = statSync(join(gitdirTarget, "logs", "HEAD")); }
  catch { return null; }
  if (!stat.isFile()) return null;
  return Date.now() - stat.mtimeMs;
}

/**
 * Evaluates exactly ONE registered worktree entry against the five AC-2 admission conditions, in
 * cheapest-first order (no subprocess spawned before one is actually needed), stopping at the
 * first one that fails or is undeterminable. Shared by planRegisteredWorktreeRetirement and
 * retireRegisteredWorktrees's own pre-mutation re-check, so both ever apply exactly one
 * definition of "retirable" (AC-4: reuse the mechanism rather than inventing a second one). Any
 * undeterminable step ("unknown-...") declines exactly like a failed condition -- ambiguity is
 * never treated as permission.
 */
function evaluateWorktreeCandidate({ root, mainWorktreePath, item, deps }) {
  let realPath;
  try { realPath = realpathSync(item.rawPath); }
  catch { return { path: item.rawPath, status: "unknown-path-unavailable" }; }
  if (realPath === mainWorktreePath) {
    return { path: realPath, status: "skipped-main-worktree" };
  }
  if (item.headSha === null || !HEAD_SHA_SHAPE.test(item.headSha)) {
    return { path: realPath, status: "unknown-head-unavailable" };
  }
  if (item.locked) {
    return { path: realPath, headSha: item.headSha, status: "declined-locked" };
  }
  const statusOutput = spawnWorktreeStatusPorcelain(realPath, deps);
  if (statusOutput === null) {
    return { path: realPath, headSha: item.headSha, status: "unknown-status-unavailable" };
  }
  if (statusOutput !== "") {
    return { path: realPath, headSha: item.headSha, status: "declined-not-clean" };
  }
  const contains = spawnHeadContainedInLocalBranch(root, item.headSha, deps);
  if (contains === null) {
    return { path: realPath, headSha: item.headSha, status: "unknown-branch-containment-unavailable" };
  }
  if (!contains) {
    return { path: realPath, headSha: item.headSha, status: "declined-head-not-contained" };
  }
  const livenessAgeMs = readWorktreeLivenessAgeMs(realPath);
  if (livenessAgeMs === null) {
    return { path: realPath, headSha: item.headSha, status: "unknown-liveness-unavailable" };
  }
  if (livenessAgeMs < WORKTREE_LIVENESS_THRESHOLD_MS) {
    return { path: realPath, headSha: item.headSha, status: "declined-recent-activity" };
  }
  return { path: realPath, headSha: item.headSha, status: "retirable" };
}

/**
 * Plans retirement of every REGISTERED worktree `git worktree list --porcelain` reports for
 * `rootDir`'s repository -- the complement of planOrphanWorktreeDirectories above, which only
 * ever considers a directory `git worktree list` no longer knows about at all. Backlog:
 * pipeline.a-registered-but-abandoned-worktree-is-never-retired (2026-08-28).
 *
 * Read-only: performs no deletion. A worktree is admitted (`status: "retirable"`) only when ALL
 * FIVE of these hold (AC-2), each checked by evaluateWorktreeCandidate above:
 *   1. it is not the main worktree (resolveMainWorktreePath, direct path comparison -- never
 *      inferred from list ordering);
 *   2. its working tree is clean (`git status --porcelain` empty, run inside the worktree);
 *   3. its HEAD is an ancestor of, or equal to, a local branch tip (`git branch --contains`);
 *   4. it carries no `locked` entry in `git worktree list --porcelain`;
 *   5. (NVA-B-WTLIVE-1) its own gitdir reflog (`logs/HEAD`) has recorded no ref-changing git
 *      operation within WORKTREE_LIVENESS_THRESHOLD_MS -- the fifth, additive condition that
 *      catches the case the first four alone cannot: a worktree a live dispatch is CURRENTLY
 *      using, which becomes clean + HEAD-at-branch-tip + unlocked the moment that dispatch makes
 *      its own first commit (recurs after every later commit too, not only once at creation).
 * Anything short of all five is returned with a distinct declined-/unknown- status naming which
 * check stopped it -- fail-open by design, exactly the orphan branch's own posture: ambiguity
 * always resolves to leaving the worktree alone, never to retiring it.
 *
 * `status: "unknown-git-worktree-list-unavailable"` at the top level (empty `entries`) is
 * returned when the underlying `git worktree list`/`git rev-parse --show-toplevel` calls
 * themselves fail -- there is no candidate list to evaluate at all in that case, unlike the
 * orphan branch above, which already has an independent directory listing to fall back on.
 */
export function planRegisteredWorktreeRetirement({ rootDir, deps = {} } = {}) {
  const root = realpathSync(resolve(rootDir));
  const stdout = spawnWorktreeListPorcelain(root, deps);
  const mainWorktreePath = resolveMainWorktreePath(root, deps);
  if (stdout === null || mainWorktreePath === null) {
    return {
      schema: REGISTERED_WORKTREE_RETIREMENT_PLAN_SCHEMA,
      status: "unknown-git-worktree-list-unavailable",
      entries: [],
    };
  }
  const entries = parseWorktreeListPorcelain(stdout)
    .map((item) => evaluateWorktreeCandidate({ root, mainWorktreePath, item, deps }));
  return {
    schema: REGISTERED_WORKTREE_RETIREMENT_PLAN_SCHEMA,
    status: "ready",
    entries,
  };
}

/**
 * Retires every REGISTERED worktree planRegisteredWorktreeRetirement marks "retirable", via
 * `git worktree remove` (never a raw filesystem delete -- a registered worktree carries
 * administrative state under the Git common dir that only `git worktree remove` cleans up
 * correctly).
 *
 * AC-4: never acts on an externally supplied plan -- this function only ever derives its OWN
 * plan (there is no plan parameter to accept), so it structurally cannot act on a plan it did not
 * produce. Immediately before EACH removal it re-derives fresh porcelain/status/branch state and
 * re-runs evaluateWorktreeCandidate on that exact candidate again (the same single evaluator
 * planRegisteredWorktreeRetirement itself uses, per AC-4's "reuse the mechanism" instruction) --
 * a worktree that became dirty, gained a lock, or moved its HEAD between the plan above and this
 * exact moment is caught here and retained, never removed.
 */
export function retireRegisteredWorktrees({ rootDir, deps = {} } = {}) {
  const root = realpathSync(resolve(rootDir));
  const plan = planRegisteredWorktreeRetirement({ rootDir: root, deps });
  if (plan.status !== "ready") {
    return { status: plan.status, retiredCount: 0, retained: plan.entries };
  }
  let retired = 0;
  const retained = [];
  for (const entry of plan.entries) {
    if (entry.status !== "retirable") {
      retained.push(entry);
      continue;
    }
    const stdout = spawnWorktreeListPorcelain(root, deps);
    const mainWorktreePath = resolveMainWorktreePath(root, deps);
    if (stdout === null || mainWorktreePath === null) {
      retained.push({ ...entry, status: "unknown-git-worktree-list-unavailable" });
      continue;
    }
    const fresh = parseWorktreeListPorcelain(stdout).find((item) => {
      try { return realpathSync(item.rawPath) === entry.path; } catch { return false; }
    });
    if (!fresh) {
      retained.push({ ...entry, status: "changed" });
      continue;
    }
    const recheck = evaluateWorktreeCandidate({ root, mainWorktreePath, item: fresh, deps });
    if (recheck.status !== "retirable") {
      retained.push(recheck);
      continue;
    }
    const spawn = deps.spawn ?? spawnSync;
    const result = spawn("git", ["worktree", "remove", entry.path], {
      cwd: root,
      encoding: "utf8",
      shell: false,
      timeout: 15000,
    });
    if (result?.status !== 0 || result?.error) {
      retained.push({ ...entry, status: "removal-failed" });
      continue;
    }
    retired += 1;
  }
  return { status: "ready", retiredCount: retired, retained };
}

export const sessionCleanupRecoveryInternals = {
  securePrivateDirectory,
  safePrivateFile,
  recoveryJournalPaths,
  backupBeforeMutation,
  backupOnboardingPrivateState,
  externalRetirementManifestPath,
};
