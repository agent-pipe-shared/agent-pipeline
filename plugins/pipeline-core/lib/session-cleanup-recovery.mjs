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
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  bindOnboardingSessionCleanup,
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
    requiresConfirmation: true,
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
 * descriptor can be rebound through explicit PO confirmation. Multiple exact
 * descriptors may be retired only when each one either has no cleanup manifest
 * and is independently retirable, or carries the separate external-archive
 * proof. The legacy V1 owner case is therefore a Human-only, digest-bound
 * recovery rather than an automatic cleanup. A bound handle whose private
 * descriptor and closure receipt are both absent can be released. Active bound
 * descriptors still require ordinary cleanup and closed ones release-binding.
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
        },
      };
    }
    if (closure.status !== "closed" || !SHA256.test(closure.receiptSha256 ?? "")) {
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
      sessionCleanup: binding.sessionCleanup,
      closure,
      activeDescriptorCount: 0,
      recovery: "release-closed-feature",
      releaseProof: binding.releaseProof,
      applyAction: null,
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
  if (before.status === "released"
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
  if (plan.recovery === "bind-orphan") {
    const loadDescriptor = deps.loadSessionDescriptorFn ?? loadSessionDescriptor;
    const bind = deps.bindOnboardingSessionCleanupFn ?? bindOnboardingSessionCleanup;
    const descriptor = loadDescriptor(plan.root, plan.sessionCleanup.sessionId, {
      expectedDescriptorSha256: plan.sessionCleanup.descriptorSha256,
    });
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
    const recordRelease = deps.recordClosedOnboardingSessionCleanupReleaseFn
      ?? recordClosedOnboardingSessionCleanupRelease;
    const result = recordRelease({
      rootDir: plan.root,
      expectedStateSha256: plan.stateSha256,
      releaseProof: plan.releaseProof,
      closureReceiptSha256: plan.closure.receiptSha256,
      recoveryPlanSha256: plan.planSha256,
      deps: { spawn: deps.spawn },
    });
    if (result.status !== "released" || result.sessionCleanup !== null) {
      fail("WT-SESSION-RECOVERY-READBACK", "closed cleanup recovery did not record the exact release");
    }
    const readback = readBinding({ rootDir: plan.root });
    if (readback.status !== "released") {
      fail("WT-SESSION-RECOVERY-READBACK", "closed cleanup release readback is invalid");
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
  if (plan.recovery !== "release-lost-binding") {
    fail("WT-SESSION-RECOVERY-PLAN", "cleanup recovery plan mode is invalid");
  }
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

export const sessionCleanupRecoveryInternals = {
  securePrivateDirectory,
  safePrivateFile,
  recoveryJournalPaths,
};
