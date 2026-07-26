// SPDX-License-Identifier: SUL-1.0

/**
 * Codex may expose a fresh workspace with these control directories already
 * mounted read-only.  They are environment-owned, not incomplete project
 * bytes: callers may recognise the exact layout, but must never write through
 * it, chmod it, or accept a broader near-match.
 */
import { createHash } from "node:crypto";
import { accessSync, constants, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const CODEX_HOST_CONTROL_PATHS = Object.freeze([".agents", ".codex", ".git"]);
export const CODEX_HOST_REPOSITORY_INIT_RECEIPT = ".claude/.runtime/agent-pipeline/onboarding/host-repository-init.json";
const REQUIRED_CODEX_HOST_CONTROL_PATHS = Object.freeze([".codex", ".git"]);
const HOST_INIT_AUTHORITY_PATHS = Object.freeze([
  "pipeline.user.yaml",
  ".claude/pipeline.json",
  ".claude/pipeline.yaml",
  ".claude/settings.json",
]);

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
} = {}) {
  const rows = [];
  for (const path of HOST_INIT_AUTHORITY_PATHS) {
    const target = join(root, path);
    if (!physicalRegularFile(target, { lstat })) return null;
    const bytes = path === ".claude/pipeline.json" && calibrationBytes !== null
      ? calibrationBytes
      : readFile(target);
    rows.push({ path, sha256: sha256(bytes) });
  }
  return sha256(Buffer.from(JSON.stringify(rows), "utf8"));
}

function hostManagedBytesForCanonicalLocalOnly(root, {
  lstat = lstatSync,
  readFile = readFileSync,
} = {}) {
  const target = join(root, ".claude", "pipeline.json");
  if (!physicalRegularFile(target, { lstat })) return null;
  try {
    const bytes = readFile(target);
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
} = {}) {
  if (!physicalRegularFile(historyPath, { lstat })) return null;
  let historyBytes;
  let history;
  try {
    const historyInfo = lstat(historyPath);
    if (platform !== "win32" && (historyInfo.mode & 0o077) !== 0) return null;
    historyBytes = readFile(historyPath);
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
    calibrationBytes = readFile(join(root, ".claude", "pipeline.json"));
    const calibration = JSON.parse(calibrationBytes.toString("utf8"));
    if (calibration?.handover !== "docs/state.md") return null;
    if (calibration.repositoryMode === "local-only") {
      calibrationBytes = hostManagedBytesForCanonicalLocalOnly(root, { lstat, readFile });
      if (calibrationBytes === null) return null;
    } else if (calibration.repositoryMode !== "host-managed") return null;
  } catch {
    return null;
  }
  const latest = observed.history.transactions.at(-1);
  const bindings = {
    calibrationSha256: calibrationBytes,
    stateSha256: readBound(".claude/pipeline-state.json"),
    handoverSha256: readBound("docs/state.md"),
    prdSha256: readBound("specs/kickoff-initial-prd.md"),
    specSha256: readBound("specs/kickoff-initial-spec.md"),
  };
  function readBound(path) {
    const target = join(root, path);
    return physicalRegularFile(target, { lstat }) ? readFile(target) : null;
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
} = {}) {
  const privateDirectories = [
    ".claude/.runtime",
    ".claude/.runtime/agent-pipeline",
    ".claude/.runtime/agent-pipeline/onboarding",
  ];
  for (const relative of privateDirectories) {
    const path = join(root, relative);
    if (!physicalDirectory(path, { lstat })) return null;
    try {
      if (platform !== "win32" && (lstat(path).mode & 0o077) !== 0) return null;
    } catch {
      return null;
    }
  }
  const receiptPath = join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT);
  const historyPath = join(root, ".claude/.runtime/agent-pipeline/onboarding/continuity-history.json");
  if (!physicalRegularFile(receiptPath, { lstat })) return null;
  let receipt;
  try {
    const info = lstat(receiptPath);
    if (platform !== "win32" && (info.mode & 0o077) !== 0) return null;
    receipt = JSON.parse(readFile(receiptPath, "utf8"));
  } catch {
    return null;
  }
  const keys = [
    "authoritySha256", "branch", "gitVersion", "historySha256",
    "planSha256", "rootSha256", "schema",
  ];
  const currentAuthoritySha256 = codexHostRepositoryAuthoritySha256(root, { lstat, readFile });
  const hostManagedCalibrationBytes = receipt?.authoritySha256 === currentAuthoritySha256
    ? null
    : hostManagedBytesForCanonicalLocalOnly(root, { lstat, readFile });
  const transitionedAuthoritySha256 = hostManagedCalibrationBytes === null
    ? null
    : codexHostRepositoryAuthoritySha256(root, {
      lstat,
      readFile,
      calibrationBytes: hostManagedCalibrationBytes,
    });
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)
    || JSON.stringify(Object.keys(receipt).sort()) !== JSON.stringify(keys.sort())
    || receipt.schema !== "pipeline.codex-host-repository-init-receipt.v1"
    || receipt.branch !== "main"
    || !/^\d+\.\d+(?:\.\d+)?(?:[.-][0-9A-Za-z]+)*$/u.test(receipt.gitVersion ?? "")
    || !/^[a-f0-9]{64}$/u.test(receipt.planSha256 ?? "")
    || receipt.rootSha256 !== sha256(Buffer.from(root, "utf8"))
    || (receipt.authoritySha256 !== currentAuthoritySha256
      && receipt.authoritySha256 !== transitionedAuthoritySha256)) return null;
  const history = kickoffHistory(root, historyPath, { lstat, readFile, platform });
  return history && receipt.historySha256 === history.historySha256
    ? {
      gitVersion: receipt.gitVersion,
      repositoryMode: hostManagedCalibrationBytes === null ? "host-managed" : "local-only",
    }
    : null;
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
