#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Bind the sandbox-observed fresh Codex control mounts to one host-only Git
 * initialization. The host apply deliberately does not rerun onboarding:
 * Codex's virtual .git/.codex mounts are absent at that boundary.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { inspectProjectOnboardingV3 } from "../lib/project-onboarding-v3.mjs";
import {
  CODEX_HOST_REPOSITORY_INIT_DIRECTORY,
  CODEX_HOST_REPOSITORY_INIT_INTENT,
  CODEX_HOST_REPOSITORY_INIT_MARKER,
  CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
  CODEX_HOST_REPOSITORY_INIT_RECEIPT,
  codexHostRepositoryAuthoritySha256,
  readCodexHostRepositoryInitAdmission,
} from "../lib/codex-host-layout.mjs";
import {
  NEUTRAL_CALIBRATION,
  NEUTRAL_MANIFEST,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";

const PLAN_SCHEMA = "pipeline.codex-host-repository-init-plan.v1";
const APPLY_SCHEMA = "pipeline.codex-host-repository-init-apply.v1";
const GIT_RESERVATION_SCHEMA = "pipeline.codex-host-git-reservation.v1";
const GIT_INITIALIZED_SCHEMA = "pipeline.codex-host-git-initialized.v1";
const GIT_RESERVATION_FILE = "git-reservation.json";
const GIT_INITIALIZED_FILE = "git-initialized.json";
const GIT_TEMPLATE_DIRECTORY = "git-template";
const OPERATIONAL_FS_ERRORS = new Set([
  "EACCES", "EBUSY", "EDQUOT", "EIO", "EMFILE", "ENFILE", "ENOMEM",
  "ENOSPC", "EPERM", "EROFS",
]);
const INITIAL_GIT_PATHS = new Set([
  "",
  "HEAD",
  "config",
  "objects",
  "objects/info",
  "objects/pack",
  "refs",
  "refs/heads",
  "refs/tags",
]);
function portableAuthorityPaths(root) {
  const authority = resolveProjectAuthorityPaths({ rootDir: root });
  return authority.status === "ready"
    ? authority
    : {
      calibration: NEUTRAL_CALIBRATION,
      manifest: NEUTRAL_MANIFEST,
      state: NEUTRAL_STATE,
    };
}

function requiredPortablePaths(root) {
  const authority = portableAuthorityPaths(root);
  return [
    "pipeline.user.yaml",
    authority.calibration,
    authority.manifest,
    ".claude/settings.json",
    authority.state,
    "docs/state.md",
    "specs/kickoff-initial-prd.md",
    "specs/kickoff-initial-spec.md",
    ".claude/.runtime/agent-pipeline/onboarding/continuity-history.json",
  ];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function safeRoot(rootDir, fs = {}) {
  const requested = resolve(rootDir);
  const root = (fs.realpathSync ?? realpathSync)(requested);
  if (root !== requested) throw new Error("root must be a physical non-symlink path");
  const stat = (fs.lstatSync ?? lstatSync)(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("root must be a physical directory");
  return root;
}

function portableSnapshot(root, fs = {}) {
  const read = fs.readFileSync ?? readFileSync;
  const lstat = fs.lstatSync ?? lstatSync;
  const authority = portableAuthorityPaths(root);
  const files = requiredPortablePaths(root).map((path) => {
    const absolute = join(root, path);
    const stat = lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`required portable file is unsafe: ${path}`);
    return { path, sha256: sha256(read(absolute)) };
  });
  const calibrationBytes = read(join(root, authority.calibration));
  const calibration = JSON.parse(calibrationBytes.toString("utf8"));
  if (calibration?.repositoryMode !== "host-managed") {
    throw new Error("portable calibration is not host-managed");
  }
  return {
    root,
    files,
    calibrationSha256: sha256(calibrationBytes),
  };
}

function digest(snapshot) {
  return sha256(JSON.stringify(stable(snapshot)));
}

function applyAction(root, planSha256) {
  return {
    kind: "command",
    executable: "node",
    argv: [
      fileURLToPath(import.meta.url),
      "apply",
      "--root",
      root,
      "--plan-sha256",
      planSha256,
      "--activate",
    ],
    mutation: true,
    requiresConfirmation: true,
    requiresHostBoundary: true,
    expected: {
      schema: APPLY_SCHEMA,
      statuses: ["restart-required", "host-preimage-changed", "git-unavailable", "apply-failed", "rollback-failed"],
    },
  };
}

export function planHostRepositoryInit({ rootDir = process.cwd(), deps = {} } = {}) {
  const root = safeRoot(rootDir, deps);
  const lifecycle = (deps.inspectProjectOnboardingV3 ?? inspectProjectOnboardingV3)({
    rootDir: root,
    intent: "bootstrap",
    deps,
  });
  const accepted = lifecycle.status === "host-repository-init-required"
    && lifecycle.repository?.status === "host-managed"
    && lifecycle.repository?.mode === "host-managed"
    && lifecycle.repository?.gitVersion === null
    && lifecycle.runtime?.status === "plugin-managed-unattested"
    && lifecycle.runtime?.sourceSha256
    && lifecycle.runtime?.targetsSha256 === null
    && lifecycle.runtime?.barrierSha256 === null
    && lifecycle.runtime?.readbackSha256 === null
    && lifecycle.continuity?.status === "valid"
    && lifecycle.appServer?.required === false
    && lifecycle.appServer?.status === "not-requested"
    && lifecycle.appServer?.code === null
    && lifecycle.nextAction?.kind === "command"
    && lifecycle.nextAction?.executable === "node"
    && JSON.stringify(lifecycle.nextAction?.argv) === JSON.stringify([
      fileURLToPath(import.meta.url),
      "plan",
      "--root",
      root,
    ])
    && lifecycle.nextAction?.mutation === false
    && lifecycle.nextAction?.requiresConfirmation === false;
  if (!accepted) {
    return {
      schema: PLAN_SCHEMA,
      status: "not-applicable",
      root,
      planSha256: null,
      applyAction: null,
      diagnostics: [{ code: "host_managed_bootstrap_not_ready" }],
    };
  }
  const snapshot = portableSnapshot(root, deps);
  const planSha256 = digest(snapshot);
  return {
    schema: PLAN_SCHEMA,
    status: "ready",
    root,
    planSha256,
    changes: [
      ".git",
      ".git/agent-pipeline/onboarding/continuity-history.json",
      CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
      CODEX_HOST_REPOSITORY_INIT_DIRECTORY,
      CODEX_HOST_REPOSITORY_INIT_INTENT,
      CODEX_HOST_REPOSITORY_INIT_RECEIPT,
      CODEX_HOST_REPOSITORY_INIT_MARKER,
    ],
    createsCommit: false,
    applyAction: applyAction(root, planSha256),
    diagnostics: [],
  };
}

function parseGitVersion(output) {
  const match = String(output ?? "").match(/^git version (\d+)\.(\d+)(?:\.(\d+))?/u);
  if (!match) return null;
  const version = match.slice(1).map((value) => Number.parseInt(value ?? "0", 10));
  return version[0] > 2 || (version[0] === 2 && version[1] >= 28) ? match[0].slice("git version ".length) : null;
}

function physicalIdentity(info, kind) {
  const valid = kind === "directory"
    ? info && !info.isSymbolicLink() && info.isDirectory()
    : info && !info.isSymbolicLink() && info.isFile() && info.nlink === 1;
  return valid ? { dev: String(info.dev), ino: String(info.ino), kind } : null;
}

class HostInitDriftError extends Error {}

function drift(message) {
  return new HostInitDriftError(message);
}

function samePhysicalIdentity(path, expected, fs = {}) {
  if (!expected) return false;
  try {
    const info = (fs.lstatSync ?? lstatSync)(path);
    const actual = physicalIdentity(info, expected.kind);
    return actual?.dev === expected.dev && actual?.ino === expected.ino;
  } catch (error) {
    if (OPERATIONAL_FS_ERRORS.has(error?.code)) throw error;
    return false;
  }
}

function physicalTreeSnapshot(path, fs = {}) {
  const lstat = fs.lstatSync ?? lstatSync;
  const readdir = fs.readdirSync ?? readdirSync;
  const rows = [];
  function visit(current, relative) {
    const before = lstat(current);
    const directoryIdentity = physicalIdentity(before, "directory");
    if (directoryIdentity) {
      const names = readdir(current).sort();
      for (const name of names) {
        visit(join(current, name), relative ? `${relative}/${name}` : name);
      }
      if (!samePhysicalIdentity(current, directoryIdentity, fs)
        || JSON.stringify(readdir(current).sort()) !== JSON.stringify(names)) {
        throw drift("Git control directory changed during tree observation");
      }
      rows.push({
        path: relative,
        kind: "directory",
        dev: directoryIdentity.dev,
        ino: directoryIdentity.ino,
      });
      return;
    }
    const observed = readBoundFileObservation(current, fs, { preserveOperationalError: true });
    if (!observed) throw drift("Git control tree contains an unsafe or raced file");
    rows.push({
      path: relative,
      kind: "file",
      dev: observed.identity.dev,
      ino: observed.identity.ino,
      sha256: sha256(observed.bytes),
    });
  }
  visit(path, "");
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

function assertPhysicalDirectory(path, fs = {}) {
  const identity = physicalIdentity((fs.lstatSync ?? lstatSync)(path), "directory");
  if (!identity) throw new Error("host-init path contains a non-physical directory");
  return identity;
}

function assertPhysicalParents(root, relative, fs = {}) {
  let current = root;
  for (const component of relative.split("/")) {
    current = join(current, component);
    assertPhysicalDirectory(current, fs);
  }
}

function createPrivateDirectory(path, parent, created, fs = {}) {
  const exists = fs.existsSync ?? existsSync;
  if (exists(path)) throw new Error("host-init private directory appeared before creation");
  assertPhysicalDirectory(parent, fs);
  (fs.mkdirSync ?? mkdirSync)(path, { mode: 0o700 });
  const identity = physicalIdentity((fs.lstatSync ?? lstatSync)(path), "directory");
  if (!identity) throw new Error("created host-init directory identity is unavailable");
  created.directories.push({ path, identity });
}

function cleanupCapturePath(quarantineDirectory, fs = {}) {
  const random = fs.randomBytes ?? randomBytes;
  return join(quarantineDirectory, `captured-${random(12).toString("hex")}`);
}

function createCleanupQuarantine(parent, fs = {}) {
  const exists = fs.existsSync ?? existsSync;
  const random = fs.randomBytes ?? randomBytes;
  const parentIdentity = assertPhysicalDirectory(parent, fs);
  const path = join(parent, `.host-init-quarantine-${random(12).toString("hex")}`);
  if (exists(path)) throw new Error("host-init cleanup quarantine already exists");
  (fs.mkdirSync ?? mkdirSync)(path, { mode: 0o700 });
  const identity = physicalIdentity((fs.lstatSync ?? lstatSync)(path), "directory");
  if (!identity || !samePhysicalIdentity(parent, parentIdentity, fs)) {
    throw new Error("host-init cleanup quarantine identity is unavailable");
  }
  fsyncDirectory(parent, fs);
  return { path, identity };
}

function restoreCleanupCapture(path, capture, captured, fs = {}) {
  const exists = fs.existsSync ?? existsSync;
  if (!exists(path) && exists(capture) && samePhysicalIdentity(capture, captured, fs)) {
    (fs.renameSync ?? renameSync)(capture, path);
    fsyncDirectory(dirname(path), fs);
  }
}

function removeCreatedFile(path, expected, fs = {}, expectedBytes = null, quarantineParent) {
  const exists = fs.existsSync ?? existsSync;
  if (!exists(path)) return;
  if (!samePhysicalIdentity(path, expected, fs)
    || (expectedBytes !== null && !exactFile(path, expectedBytes, fs))) {
    throw new Error("created host-init file changed identity before rollback");
  }
  const parent = dirname(path);
  const parentIdentity = assertPhysicalDirectory(parent, fs);
  const quarantine = createCleanupQuarantine(quarantineParent, fs);
  const capture = cleanupCapturePath(quarantine.path, fs);
  if (exists(capture)) throw new Error("host-init cleanup capture already exists");
  (fs.faultInjector ?? (() => {}))("before-host-init-cleanup-capture", {
    path,
    kind: "file",
  });
  (fs.renameSync ?? renameSync)(path, capture);
  fsyncDirectory(parent, fs);
  fsyncDirectory(quarantine.path, fs);
  const capturedIdentity = physicalIdentity((fs.lstatSync ?? lstatSync)(capture), "file");
  try {
    if (!samePhysicalIdentity(capture, expected, fs)
      || (expectedBytes !== null && !exactFile(capture, expectedBytes, fs))
      || !samePhysicalIdentity(parent, parentIdentity, fs)
      || !samePhysicalIdentity(quarantine.path, quarantine.identity, fs)) {
      throw new Error("created host-init file changed during cleanup capture");
    }
  } catch (error) {
    restoreCleanupCapture(path, capture, capturedIdentity, fs);
    throw error;
  }
}

function removeCreatedDirectory(path, expected, fs = {}, quarantineParent) {
  const exists = fs.existsSync ?? existsSync;
  const readdir = fs.readdirSync ?? readdirSync;
  if (!exists(path)) return;
  if (!samePhysicalIdentity(path, expected, fs) || readdir(path).length !== 0) {
    throw new Error("created host-init directory changed identity before rollback");
  }
  const parent = dirname(path);
  const parentIdentity = assertPhysicalDirectory(parent, fs);
  const quarantine = createCleanupQuarantine(quarantineParent, fs);
  const capture = cleanupCapturePath(quarantine.path, fs);
  if (exists(capture)) throw new Error("host-init cleanup capture already exists");
  (fs.faultInjector ?? (() => {}))("before-host-init-cleanup-capture", {
    path,
    kind: "directory",
  });
  (fs.renameSync ?? renameSync)(path, capture);
  fsyncDirectory(parent, fs);
  fsyncDirectory(quarantine.path, fs);
  const capturedIdentity = physicalIdentity((fs.lstatSync ?? lstatSync)(capture), "directory");
  try {
    if (!samePhysicalIdentity(capture, expected, fs)
      || readdir(capture).length !== 0
      || !samePhysicalIdentity(parent, parentIdentity, fs)
      || !samePhysicalIdentity(quarantine.path, quarantine.identity, fs)) {
      throw new Error("created host-init directory changed during cleanup capture");
    }
  } catch (error) {
    restoreCleanupCapture(path, capture, capturedIdentity, fs);
    throw error;
  }
}

function fsyncDirectory(path, fs = {}) {
  if ((fs.process?.platform ?? process.platform) === "win32") return;
  const open = fs.openSync ?? openSync;
  const fstat = fs.fstatSync ?? fstatSync;
  const sync = fs.fsyncSync ?? fsyncSync;
  const close = fs.closeSync ?? closeSync;
  const fsConstants = fs.constants ?? constants;
  const before = physicalIdentity((fs.lstatSync ?? lstatSync)(path), "directory");
  if (!before) throw drift("host-init durability path is not a physical directory");
  const descriptor = open(
    path,
    fsConstants.O_RDONLY
      | (fsConstants.O_DIRECTORY ?? 0)
      | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = physicalIdentity(fstat(descriptor), "directory");
    if (!opened || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw drift("host-init durability directory changed before fsync");
    }
    sync(descriptor);
    const after = physicalIdentity(fstat(descriptor), "directory");
    if (!after || after.dev !== opened.dev || after.ino !== opened.ino
      || !samePhysicalIdentity(path, opened, fs)) {
      throw drift("host-init durability directory changed during fsync");
    }
  } finally {
    close(descriptor);
  }
}

function readBoundFileObservation(path, fs = {}, { preserveOperationalError = false } = {}) {
  const lstat = fs.lstatSync ?? lstatSync;
  const open = fs.openSync ?? openSync;
  const fstat = fs.fstatSync ?? fstatSync;
  const read = fs.readFileSync ?? readFileSync;
  const close = fs.closeSync ?? closeSync;
  const fsConstants = fs.constants ?? constants;
  let descriptor;
  try {
    const parent = dirname(path);
    const parentIdentity = assertPhysicalDirectory(parent, fs);
    const before = physicalIdentity(lstat(path), "file");
    if (!before) return null;
    descriptor = open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = physicalIdentity(fstat(descriptor), "file");
    if (opened?.dev !== before.dev || opened?.ino !== before.ino) return null;
    const bytes = read(descriptor);
    const after = physicalIdentity(fstat(descriptor), "file");
    return after?.dev === opened.dev && after?.ino === opened.ino
      && samePhysicalIdentity(path, opened, fs)
      && samePhysicalIdentity(parent, parentIdentity, fs)
      ? { bytes, identity: opened }
      : null;
  } catch (error) {
    if (preserveOperationalError && OPERATIONAL_FS_ERRORS.has(error?.code)) throw error;
    return null;
  } finally {
    if (descriptor !== undefined) {
      try { close(descriptor); } catch {}
    }
  }
}

function readBoundFile(path, fs = {}) {
  return readBoundFileObservation(path, fs)?.bytes ?? null;
}

function exactFile(path, bytes, fs = {}) {
  return readBoundFile(path, fs)?.compare(bytes) === 0;
}

function writeDurableExclusive(path, bytes, fs = {}) {
  const open = fs.openSync ?? openSync;
  const write = fs.writeFileSync ?? writeFileSync;
  const sync = fs.fsyncSync ?? fsyncSync;
  const close = fs.closeSync ?? closeSync;
  const fstat = fs.fstatSync ?? fstatSync;
  const fsConstants = fs.constants ?? constants;
  let descriptor;
  const parent = dirname(path);
  const parentIdentity = assertPhysicalDirectory(parent, fs);
  try {
    descriptor = open(path, fsConstants.O_WRONLY | fsConstants.O_CREAT
      | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    write(descriptor, bytes);
    sync(descriptor);
    const identity = physicalIdentity(fstat(descriptor), "file");
    if (!identity) throw new Error("published host-init file identity is unavailable");
    if (!samePhysicalIdentity(parent, parentIdentity, fs)) {
      throw new Error("host-init file parent changed during publication");
    }
    return identity;
  } finally {
    if (descriptor !== undefined) close(descriptor);
  }
}

function ensureExactDurableFile(path, bytes, fs = {}) {
  if ((fs.existsSync ?? existsSync)(path)) {
    const open = fs.openSync ?? openSync;
    const fstat = fs.fstatSync ?? fstatSync;
    const read = fs.readFileSync ?? readFileSync;
    const sync = fs.fsyncSync ?? fsyncSync;
    const close = fs.closeSync ?? closeSync;
    const fsConstants = fs.constants ?? constants;
    const parent = dirname(path);
    const parentIdentity = assertPhysicalDirectory(parent, fs);
    const before = physicalIdentity((fs.lstatSync ?? lstatSync)(path), "file");
    let descriptor;
    try {
      if (!before) throw drift("host-init transaction file drifted");
      descriptor = open(path, fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW ?? 0));
      const opened = physicalIdentity(fstat(descriptor), "file");
      if (!opened || opened.dev !== before.dev || opened.ino !== before.ino
        || read(descriptor).compare(bytes) !== 0) {
        throw drift("host-init transaction file drifted");
      }
      sync(descriptor);
      const after = physicalIdentity(fstat(descriptor), "file");
      if (!after || after.dev !== opened.dev || after.ino !== opened.ino
        || !samePhysicalIdentity(path, opened, fs)
        || !samePhysicalIdentity(parent, parentIdentity, fs)) {
        throw drift("host-init transaction file changed during durability replay");
      }
      return opened;
    } finally {
      if (descriptor !== undefined) close(descriptor);
    }
  }
  const identity = writeDurableExclusive(path, bytes, fs);
  if (!samePhysicalIdentity(path, identity, fs) || !exactFile(path, bytes, fs)) {
    throw drift("host-init transaction file readback failed");
  }
  return identity;
}

function transactionIntent(root, planSha256) {
  return {
    schema: "pipeline.codex-host-repository-init-intent.v1",
    rootSha256: sha256(Buffer.from(root, "utf8")),
    planSha256,
  };
}

function prepareTransaction(root, planSha256, fs = {}) {
  const pendingPath = join(root, CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY);
  const parent = join(root, ".claude/.runtime/agent-pipeline/onboarding");
  const intentBytes = Buffer.from(`${JSON.stringify(transactionIntent(root, planSha256), null, 2)}\n`, "utf8");
  const exists = fs.existsSync ?? existsSync;
  assertPhysicalParents(root, ".claude/.runtime/agent-pipeline/onboarding", fs);
  const parentIdentity = assertPhysicalDirectory(parent, fs);
  let pendingIdentity;
  let intentIdentity;
  if (!exists(pendingPath)) {
    (fs.mkdirSync ?? mkdirSync)(pendingPath, { mode: 0o700 });
    pendingIdentity = physicalIdentity((fs.lstatSync ?? lstatSync)(pendingPath), "directory");
    if (!pendingIdentity) throw new Error("host-init pending transaction identity is unavailable");
    intentIdentity = ensureExactDurableFile(join(pendingPath, "intent.json"), intentBytes, fs);
  }
  pendingIdentity ??= assertPhysicalDirectory(pendingPath, fs);
  const intent = readBoundFileObservation(join(pendingPath, "intent.json"), fs);
  if (!intent || intent.bytes.compare(intentBytes) !== 0
    || !samePhysicalIdentity(pendingPath, pendingIdentity, fs)) {
    throw drift("host-init pending transaction does not match the reviewed plan");
  }
  intentIdentity = ensureExactDurableFile(
    join(pendingPath, "intent.json"),
    intentBytes,
    fs,
  );
  fsyncDirectory(pendingPath, fs);
  fsyncDirectory(parent, fs);
  if (!samePhysicalIdentity(pendingPath, pendingIdentity, fs)
    || !samePhysicalIdentity(parent, parentIdentity, fs)) {
    throw drift("host-init pending transaction changed during durability replay");
  }
  return {
    pendingPath,
    intentBytes,
    cleanup: {
      pending: { path: pendingPath, identity: pendingIdentity },
      intent: {
        path: join(pendingPath, "intent.json"),
        identity: intentIdentity,
        bytes: intentBytes,
      },
    },
  };
}

function readClosedJson(path, keys, schema, fs = {}) {
  try {
    const observed = readBoundFileObservation(path, fs);
    if (!observed) return null;
    const value = JSON.parse(observed.bytes.toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      && value.schema === schema
      && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
      ? { value, bytes: observed.bytes, identity: observed.identity }
      : null;
  } catch {
    return null;
  }
}

function initialGitTree(path, fs = {}) {
  let rows;
  try {
    rows = physicalTreeSnapshot(path, fs).filter(
      (row) => row.path !== "agent-pipeline" && !row.path.startsWith("agent-pipeline/"),
    );
  } catch (error) {
    if (error instanceof HostInitDriftError
      || ["ENOENT", "ENOTDIR", "ELOOP"].includes(error?.code)) {
      throw error instanceof HostInitDriftError
        ? error
        : drift("initialized Git control tree changed during observation");
    }
    throw error;
  }
  if (rows.some((row) => !INITIAL_GIT_PATHS.has(row.path))) {
    throw drift("initialized Git control tree contains an unexpected path");
  }
  if (!INITIAL_GIT_PATHS.size || rows.length !== INITIAL_GIT_PATHS.size) {
    throw drift("initialized Git control tree is incomplete");
  }
  return rows.map(({ path: relativePath, kind, sha256: digestValue = null }) => ({
    path: relativePath,
    kind,
    sha256: digestValue,
  }));
}

function prepareGitControl(root, planSha256, currentGitVersion, pendingPath, spawn, fs = {}) {
  const gitPath = join(root, ".git");
  const reservationPath = join(pendingPath, GIT_RESERVATION_FILE);
  const initializedPath = join(pendingPath, GIT_INITIALIZED_FILE);
  const templatePath = join(pendingPath, GIT_TEMPLATE_DIRECTORY);
  const exists = fs.existsSync ?? existsSync;
  const rootSha256 = sha256(Buffer.from(root, "utf8"));
  let gitIdentity;
  let reservationIdentity;
  let reservationBytes;
  if (!exists(gitPath)) {
    const rootIdentity = assertPhysicalDirectory(root, fs);
    (fs.mkdirSync ?? mkdirSync)(gitPath, { mode: 0o700 });
    gitIdentity = physicalIdentity((fs.lstatSync ?? lstatSync)(gitPath), "directory");
    if (!gitIdentity || !samePhysicalIdentity(root, rootIdentity, fs)) {
      throw drift("Git reservation identity is unavailable");
    }
    const reservation = {
      schema: GIT_RESERVATION_SCHEMA,
      rootSha256,
      planSha256,
      device: gitIdentity.dev,
      inode: gitIdentity.ino,
    };
    reservationBytes = Buffer.from(`${JSON.stringify(reservation, null, 2)}\n`, "utf8");
    reservationIdentity = ensureExactDurableFile(reservationPath, reservationBytes, fs);
    fsyncDirectory(gitPath, fs);
    fsyncDirectory(root, fs);
    fsyncDirectory(pendingPath, fs);
  } else {
    const observed = readClosedJson(
      reservationPath,
      ["device", "inode", "planSha256", "rootSha256", "schema"],
      GIT_RESERVATION_SCHEMA,
      fs,
    );
    gitIdentity = physicalIdentity((fs.lstatSync ?? lstatSync)(gitPath), "directory");
    if (!observed || !gitIdentity
      || observed.value.rootSha256 !== rootSha256
      || observed.value.planSha256 !== planSha256
      || observed.value.device !== gitIdentity.dev
      || observed.value.inode !== gitIdentity.ino) {
      throw drift("existing Git control path is not the reserved transaction path");
    }
    reservationBytes = observed.bytes;
    reservationIdentity = ensureExactDurableFile(
      reservationPath,
      reservationBytes,
      fs,
    );
  }

  const initialized = exists(initializedPath)
    ? readClosedJson(
      initializedPath,
      ["gitTreeSha256", "gitVersion", "planSha256", "rootSha256", "schema"],
      GIT_INITIALIZED_SCHEMA,
      fs,
    )
    : null;
  if (initialized) {
    const logicalTree = initialGitTree(gitPath, fs);
    if (initialized.value.rootSha256 !== rootSha256
      || initialized.value.planSha256 !== planSha256
      || parseGitVersion(`git version ${initialized.value.gitVersion}`) !== initialized.value.gitVersion
      || initialized.value.gitTreeSha256 !== sha256(Buffer.from(JSON.stringify(logicalTree), "utf8"))) {
      throw drift("initialized Git control proof drifted");
    }
    const initializedIdentity = ensureExactDurableFile(
      initializedPath,
      initialized.bytes,
      fs,
    );
    (fs.faultInjector ?? (() => {}))("before-git-control-fsync");
    fsyncDirectory(gitPath, fs);
    fsyncDirectory(pendingPath, fs);
    return {
      gitIdentity,
      gitVersion: initialized.value.gitVersion,
      gitTreeSha256: initialized.value.gitTreeSha256,
      cleanup: {
        reservation: {
          path: reservationPath,
          identity: reservationIdentity,
          bytes: reservationBytes,
        },
        initialized: {
          path: initializedPath,
          identity: initializedIdentity,
          bytes: initialized.bytes,
        },
        template: {
          path: templatePath,
          identity: assertPhysicalDirectory(templatePath, fs),
        },
      },
    };
  }
  if (exists(initializedPath)) throw drift("initialized Git control proof is invalid");

  if (!exists(templatePath)) (fs.mkdirSync ?? mkdirSync)(templatePath, { mode: 0o700 });
  const templateIdentity = assertPhysicalDirectory(templatePath, fs);
  if ((fs.readdirSync ?? readdirSync)(templatePath).length !== 0) {
    throw drift("Git initialization template is not empty");
  }
  const initializedResult = spawn(
    "git",
    ["init", "--initial-branch=main", `--template=${templatePath}`],
    { cwd: root, encoding: "utf8" },
  );
  if (initializedResult.error || initializedResult.status !== 0) {
    return { status: "git-init-failed", gitIdentity };
  }
  if (!samePhysicalIdentity(gitPath, gitIdentity, fs)) {
    throw drift("Git control identity changed during initialization");
  }
  if (!samePhysicalIdentity(templatePath, templateIdentity, fs)
    || (fs.readdirSync ?? readdirSync)(templatePath).length !== 0) {
    throw drift("Git initialization template changed during initialization");
  }
  const logicalTree = initialGitTree(gitPath, fs);
  const initializedProof = {
    schema: GIT_INITIALIZED_SCHEMA,
    rootSha256,
    planSha256,
    gitVersion: currentGitVersion,
    gitTreeSha256: sha256(Buffer.from(JSON.stringify(logicalTree), "utf8")),
  };
  const initializedBytes = Buffer.from(`${JSON.stringify(initializedProof, null, 2)}\n`, "utf8");
  const initializedIdentity = ensureExactDurableFile(initializedPath, initializedBytes, fs);
  (fs.faultInjector ?? (() => {}))("before-git-control-fsync");
  fsyncDirectory(gitPath, fs);
  fsyncDirectory(pendingPath, fs);
  return {
    gitIdentity,
    gitVersion: currentGitVersion,
    gitTreeSha256: initializedProof.gitTreeSha256,
    cleanup: {
      reservation: {
        path: reservationPath,
        identity: reservationIdentity,
        bytes: reservationBytes,
      },
      initialized: {
        path: initializedPath,
        identity: initializedIdentity,
        bytes: initializedBytes,
      },
      template: { path: templatePath, identity: templateIdentity },
    },
  };
}

function ensurePrivateDirectory(path, parent, created, fs = {}) {
  const exists = fs.existsSync ?? existsSync;
  if (exists(path)) {
    assertPhysicalDirectory(path, fs);
    return;
  }
  createPrivateDirectory(path, parent, created, fs);
}

function bindPrivateContinuity(root, {
  planSha256,
  gitVersion,
  gitIdentity,
  gitTreeSha256,
  pendingPath,
  intentBytes,
}, fs = {}, created = {}) {
  const source = join(root, ".claude/.runtime/agent-pipeline/onboarding/continuity-history.json");
  const git = join(root, ".git");
  const agentPipeline = join(git, "agent-pipeline");
  const directory = join(agentPipeline, "onboarding");
  const target = join(directory, "continuity-history.json");
  const admissionPath = join(pendingPath, "admission");
  const receiptPath = join(admissionPath, "receipt.json");
  const markerPath = join(admissionPath, "marker.json");
  const intentPath = join(admissionPath, "intent.json");
  const finalAdmissionPath = join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY);
  const admissionParent = join(root, ".claude/.runtime/agent-pipeline/onboarding");
  const read = fs.readFileSync ?? readFileSync;
  const historyBytes = readBoundFile(source, fs);
  if (!historyBytes) throw new Error("portable continuity history changed during binding");
  if (!samePhysicalIdentity(git, gitIdentity, fs)) throw new Error("Git control identity changed before continuity binding");
  ensurePrivateDirectory(agentPipeline, git, created, fs);
  ensurePrivateDirectory(directory, agentPipeline, created, fs);
  assertPhysicalParents(root, ".git/agent-pipeline/onboarding", fs);
  created.history = {
    identity: ensureExactDurableFile(target, historyBytes, fs),
    bytes: historyBytes,
  };
  if (!created.history.identity) throw new Error("created continuity identity is unavailable");
  fsyncDirectory(directory, fs);
  const receipt = {
    schema: "pipeline.codex-host-repository-init-receipt.v2",
    planSha256,
    rootSha256: sha256(Buffer.from(root, "utf8")),
    authoritySha256: codexHostRepositoryAuthoritySha256(root, {
      lstat: fs.lstatSync ?? lstatSync,
      readFile: read,
    }),
    historySha256: sha256(historyBytes),
    gitVersion,
    gitDevice: gitIdentity.dev,
    gitInode: gitIdentity.ino,
    gitTreeSha256,
    branch: "main",
  };
  if (receipt.authoritySha256 === null) throw new Error("host-init authority is unavailable");
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  if (!(fs.existsSync ?? existsSync)(admissionPath)) {
    (fs.mkdirSync ?? mkdirSync)(admissionPath, { mode: 0o700 });
  }
  const admissionIdentity = assertPhysicalDirectory(admissionPath, fs);
  const admissionParentIdentity = assertPhysicalDirectory(admissionParent, fs);
  created.intent = {
    identity: ensureExactDurableFile(intentPath, intentBytes, fs),
    bytes: intentBytes,
  };
  created.receipt = {
    identity: ensureExactDurableFile(receiptPath, receiptBytes, fs),
    bytes: receiptBytes,
  };
  if (!created.receipt.identity) throw new Error("created receipt identity is unavailable");
  const marker = {
    schema: "pipeline.codex-host-repository-init-marker.v1",
    rootSha256: receipt.rootSha256,
    planSha256: receipt.planSha256,
    intentSha256: sha256(intentBytes),
    receiptSha256: sha256(receiptBytes),
  };
  const markerBytes = Buffer.from(`${JSON.stringify(marker, null, 2)}\n`, "utf8");
  (fs.faultInjector ?? (() => {}))("before-host-init-marker-publication");
  created.marker = {
    identity: ensureExactDurableFile(markerPath, markerBytes, fs),
    bytes: markerBytes,
  };
  if (!created.marker.identity) throw new Error("created host-init marker identity is unavailable");
  fsyncDirectory(admissionPath, fs);
  if (sha256(Buffer.from(JSON.stringify(initialGitTree(git, fs)), "utf8")) !== gitTreeSha256) {
    throw new Error("Git control tree changed before admission publication");
  }
  if (!samePhysicalIdentity(admissionPath, admissionIdentity, fs)) {
    throw new Error("host-init admission directory changed before publication");
  }
  if ((fs.existsSync ?? existsSync)(finalAdmissionPath)) {
    throw new Error("host-init admission appeared before atomic publication");
  }
  (fs.faultInjector ?? (() => {}))("before-host-init-admission-rename");
  (fs.renameSync ?? renameSync)(admissionPath, finalAdmissionPath);
  created.admission = admissionIdentity;
  if (!samePhysicalIdentity(finalAdmissionPath, admissionIdentity, fs)) {
    throw new Error("host-init admission identity changed during publication");
  }
  if (!samePhysicalIdentity(admissionParent, admissionParentIdentity, fs)) {
    throw new Error("host-init admission parent changed during publication");
  }
  fsyncDirectory(admissionParent, fs);
  const readback = readCodexHostRepositoryInitAdmission(root, {
    lstat: fs.lstatSync ?? lstatSync,
    readFile: fs.readFileSync ?? readFileSync,
    open: fs.openSync ?? openSync,
    fstat: fs.fstatSync ?? fstatSync,
    close: fs.closeSync ?? closeSync,
    fsConstants: fs.constants ?? constants,
    platform: fs.process?.platform ?? process.platform,
  });
  if (!readback || readback.gitVersion !== gitVersion || readback.repositoryMode !== "host-managed") {
    throw new Error("host-init admission exact readback failed");
  }
  if (sha256(Buffer.from(JSON.stringify(initialGitTree(git, fs)), "utf8")) !== gitTreeSha256) {
    throw new Error("Git control tree changed during admission publication");
  }
}

export function applyHostRepositoryInit({
  rootDir = process.cwd(),
  planSha256,
  activate = false,
  deps = {},
} = {}) {
  let root;
  try {
    root = safeRoot(rootDir, deps);
    if (!activate || !/^[a-f0-9]{64}$/u.test(planSha256 ?? "")) throw new Error("activation and a plan digest are required");
    const snapshot = portableSnapshot(root, deps);
    if (digest(snapshot) !== planSha256) {
      return { schema: APPLY_SCHEMA, status: "host-preimage-changed", root, diagnostics: [{ code: "plan_digest_mismatch" }] };
    }
    const exists = deps.existsSync ?? existsSync;
    const currentAdmission = readCodexHostRepositoryInitAdmission(root, {
      lstat: deps.lstatSync ?? lstatSync,
      readFile: deps.readFileSync ?? readFileSync,
      open: deps.openSync ?? openSync,
      fstat: deps.fstatSync ?? fstatSync,
      close: deps.closeSync ?? closeSync,
      fsConstants: deps.constants ?? constants,
      platform: deps.process?.platform ?? process.platform,
    });
    const currentGitPath = join(root, ".git");
    if (currentAdmission && exists(currentGitPath)
      && !exists(join(root, ".codex")) && !exists(join(root, ".agents"))) {
      let completedPostimageCurrent = false;
      try {
        const currentGitIdentity = physicalIdentity(
          (deps.lstatSync ?? lstatSync)(currentGitPath),
          "directory",
        );
        completedPostimageCurrent = currentAdmission.planSha256 === planSha256
          && currentGitIdentity?.dev === currentAdmission.gitDevice
          && currentGitIdentity?.ino === currentAdmission.gitInode
          && sha256(Buffer.from(JSON.stringify(initialGitTree(currentGitPath, deps)), "utf8"))
            === currentAdmission.gitTreeSha256;
      } catch {
        completedPostimageCurrent = false;
      }
      if (!completedPostimageCurrent) {
        return {
          schema: APPLY_SCHEMA,
          status: "host-preimage-changed",
          root,
          diagnostics: [{ code: "completed_git_control_drift" }],
        };
      }
      return {
        schema: APPLY_SCHEMA,
        status: "restart-required",
        root,
        gitVersion: currentAdmission.gitVersion,
        branch: "main",
        createsCommit: false,
        operatorAction: "Restart the current project session once so Codex remounts the newly initialized repository.",
        diagnostics: [],
      };
    }
    const pendingPath = join(root, CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY);
    const resuming = exists(pendingPath);
    if (exists(join(root, ".codex")) || exists(join(root, ".agents"))
      || (exists(join(root, ".git")) && !resuming)) {
      return { schema: APPLY_SCHEMA, status: "host-preimage-changed", root, diagnostics: [{ code: "reserved_host_path_present" }] };
    }
    let transaction;
    try {
      transaction = prepareTransaction(root, planSha256, deps);
    } catch (error) {
      if (!(error instanceof HostInitDriftError)) {
        return {
          schema: APPLY_SCHEMA,
          status: "apply-failed",
          root,
          diagnostics: [{ code: "git_control_preparation_failed" }],
        };
      }
      return {
        schema: APPLY_SCHEMA,
        status: "host-preimage-changed",
        root,
        diagnostics: [{ code: "pending_git_control_drift" }],
      };
    }
    const spawn = deps.spawnSync ?? spawnSync;
    const observed = spawn("git", ["--version"], { cwd: root, encoding: "utf8" });
    const currentGitVersion = !observed.error && observed.status === 0 ? parseGitVersion(observed.stdout) : null;
    if (!currentGitVersion) {
      return { schema: APPLY_SCHEMA, status: "git-unavailable", root, diagnostics: [{ code: "git_2_28_required" }] };
    }
    let gitControl;
    try {
      gitControl = prepareGitControl(
        root,
        planSha256,
        currentGitVersion,
        transaction.pendingPath,
        spawn,
        deps,
      );
    } catch (error) {
      if (!(error instanceof HostInitDriftError)) {
        return {
          schema: APPLY_SCHEMA,
          status: "apply-failed",
          root,
          diagnostics: [{ code: "git_control_preparation_failed" }],
        };
      }
      return {
        schema: APPLY_SCHEMA,
        status: "host-preimage-changed",
        root,
        diagnostics: [{ code: "pending_git_control_drift" }],
      };
    }
    if (gitControl.status === "git-init-failed") {
      return {
        schema: APPLY_SCHEMA,
        status: "apply-failed",
        root,
        diagnostics: [{ code: "git_init_failed_reserved_control_path_retained" }],
      };
    }
    const {
      gitIdentity,
      gitVersion,
      gitTreeSha256,
      cleanup: gitCleanup,
    } = gitControl;
    const gitTree = physicalTreeSnapshot(join(root, ".git"), deps);
    const created = {
      admission: null,
      history: null,
      intent: null,
      receipt: null,
      marker: null,
      directories: [],
    };
    const cleanupQuarantineParent = join(root, ".claude/.runtime/agent-pipeline");
    try {
      bindPrivateContinuity(root, {
        planSha256,
        gitVersion,
        gitIdentity,
        gitTreeSha256,
        pendingPath: transaction.pendingPath,
        intentBytes: transaction.intentBytes,
      }, deps, created);
    } catch (bindingError) {
      try {
        removeCreatedFile(
          join(root, CODEX_HOST_REPOSITORY_INIT_MARKER),
          created.marker?.identity,
          deps,
          created.marker?.bytes ?? null,
          cleanupQuarantineParent,
        );
        removeCreatedFile(
          join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT),
          created.receipt?.identity,
          deps,
          created.receipt?.bytes ?? null,
          cleanupQuarantineParent,
        );
        removeCreatedFile(
          join(root, CODEX_HOST_REPOSITORY_INIT_INTENT),
          created.intent?.identity,
          deps,
          created.intent?.bytes ?? null,
          cleanupQuarantineParent,
        );
        removeCreatedDirectory(
          join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY),
          created.admission,
          deps,
          cleanupQuarantineParent,
        );
        removeCreatedFile(
          join(root, ".git/agent-pipeline/onboarding/continuity-history.json"),
          created.history?.identity,
          deps,
          created.history?.bytes ?? null,
          cleanupQuarantineParent,
        );
        for (const entry of [...created.directories].reverse()) {
          removeCreatedDirectory(
            entry.path,
            entry.identity,
            deps,
            cleanupQuarantineParent,
          );
        }
        if (!samePhysicalIdentity(join(root, ".git"), gitIdentity, deps)
          || JSON.stringify(physicalTreeSnapshot(join(root, ".git"), deps))
            !== JSON.stringify(gitTree)) {
          throw new Error("reserved Git control path changed during rollback");
        }
      } catch {
        return { schema: APPLY_SCHEMA, status: "rollback-failed", root, diagnostics: [{ code: "host_init_identity_changed" }] };
      }
      if (bindingError instanceof HostInitDriftError) {
        return {
          schema: APPLY_SCHEMA,
          status: "host-preimage-changed",
          root,
          diagnostics: [{ code: "host_init_continuity_drift" }],
        };
      }
      return { schema: APPLY_SCHEMA, status: "apply-failed", root, diagnostics: [{ code: "continuity_binding_failed" }] };
    }
    let cleanupDiagnostics = [];
    try {
      (deps.faultInjector ?? (() => {}))("before-host-init-pending-cleanup");
      removeCreatedFile(
        transaction.cleanup.intent.path,
        transaction.cleanup.intent.identity,
        deps,
        transaction.cleanup.intent.bytes,
        cleanupQuarantineParent,
      );
      removeCreatedFile(
        gitCleanup.initialized.path,
        gitCleanup.initialized.identity,
        deps,
        gitCleanup.initialized.bytes,
        cleanupQuarantineParent,
      );
      removeCreatedFile(
        gitCleanup.reservation.path,
        gitCleanup.reservation.identity,
        deps,
        gitCleanup.reservation.bytes,
        cleanupQuarantineParent,
      );
      removeCreatedDirectory(
        gitCleanup.template.path,
        gitCleanup.template.identity,
        deps,
        cleanupQuarantineParent,
      );
      removeCreatedDirectory(
        transaction.cleanup.pending.path,
        transaction.cleanup.pending.identity,
        deps,
        cleanupQuarantineParent,
      );
      fsyncDirectory(join(root, ".claude/.runtime/agent-pipeline/onboarding"), deps);
    } catch {
      // The committed admission is already exact and authoritative. A stale
      // or identity-drifted pending tree is non-authoritative and is retained
      // rather than deleting a path not bound by this invocation.
      cleanupDiagnostics = [{ code: "pending_cleanup_retained" }];
    }
    return {
      schema: APPLY_SCHEMA,
      status: "restart-required",
      root,
      gitVersion,
      branch: "main",
      createsCommit: false,
      operatorAction: "Restart the current project session once so Codex remounts the newly initialized repository.",
      diagnostics: cleanupDiagnostics,
    };
  } catch {
    return {
      schema: APPLY_SCHEMA,
      status: "apply-failed",
      root: root ?? null,
      diagnostics: [{ code: "host_repository_init_failed" }],
    };
  }
}

function valueAfter(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function main(argv = process.argv.slice(2)) {
  const operation = argv[0];
  const rootDir = valueAfter(argv, "--root") ?? process.cwd();
  const result = operation === "plan"
    ? planHostRepositoryInit({ rootDir })
    : operation === "apply"
      ? applyHostRepositoryInit({
        rootDir,
        planSha256: valueAfter(argv, "--plan-sha256"),
        activate: argv.includes("--activate"),
      })
      : { schema: PLAN_SCHEMA, status: "invalid-command", root: null, diagnostics: [{ code: "invalid_command" }] };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return ["ready", "restart-required"].includes(result.status) ? 0 : 2;
}

const invokedDirectly = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (invokedDirectly) process.exitCode = main();
