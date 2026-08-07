// SPDX-License-Identifier: SUL-1.0

/**
 * Codex may expose a fresh workspace with these control directories already
 * mounted read-only.  They are environment-owned, not incomplete project
 * bytes: callers may recognise the exact layout, but must never write through
 * it, chmod it, or accept a broader near-match.
 */
import { createHash } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, relative } from "node:path";
import {
  NEUTRAL_CALIBRATION,
  NEUTRAL_MANIFEST,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "./project-authority.mjs";

export const CODEX_HOST_CONTROL_PATHS = Object.freeze([".agents", ".codex", ".git"]);
export const CODEX_HOST_REPOSITORY_INIT_DIRECTORY = ".claude/.runtime/agent-pipeline/onboarding/host-repository-init";
export const CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY = ".claude/.runtime/agent-pipeline/onboarding/.host-repository-init.pending";
export const CODEX_HOST_REPOSITORY_INIT_INTENT = `${CODEX_HOST_REPOSITORY_INIT_DIRECTORY}/intent.json`;
export const CODEX_HOST_REPOSITORY_INIT_RECEIPT = `${CODEX_HOST_REPOSITORY_INIT_DIRECTORY}/receipt.json`;
export const CODEX_HOST_REPOSITORY_INIT_MARKER = `${CODEX_HOST_REPOSITORY_INIT_DIRECTORY}/marker.json`;
const REQUIRED_CODEX_HOST_CONTROL_PATHS = Object.freeze([".codex", ".git"]);
function projectAuthorityPaths(root) {
  const authority = resolveProjectAuthorityPaths({ rootDir: root });
  if (authority.status === "ready") return authority;
  return {
    calibration: NEUTRAL_CALIBRATION,
    manifest: NEUTRAL_MANIFEST,
    state: NEUTRAL_STATE,
  };
}

function hostInitAuthorityPaths(root) {
  const authority = projectAuthorityPaths(root);
  return [
    "pipeline.user.yaml",
    authority.calibration,
    authority.manifest,
  ];
}

function readonlyEmptyDirectory(root, name, { access = accessSync, fsConstants = constants, lstat = lstatSync, readdir = readdirSync } = {}) {
  const path = join(root, name);
  try {
    const info = lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || readdir(path).length !== 0) return false;
    try { access(path, fsConstants.W_OK); return false; } catch { return true; }
  } catch { return false; }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function physicalIdentity(info, kind) {
  const valid = kind === "directory"
    ? info && info.isDirectory() && !info.isSymbolicLink()
    : info && info.isFile() && !info.isSymbolicLink() && info.nlink === 1;
  return valid
    ? { dev: String(info.dev), ino: String(info.ino), mode: info.mode, nlink: info.nlink, kind }
    : null;
}

function sameIdentity(left, right) {
  return left?.kind === right?.kind
    && left?.dev === right?.dev
    && left?.ino === right?.ino
    && left?.mode === right?.mode
    && left?.nlink === right?.nlink;
}

function parentIdentities(root, relativePath, lstat) {
  const components = relativePath.split("/");
  if (components.some((component) => !component || component === "." || component === "..")) return null;
  const rootIdentity = physicalIdentity(lstat(root), "directory");
  if (!rootIdentity) return null;
  const rows = [{ path: root, identity: rootIdentity }];
  let current = root;
  for (const component of components.slice(0, -1)) {
    current = join(current, component);
    const identity = physicalIdentity(lstat(current), "directory");
    if (!identity) return null;
    rows.push({ path: current, identity });
  }
  return rows;
}

/**
 * Read one physical regular file through an O_NOFOLLOW descriptor and bind the
 * bytes to the same leaf and parent-directory identities before and after the
 * read. A path-only lstat/read sequence is not admission evidence.
 */
function readPhysicalBoundFile(root, relativePath, {
  lstat = lstatSync,
  open = openSync,
  fstat = fstatSync,
  readFile = readFileSync,
  close = closeSync,
  fsConstants = constants,
} = {}) {
  let descriptor;
  try {
    const parents = parentIdentities(root, relativePath, lstat);
    if (!parents) return null;
    const path = join(root, relativePath);
    const before = physicalIdentity(lstat(path), "file");
    if (!before) return null;
    descriptor = open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = physicalIdentity(fstat(descriptor), "file");
    if (!sameIdentity(before, opened)) return null;
    const bytes = readFile(descriptor);
    const afterDescriptor = physicalIdentity(fstat(descriptor), "file");
    const afterPath = physicalIdentity(lstat(path), "file");
    if (!sameIdentity(opened, afterDescriptor) || !sameIdentity(opened, afterPath)) return null;
    for (const row of parents) {
      if (!sameIdentity(row.identity, physicalIdentity(lstat(row.path), "directory"))) return null;
    }
    return { bytes, identity: opened };
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) {
      try { close(descriptor); } catch {}
    }
  }
}

function physicalRegularFile(path, { lstat = lstatSync } = {}) {
  try {
    const info = lstat(path);
    return info.isFile() && !info.isSymbolicLink() && info.nlink === 1;
  } catch {
    return false;
  }
}

function physicalDirectory(path, { lstat = lstatSync } = {}) {
  try {
    const info = lstat(path);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

export function codexHostRepositoryAuthoritySha256(root, {
  lstat = lstatSync,
  readFile = readFileSync,
  calibrationBytes = null,
  ...io
} = {}) {
  const rows = [];
  const authority = projectAuthorityPaths(root);
  for (const path of hostInitAuthorityPaths(root)) {
    const observed = readPhysicalBoundFile(root, path, { lstat, readFile, ...io });
    if (!observed) return null;
    const bytes = path === authority.calibration && calibrationBytes !== null
      ? calibrationBytes
      : observed.bytes;
    rows.push({ path, sha256: sha256(bytes) });
  }
  return sha256(Buffer.from(JSON.stringify(rows), "utf8"));
}

function hostManagedBytesForCanonicalLocalOnly(root, {
  lstat = lstatSync,
  readFile = readFileSync,
  ...io
} = {}) {
  try {
    const calibrationPath = projectAuthorityPaths(root).calibration;
    const observed = readPhysicalBoundFile(root, calibrationPath, {
      lstat,
      readFile,
      ...io,
    });
    if (!observed) return null;
    const bytes = observed.bytes;
    const text = bytes.toString("utf8");
    const calibration = JSON.parse(text);
    if (calibration?.repositoryMode !== "local-only"
      || calibration?.handover !== "docs/state.md"
      || text !== `${JSON.stringify(calibration, null, 2)}\n`) return null;
    return Buffer.from(`${JSON.stringify({
      ...calibration,
      repositoryMode: "host-managed",
    }, null, 2)}\n`, "utf8");
  } catch {
    return null;
  }
}

function kickoffHistory(root, historyPath, {
  lstat = lstatSync,
  readFile = readFileSync,
  platform = process.platform,
  ...io
} = {}) {
  let historyBytes;
  let history;
  try {
    const relativePath = relative(root, historyPath).replaceAll("\\", "/");
    if (!relativePath || relativePath.startsWith("../") || relativePath === "..") return null;
    const observed = readPhysicalBoundFile(root, relativePath, {
      lstat,
      readFile,
      ...io,
    });
    if (!observed) return null;
    if (platform !== "win32" && (observed.identity.mode & 0o077) !== 0) return null;
    historyBytes = observed.bytes;
    history = JSON.parse(historyBytes.toString("utf8"));
  } catch {
    return null;
  }
  if (history?.schema !== "pipeline.codex-onboarding-continuity-history.v1"
    || !Array.isArray(history.transactions) || history.transactions.length < 1) return null;
  const latest = history.transactions.at(-1);
  const historyKeys = [
    "kind", "transactionSha256", "goalSha256", "calibrationSha256",
    "stateSha256", "handoverSha256", "prdSha256", "specSha256",
  ];
  if (latest?.kind !== "kickoff"
    || JSON.stringify(Object.keys(latest).sort()) !== JSON.stringify([...historyKeys].sort())
    || !historyKeys.slice(1).every((key) => /^[a-f0-9]{64}$/u.test(latest[key] ?? ""))) return null;
  return { history, historySha256: sha256(historyBytes) };
}

function boundKickoffHistory(root, historyPath, options = {}) {
  const { lstat = lstatSync, readFile = readFileSync } = options;
  const observed = kickoffHistory(root, historyPath, options);
  if (!observed) return null;
  let calibrationBytes;
  try {
    const authority = projectAuthorityPaths(root);
    const calibration = readPhysicalBoundFile(root, authority.calibration, options);
    if (!calibration) return null;
    calibrationBytes = calibration.bytes;
    const calibrationValue = JSON.parse(calibrationBytes.toString("utf8"));
    if (calibrationValue?.handover !== "docs/state.md") return null;
    if (calibrationValue.repositoryMode === "local-only") {
      calibrationBytes = hostManagedBytesForCanonicalLocalOnly(root, {
        lstat,
        readFile,
        ...options,
      });
      if (calibrationBytes === null) return null;
    } else if (calibrationValue.repositoryMode !== "host-managed") return null;
  } catch {
    return null;
  }
  const latest = observed.history.transactions.at(-1);
  const stateBytes = readBound(projectAuthorityPaths(root).state);
  if (stateBytes === null) return null;
  let state;
  try { state = JSON.parse(stateBytes.toString("utf8")); } catch { return null; }
  const prdPath = state?.continuity?.authority?.prd?.path;
  const specPath = state?.continuity?.authority?.spec?.path;
  if (typeof prdPath !== "string" || typeof specPath !== "string") return null;
  const bindings = {
    calibrationSha256: calibrationBytes,
    stateSha256: stateBytes,
    handoverSha256: readBound("docs/state.md"),
    prdSha256: readBound(prdPath),
    specSha256: readBound(specPath),
  };
  function readBound(path) {
    return readPhysicalBoundFile(root, path, options)?.bytes ?? null;
  }
  return Object.entries(bindings).every(([key, bytes]) => bytes !== null
    && typeof latest[key] === "string"
    && latest[key] === sha256(bytes))
    ? { historySha256: observed.historySha256 }
    : null;
}

/**
 * Validate the durable host-init admission without depending on Codex's
 * per-process .git/.codex projection. This is the narrow PreToolUse fallback
 * for the 0.4.5 hotfix.
 */
export function readCodexHostRepositoryInitAdmission(root, {
  lstat = lstatSync,
  readFile = readFileSync,
  platform = process.platform,
  ...io
} = {}) {
  const privateDirectories = [
    ".claude/.runtime",
    ".claude/.runtime/agent-pipeline",
    ".claude/.runtime/agent-pipeline/onboarding",
    CODEX_HOST_REPOSITORY_INIT_DIRECTORY,
  ];
  const privateDirectoryIdentities = [];
  for (const relative of privateDirectories) {
    const path = join(root, relative);
    try {
      const identity = physicalIdentity(lstat(path), "directory");
      if (!identity || (platform !== "win32" && (identity.mode & 0o077) !== 0)) return null;
      privateDirectoryIdentities.push({ path, identity });
    } catch {
      return null;
    }
  }
  const historyPath = join(root, ".claude/.runtime/agent-pipeline/onboarding/continuity-history.json");
  let receipt;
  let receiptBytes;
  let marker;
  let intent;
  let intentBytes;
  try {
    const receiptObserved = readPhysicalBoundFile(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT, {
      lstat, readFile, ...io,
    });
    const markerObserved = readPhysicalBoundFile(root, CODEX_HOST_REPOSITORY_INIT_MARKER, {
      lstat, readFile, ...io,
    });
    const intentObserved = readPhysicalBoundFile(root, CODEX_HOST_REPOSITORY_INIT_INTENT, {
      lstat, readFile, ...io,
    });
    if (!receiptObserved || !markerObserved || !intentObserved) return null;
    const info = receiptObserved.identity;
    const markerInfo = markerObserved.identity;
    const intentInfo = intentObserved.identity;
    if (platform !== "win32"
      && ((info.mode & 0o077) !== 0 || (markerInfo.mode & 0o077) !== 0
        || (intentInfo.mode & 0o077) !== 0)) return null;
    receiptBytes = receiptObserved.bytes;
    intentBytes = intentObserved.bytes;
    receipt = JSON.parse(receiptBytes.toString("utf8"));
    marker = JSON.parse(markerObserved.bytes.toString("utf8"));
    intent = JSON.parse(intentBytes.toString("utf8"));
  } catch {
    return null;
  }
  const keys = [
    "authoritySha256", "branch", "gitVersion", "historySha256",
    "gitDevice", "gitInode", "gitTreeSha256", "planSha256", "rootSha256", "schema",
  ];
  const markerKeys = ["intentSha256", "planSha256", "receiptSha256", "rootSha256", "schema"];
  const intentKeys = ["planSha256", "rootSha256", "schema"];
  const currentAuthoritySha256 = codexHostRepositoryAuthoritySha256(root, {
    lstat,
    readFile,
    ...io,
  });
  const hostManagedCalibrationBytes = receipt?.authoritySha256 === currentAuthoritySha256
    ? null
    : hostManagedBytesForCanonicalLocalOnly(root, { lstat, readFile, ...io });
  const transitionedAuthoritySha256 = hostManagedCalibrationBytes === null
    ? null
    : codexHostRepositoryAuthoritySha256(root, {
      lstat,
      readFile,
      calibrationBytes: hostManagedCalibrationBytes,
      ...io,
    });
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)
    || JSON.stringify(Object.keys(receipt).sort()) !== JSON.stringify(keys.sort())
    || marker === null || typeof marker !== "object" || Array.isArray(marker)
    || JSON.stringify(Object.keys(marker).sort()) !== JSON.stringify(markerKeys.sort())
    || intent === null || typeof intent !== "object" || Array.isArray(intent)
    || JSON.stringify(Object.keys(intent).sort()) !== JSON.stringify(intentKeys.sort())
    || receipt.schema !== "pipeline.codex-host-repository-init-receipt.v2"
    || marker.schema !== "pipeline.codex-host-repository-init-marker.v1"
    || intent.schema !== "pipeline.codex-host-repository-init-intent.v1"
    || receipt.branch !== "main"
    || !/^\d+\.\d+(?:\.\d+)?(?:[.-][0-9A-Za-z]+)*$/u.test(receipt.gitVersion ?? "")
    || !/^\d+$/u.test(receipt.gitDevice ?? "")
    || !/^\d+$/u.test(receipt.gitInode ?? "")
    || !/^[a-f0-9]{64}$/u.test(receipt.gitTreeSha256 ?? "")
    || !/^[a-f0-9]{64}$/u.test(receipt.planSha256 ?? "")
    || receipt.rootSha256 !== sha256(Buffer.from(root, "utf8"))
    || intent.rootSha256 !== receipt.rootSha256
    || intent.planSha256 !== receipt.planSha256
    || marker.rootSha256 !== receipt.rootSha256
    || marker.planSha256 !== receipt.planSha256
    || marker.intentSha256 !== sha256(intentBytes)
    || marker.receiptSha256 !== sha256(receiptBytes)
    || (receipt.authoritySha256 !== currentAuthoritySha256
      && receipt.authoritySha256 !== transitionedAuthoritySha256)) return null;
  const history = boundKickoffHistory(root, historyPath, {
    lstat,
    readFile,
    platform,
    ...io,
  });
  const directoriesUnchanged = privateDirectoryIdentities.every(({ path, identity }) => {
    try {
      return sameIdentity(identity, physicalIdentity(lstat(path), "directory"));
    } catch {
      return false;
    }
  });
  return history && directoriesUnchanged && receipt.historySha256 === history.historySha256
    ? {
      gitVersion: receipt.gitVersion,
      gitDevice: receipt.gitDevice,
      gitInode: receipt.gitInode,
      gitTreeSha256: receipt.gitTreeSha256,
      planSha256: receipt.planSha256,
      repositoryMode: hostManagedCalibrationBytes === null ? "host-managed" : "local-only",
    }
    : null;
}

/**
 * Distinguish a pristine pre-init root from a root that already carries a
 * malformed or drifted host-init receipt. Callers must never offer a second
 * initialization plan for the latter state.
 */
export function observeCodexHostRepositoryInitAdmission(root, {
  lstat = lstatSync,
  readFile = readFileSync,
  platform = process.platform,
  ...io
} = {}) {
  const directoryPath = join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY);
  const receiptPath = join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT);
  const markerPath = join(root, CODEX_HOST_REPOSITORY_INIT_MARKER);
  const intentPath = join(root, CODEX_HOST_REPOSITORY_INIT_INTENT);
  let directoryExists = false;
  try {
    lstat(directoryPath);
    directoryExists = true;
  } catch (error) {
    if (error?.code !== "ENOENT") return { status: "invalid", admission: null };
  }
  if (!directoryExists) return { status: "absent", admission: null };
  let markerExists = false;
  try {
    lstat(markerPath);
    markerExists = true;
  } catch (error) {
    if (error?.code !== "ENOENT") return { status: "invalid", admission: null };
  }
  let receiptInfo;
  try {
    receiptInfo = lstat(receiptPath);
  } catch (error) {
    return { status: "invalid", admission: null };
  }
  let intentExists = false;
  try { lstat(intentPath); intentExists = true; } catch {}
  if (!receiptInfo.isFile() || receiptInfo.isSymbolicLink() || receiptInfo.nlink !== 1
    || !markerExists || !intentExists) {
    return { status: "invalid", admission: null };
  }
  const admission = readCodexHostRepositoryInitAdmission(root, {
    lstat,
    readFile,
    platform,
    ...io,
  });
  return admission === null
    ? { status: "invalid", admission: null }
    : { status: "valid", admission };
}

/**
 * Codex currently reprojects an initialized host repository as the same empty
 * protected .git mount used before initialization. The host initializer leaves
 * this private, digest-bound receipt outside that hidden mount so a fresh hook
 * can distinguish the two states without escalating the inspector.
 */
export function readCodexHostRepositoryInitReceipt(root, {
  access = accessSync,
  fsConstants = constants,
  lstat = lstatSync,
  readFile = readFileSync,
  readdir = readdirSync,
  platform = process.platform,
} = {}) {
  if (!hasCodexHostControlLayout(root, {
    access, fsConstants, lstat, readdir,
  })) return null;
  const historyPath = join(root, ".claude/.runtime/agent-pipeline/onboarding/continuity-history.json");
  const admission = readCodexHostRepositoryInitAdmission(root, { lstat, readFile, platform });
  if (!admission) return null;
  const history = boundKickoffHistory(root, historyPath, { lstat, readFile, platform });
  return history ? admission : null;
}

/**
 * A fresh Codex process re-exposes an initialized host repository through a
 * protected .git mount. Bind that third state only to the private kickoff
 * history written by the exact host initializer and to all of its portable
 * authority digests; a merely non-empty/read-only .git directory is not enough.
 */
export function hasCodexInitializedGitControlMount(root, {
  access = accessSync,
  fsConstants = constants,
  lstat = lstatSync,
  readFile = readFileSync,
  platform = process.platform,
} = {}) {
  if (!readonlyEmptyDirectory(root, ".codex", { access, fsConstants, lstat })) return false;
  const git = join(root, ".git");
  if (!physicalDirectory(git, { lstat })) return false;
  try { access(git, fsConstants.W_OK); return false; } catch {}
  for (const path of [
    join(git, "objects"),
    join(git, "refs"),
    join(git, "agent-pipeline"),
    join(git, "agent-pipeline", "onboarding"),
  ]) {
    if (!physicalDirectory(path, { lstat })) return false;
  }
  const head = join(git, "HEAD");
  const config = join(git, "config");
  const historyPath = join(git, "agent-pipeline", "onboarding", "continuity-history.json");
  if (![head, config, historyPath].every((path) => physicalRegularFile(path, { lstat }))) return false;
  try {
    if (!/^ref: refs\/heads\/[A-Za-z0-9._/-]+\n?$/u.test(readFile(head, "utf8"))) return false;
  } catch {
    return false;
  }
  return boundKickoffHistory(root, historyPath, { lstat, readFile, platform }) !== null;
}

/**
 * Recognise the narrow protected projection of a pre-existing Git repository.
 *
 * Unlike the fresh-root transition, an existing repository has no host-init
 * admission receipt.  Codex 0.145 on WSL may nevertheless expose its complete
 * Git control tree read-only while the writable host view remains healthy.
 * This structural observation is used only for the documented cross-view
 * compatibility path; it is not a Git-writability, freshness, push, or release
 * attestation.
 */
export function hasCodexExistingGitControlMount(root, {
  access = accessSync,
  fsConstants = constants,
  lstat = lstatSync,
  readFile = readFileSync,
  readdir = readdirSync,
} = {}) {
  if (!readonlyEmptyDirectory(root, ".codex", {
    access, fsConstants, lstat, readdir,
  })) return false;
  const git = join(root, ".git");
  if (!physicalDirectory(git, { lstat })) return false;
  try { access(git, fsConstants.W_OK); return false; } catch {}
  if (![join(git, "objects"), join(git, "refs")]
    .every((path) => physicalDirectory(path, { lstat }))) return false;
  const head = join(git, "HEAD");
  const config = join(git, "config");
  if (![head, config].every((path) => physicalRegularFile(path, { lstat }))) return false;
  try {
    const headValue = readFile(head, "utf8");
    const symbolic = /^ref: refs\/heads\/[A-Za-z0-9._/-]+\n?$/u.test(headValue);
    const detached = /^[a-f0-9]{40,64}\n?$/u.test(headValue);
    return symbolic || detached;
  } catch {
    return false;
  }
}

export function hasCodexGitControlMount(root, options = {}) {
  return readonlyEmptyDirectory(root, ".git", options);
}

/** A native Codex session may reserve only its project-runtime directory. */
export function hasCodexRuntimeControlMount(root, options = {}) {
  return readonlyEmptyDirectory(root, ".codex", options);
}

export function hasCodexHostControlLayout(root, {
  access = accessSync,
  fsConstants = constants,
  lstat = lstatSync,
  readdir = readdirSync,
} = {}) {
  const isReadonlyEmptyDirectory = (name) => readonlyEmptyDirectory(root, name, { access, fsConstants, lstat, readdir });
  if (!REQUIRED_CODEX_HOST_CONTROL_PATHS.every(isReadonlyEmptyDirectory)) return false;
  for (const name of [".agents", ".codex"]) {
    try {
      const info = lstat(join(root, name));
      if (info.isSymbolicLink() || !isReadonlyEmptyDirectory(name)) return false;
    } catch (error) {
      if (error?.code !== "ENOENT") return false;
    }
  }
  return true;
}
