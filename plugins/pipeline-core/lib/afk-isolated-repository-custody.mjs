// SPDX-License-Identifier: SUL-1.0
// Physical custody for Source-created, disposable AFK method repositories.
// This module grants no requester, operation, member, State, METHOD, or approval authority.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  constants as fsConstants,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverRepository } from "./worktree-lifecycle.mjs";
import { inspectSourceOwnedControlledContinuityExerciseCustodyClaim } from "./onboarding-continuity.mjs";

const RECEIPT_SCHEMA = "pipeline.afk-isolated-repository-custody-receipt.v1";
const custody = new WeakMap();
const exerciseClaims = new WeakMap();
const modulePath = fileURLToPath(import.meta.url);
const EXTERNAL_GIT_SELECTORS = Object.freeze([
  "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY",
  "GIT_OBJECT_DIRECTORY_RELATIVE", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE",
  "GIT_CEILING_DIRECTORIES", "GIT_PREFIX", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactEmptyRecord(value) {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
      && Reflect.ownKeys(value).length === 0;
  } catch {
    return false;
  }
}

function exactSingleKeyRecord(value, key) {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
      && Object.keys(value).join("\0") === key && Reflect.ownKeys(value).length === 1;
  } catch {
    return false;
  }
}

function physicalStat(path) {
  const stat = lstatSync(path, { bigint: true });
  if (stat.isSymbolicLink()) throw new Error("custody-symlink");
  return stat;
}

function directoryIdentity(path, expectedUid = process.getuid?.()) {
  const canonical = realpathSync(path);
  if (canonical !== path) throw new Error("custody-noncanonical-path");
  const stat = physicalStat(path);
  if (!stat.isDirectory() || (expectedUid !== undefined && stat.uid !== BigInt(expectedUid))) {
    throw new Error("custody-directory-owner");
  }
  return Object.freeze({
    path: canonical,
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    uid: stat.uid.toString(),
    gid: stat.gid.toString(),
    mode: Number(stat.mode & 0o7777n),
  });
}

function currentCreator() {
  if (process.platform !== "linux" || typeof process.getuid !== "function") throw new Error("custody-platform");
  const rawStat = readFileSync("/proc/self/stat", "utf8");
  const close = rawStat.lastIndexOf(")");
  if (close < 0) throw new Error("custody-process-stat");
  const fields = rawStat.slice(close + 1).trim().split(/\s+/u);
  const startTicks = fields[19];
  if (!/^\d+$/u.test(startTicks ?? "")) throw new Error("custody-process-start");
  const executablePath = readlinkSync("/proc/self/exe");
  if (executablePath.endsWith(" (deleted)")) throw new Error("custody-process-exe");
  return Object.freeze({ pid: process.pid, uid: process.getuid(), startTicks, executablePath });
}

function actualSystemHome() {
  const account = userInfo({ encoding: "utf8" });
  if (typeof account.homedir !== "string" || !account.homedir.startsWith("/")
    || (account.uid !== undefined && account.uid !== process.getuid())) throw new Error("custody-account-home");
  const canonical = realpathSync(account.homedir);
  if (canonical !== resolve(account.homedir)) throw new Error("custody-home-path");
  return canonical;
}

function moduleIdentity() {
  const canonical = realpathSync(modulePath);
  const before = physicalStat(canonical);
  if (!before.isFile() || before.nlink !== 1n) throw new Error("custody-module-file");
  const bytes = readFileSync(canonical);
  const after = physicalStat(canonical);
  if (!after.isFile() || after.nlink !== 1n || before.dev !== after.dev || before.ino !== after.ino
    || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
    throw new Error("custody-module-changed");
  }
  return Object.freeze({
    path: canonical,
    dev: after.dev.toString(),
    ino: after.ino.toString(),
    sha256: sha256(bytes),
    bytes: bytes.length,
  });
}

function rejectExternalGitSelectors(env = process.env) {
  for (const key of EXTERNAL_GIT_SELECTORS) {
    if (typeof env[key] === "string" && env[key] !== "") throw new Error("custody-git-selector");
  }
  if (Object.keys(env).some((key) => /^GIT_CONFIG_(?:KEY_\d+|VALUE_\d+)$/u.test(key))) {
    throw new Error("custody-git-selector");
  }
}

function pathComponents(path) {
  const result = [];
  let current = resolve(path);
  while (true) {
    result.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return result.reverse();
}

function assertNoRepositoryAncestor(path) {
  for (const component of pathComponents(path)) {
    const marker = join(component, ".git");
    if (existsSync(marker)) throw new Error("custody-parent-inside-repository");
  }
}

function ensureFixtureParent() {
  if (typeof process.getuid !== "function") throw new Error("custody-platform");
  const home = actualSystemHome();
  const homeStat = directoryIdentity(home);
  if (Number(homeStat.mode) & 0o022) throw new Error("custody-home-permissions");
  assertNoRepositoryAncestor(home);
  const suffix = [".local", "share", "agent-pipeline", "afk-method-fixtures", "repositories"];
  let current = home;
  const components = pathComponents(home);
  for (let index = 1; index < components.length; index += 1) {
    const path = components[index];
    const stat = physicalStat(path);
    if (!stat.isDirectory()) throw new Error("custody-home-ancestor");
    if (index === components.length - 1 && stat.uid !== BigInt(process.getuid())) throw new Error("custody-home-owner");
  }
  for (const part of suffix) {
    current = join(current, part);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    const stat = physicalStat(current);
    if (!stat.isDirectory() || stat.uid !== BigInt(process.getuid()) || (stat.mode & 0o022n) !== 0n) {
      throw new Error("custody-parent-permissions");
    }
  }
  const expectedFixtureParent = join(home, ".local", "share", "agent-pipeline", "afk-method-fixtures", "repositories");
  if (current !== expectedFixtureParent || realpathSync(current) !== current) throw new Error("custody-parent-path");
  assertNoRepositoryAncestor(current);
  return directoryIdentity(current);
}

function gitResult(cwd, argv) {
  const result = spawnSync("git", argv, {
    cwd,
    env: process.env,
    encoding: "utf8",
    shell: false,
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.signal !== null || result.status !== 0
    || typeof result.stdout !== "string" || typeof result.stderr !== "string") throw new Error("custody-git-failed");
  return result.stdout.trim();
}

function inspectGitTree(gitDir) {
  const rootEntries = readdirSync(gitDir).sort();
  if (rootEntries.includes("commondir") || rootEntries.includes("objects/info/alternates")) {
    throw new Error("custody-git-indirection");
  }
  const alternates = join(gitDir, "objects", "info", "alternates");
  if (existsSync(alternates)) throw new Error("custody-git-alternates");
  const pending = [gitDir];
  while (pending.length) {
    const directory = pending.pop();
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      const stat = physicalStat(path);
      if (stat.uid !== BigInt(process.getuid()) || (stat.mode & 0o022n) !== 0n) throw new Error("custody-git-owner-mode");
      if (stat.isDirectory()) pending.push(path);
      else if (!stat.isFile() || stat.nlink !== 1n) throw new Error("custody-git-linked-file");
    }
  }
}

function listRegularFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, item.name);
      const stat = physicalStat(path);
      if (stat.isDirectory()) pending.push(path);
      else if (stat.isFile() && stat.nlink === 1n) files.push(path);
      else throw new Error("custody-nonregular-object");
    }
  }
  return files;
}

function failure(code, status = "unavailable") {
  return Object.freeze({ status, code });
}

function receiptBytes(entry) {
  return Buffer.from(`${JSON.stringify({
    schema: RECEIPT_SCHEMA,
    rootIdentity: entry.rootIdentity,
    gitIdentity: entry.gitIdentity,
    creatorProcess: entry.creatorProcess,
    sourceContextSha256: entry.sourceModule.sha256,
    sourceContextIdentity: { path: entry.sourceModule.path, dev: entry.sourceModule.dev, ino: entry.sourceModule.ino },
  })}\n`, "utf8");
}

function persistReceipt(entry) {
  const bytes = receiptBytes(entry);
  const receiptPath = join(entry.parent.path, `custody-${randomBytes(20).toString("hex")}.json`);
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW;
  const descriptor = openSync(receiptPath, flags, 0o600);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const stat = physicalStat(receiptPath);
  if (!stat.isFile() || stat.uid !== BigInt(process.getuid()) || (stat.mode & 0o777n) !== 0o600n || stat.nlink !== 1n) {
    throw new Error("custody-receipt-identity");
  }
  entry.receipt = Object.freeze({ path: receiptPath, dev: stat.dev.toString(), ino: stat.ino.toString(), sha256: sha256(bytes) });
}

function readReceipt(entry) {
  if (!entry.receipt) throw new Error("custody-receipt-missing");
  const parent = directoryIdentity(entry.parent.path);
  if (parent.dev !== entry.parent.dev || parent.ino !== entry.parent.ino || parent.uid !== entry.parent.uid
    || parent.gid !== entry.parent.gid || parent.mode !== entry.parent.mode) throw new Error("custody-parent-changed");
  const stat = physicalStat(entry.receipt.path);
  if (!stat.isFile() || stat.dev.toString() !== entry.receipt.dev || stat.ino.toString() !== entry.receipt.ino
    || stat.uid !== BigInt(process.getuid()) || (stat.mode & 0o777n) !== 0o600n || stat.nlink !== 1n) {
    throw new Error("custody-receipt-changed");
  }
  const bytes = readFileSync(entry.receipt.path);
  if (sha256(bytes) !== entry.receipt.sha256) throw new Error("custody-receipt-changed");
  const parsed = JSON.parse(bytes.toString("utf8"));
  if (parsed?.schema !== RECEIPT_SCHEMA
    || JSON.stringify(parsed.rootIdentity) !== JSON.stringify(entry.rootIdentity)
    || JSON.stringify(parsed.gitIdentity) !== JSON.stringify(entry.gitIdentity)
    || JSON.stringify(parsed.creatorProcess) !== JSON.stringify(entry.creatorProcess)
    || parsed.sourceContextSha256 !== entry.sourceModule.sha256
    || JSON.stringify(parsed.sourceContextIdentity) !== JSON.stringify({
      path: entry.sourceModule.path, dev: entry.sourceModule.dev, ino: entry.sourceModule.ino,
    })) throw new Error("custody-receipt-binding");
}

function actualRepository(entry) {
  const actual = discoverRepository(entry.rootIdentity.path);
  if (actual.primaryRoot !== entry.rootIdentity.path || actual.commonDir !== entry.gitIdentity.path
    || actual.worktrees.length !== 1 || actual.worktrees[0].path !== entry.rootIdentity.path) {
    throw new Error("custody-repository-changed");
  }
  return actual;
}

function currentPhysicalCustody(entry) {
  rejectExternalGitSelectors();
  const creator = currentCreator();
  const source = moduleIdentity();
  if (JSON.stringify(creator) !== JSON.stringify(entry.creatorProcess)
    || source.path !== entry.sourceModule.path || source.dev !== entry.sourceModule.dev
    || source.ino !== entry.sourceModule.ino || source.sha256 !== entry.sourceModule.sha256) {
    throw new Error("custody-source-context");
  }
  const rootFd = fstatSync(entry.rootFd, { bigint: true });
  const parent = directoryIdentity(entry.parent.path);
  if (parent.dev !== entry.parent.dev || parent.ino !== entry.parent.ino
    || parent.uid !== entry.parent.uid || parent.gid !== entry.parent.gid
    || parent.mode !== entry.parent.mode) throw new Error("custody-parent-changed");
  const root = directoryIdentity(entry.rootPath);
  if (rootFd.dev.toString() !== entry.rootIdentity.dev || rootFd.ino.toString() !== entry.rootIdentity.ino
    || root.dev !== entry.rootIdentity.dev || root.ino !== entry.rootIdentity.ino
    || root.uid !== entry.rootIdentity.uid || root.gid !== entry.rootIdentity.gid
    || root.mode !== entry.rootIdentity.mode
    || root.mode !== 0o700) throw new Error("custody-root-changed");
  if (entry.gitIdentity === null) throw new Error("custody-git-incomplete");
  const git = directoryIdentity(join(entry.rootPath, ".git"));
  if (git.dev !== entry.gitIdentity.dev || git.ino !== entry.gitIdentity.ino
    || git.uid !== entry.gitIdentity.uid || git.gid !== entry.gitIdentity.gid
    || git.mode !== entry.gitIdentity.mode) throw new Error("custody-git-changed");
  inspectGitTree(git.path);
  const repository = actualRepository(entry);
  readReceipt(entry);
  return Object.freeze({ repository, creator, source, root, git });
}

function exactClaimInput(value) {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
      && Object.keys(value).sort().join("\0") === "exerciseOwnerHandle\0repositoryCustodyHandle"
      && Reflect.ownKeys(value).length === 2;
  } catch {
    return false;
  }
}

function validDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function exactAttestation(value, entry, expectedRepository, expectedPhase) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      || Object.keys(value).sort().join("\0") !== [
        "custodyRefSha256", "exerciseId", "invocationBindingSha256", "operationBindingSha256",
        "phase", "repository", "sourceContextSha256",
      ].sort().join("\0") || Reflect.ownKeys(value).length !== 7) return false;
    return value.phase === expectedPhase
      && value.repository !== null && typeof value.repository === "object"
      && value.repository.primaryRoot === expectedRepository.primaryRoot
      && value.repository.commonDir === expectedRepository.commonDir
      && value.repository.primaryRoot === entry.rootIdentity.path
      && value.repository.commonDir === entry.gitIdentity.path
      && value.custodyRefSha256 === entry.receipt.sha256
      && validDigest(value.sourceContextSha256)
      && validDigest(value.invocationBindingSha256)
      && validDigest(value.operationBindingSha256)
      && typeof value.exerciseId === "string" && value.exerciseId.length > 0
      && value.exerciseId.trim() === value.exerciseId;
  } catch {
    return false;
  }
}

function physicalOutput(entry, attestation) {
  return Object.freeze({
    repository: attestation.repository,
    custodySourceRef: Object.freeze({ schema: RECEIPT_SCHEMA, receiptSha256: entry.receipt.sha256 }),
    rootIdentity: entry.rootIdentity,
    gitIdentity: entry.gitIdentity,
    creatorProcess: entry.creatorProcess,
    sourceContextSha256: entry.sourceModule.sha256,
    exerciseId: attestation.exerciseId,
    invocationBindingSha256: attestation.invocationBindingSha256,
    operationBindingSha256: attestation.operationBindingSha256,
  });
}

function exerciseOutput(status, lifecycle, entry, attestation) {
  return Object.freeze({ status, lifecycle, ...physicalOutput(entry, attestation) });
}

export function createSourceOwnedDisposableAfkRepository(input) {
  if (!exactEmptyRecord(input)) return failure("AFK-CUSTODY-INPUT");
  let rootPath = null;
  let handle = null;
  try {
    rejectExternalGitSelectors();
    const parent = ensureFixtureParent();
    const creatorProcess = currentCreator();
    const sourceModule = moduleIdentity();
    rootPath = mkdtempSync(join(parent.path, "afk-source-owned-"));
    const rootIdentity = directoryIdentity(rootPath);
    if (Number(rootIdentity.mode) !== 0o700) throw new Error("custody-root-mode");
    assertNoRepositoryAncestor(rootPath);
    if (readdirSync(rootPath).length !== 0) throw new Error("custody-root-not-empty");
    const rootFd = openSync(rootPath, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    const rootFdStat = fstatSync(rootFd, { bigint: true });
    if (rootFdStat.dev.toString() !== rootIdentity.dev || rootFdStat.ino.toString() !== rootIdentity.ino) throw new Error("custody-root-race");
    handle = Object.freeze(Object.create(null));
    const entry = {
      handle, parent, rootPath, rootFd, rootIdentity, gitIdentity: null, creatorProcess,
      sourceModule, lifecycle: "created", exerciseActive: false, receipt: null,
    };
    custody.set(handle, entry);
    gitResult(rootPath, ["init", "--quiet"]);
    const rootAfter = directoryIdentity(rootPath);
    if (rootAfter.dev !== rootIdentity.dev || rootAfter.ino !== rootIdentity.ino
      || rootAfter.uid !== rootIdentity.uid || rootAfter.gid !== rootIdentity.gid
      || Number(rootAfter.mode) !== 0o700) throw new Error("custody-root-replaced");
    const gitDir = join(rootPath, ".git");
    const gitIdentity = directoryIdentity(gitDir);
    if (Number(gitIdentity.mode) & 0o022) throw new Error("custody-git-mode");
    if (readdirSync(rootPath).sort().join("\0") !== ".git") throw new Error("custody-root-contents");
    inspectGitTree(gitDir);
    entry.gitIdentity = gitIdentity;
    const repository = actualRepository(entry);
    entry.repository = repository;
    entry.lifecycle = "created";
    persistReceipt(entry);
    return Object.freeze({ status: "created", repositoryCustodyHandle: handle });
  } catch {
    if (handle !== null) {
      const entry = custody.get(handle);
      if (entry) {
        entry.lifecycle = "held";
        try { persistReceipt(entry); } catch { /* retain the actual root and live custody entry */ }
        return Object.freeze({ status: "held", code: "AFK-CUSTODY-PARTIAL-CREATION", repositoryCustodyHandle: handle });
      }
    }
    return failure(rootPath === null ? "AFK-CUSTODY-CREATE-FAILED" : "AFK-CUSTODY-PARTIAL-CREATION", rootPath === null ? "unavailable" : "held");
  }
}

export function inspectSourceOwnedDisposableAfkRepository(input = {}) {
  if (!exactSingleKeyRecord(input, "repositoryCustodyHandle")) return failure("AFK-CUSTODY-INPUT");
  const entry = custody.get(input.repositoryCustodyHandle);
  if (!entry || entry.lifecycle === "closed") return failure("AFK-CUSTODY-UNAVAILABLE");
  if (entry.lifecycle === "held") return failure("AFK-CUSTODY-HELD", "held");
  try {
    const physical = currentPhysicalCustody(entry);
    if (entry.lifecycle === "created") entry.lifecycle = "inspected";
    return Object.freeze({
      status: "owned",
      repository: physical.repository,
      custodySourceRef: Object.freeze({ schema: RECEIPT_SCHEMA, receiptSha256: entry.receipt.sha256 }),
      rootIdentity: entry.rootIdentity,
      gitIdentity: entry.gitIdentity,
      creatorProcess: entry.creatorProcess,
      sourceContextSha256: entry.sourceModule.sha256,
      lifecycle: entry.lifecycle,
    });
  } catch {
    entry.lifecycle = "held";
    return failure("AFK-CUSTODY-CHANGED", "held");
  }
}

export function closeSourceOwnedDisposableAfkRepositoryCustody(input = {}) {
  if (!exactSingleKeyRecord(input, "repositoryCustodyHandle")) return failure("AFK-CUSTODY-INPUT");
  const entry = custody.get(input.repositoryCustodyHandle);
  if (!entry || entry.lifecycle === "closed") return failure("AFK-CUSTODY-UNAVAILABLE");
  if (entry.exerciseActive || entry.lifecycle === "held" || entry.lifecycle === "exercise-claimed") return failure("AFK-CUSTODY-HELD", "held");
  try {
    rejectExternalGitSelectors();
    const creator = currentCreator();
    const source = moduleIdentity();
    const rootFdStat = fstatSync(entry.rootFd, { bigint: true });
    const root = directoryIdentity(entry.rootPath);
    const git = directoryIdentity(join(entry.rootPath, ".git"));
    if (JSON.stringify(creator) !== JSON.stringify(entry.creatorProcess)
      || source.sha256 !== entry.sourceModule.sha256 || source.dev !== entry.sourceModule.dev || source.ino !== entry.sourceModule.ino
      || rootFdStat.dev.toString() !== entry.rootIdentity.dev || rootFdStat.ino.toString() !== entry.rootIdentity.ino
      || root.dev !== entry.rootIdentity.dev || root.ino !== entry.rootIdentity.ino
      || root.uid !== entry.rootIdentity.uid || root.gid !== entry.rootIdentity.gid
      || root.mode !== entry.rootIdentity.mode
      || git.dev !== entry.gitIdentity?.dev || git.ino !== entry.gitIdentity?.ino
      || git.uid !== entry.gitIdentity?.uid || git.gid !== entry.gitIdentity?.gid
      || git.mode !== entry.gitIdentity?.mode) throw new Error("custody-identity-changed");
    actualRepository(entry);
    if (readdirSync(entry.rootPath).sort().join("\0") !== ".git"
      || listRegularFiles(join(entry.gitIdentity.path, "objects")).length !== 0
      || listRegularFiles(join(entry.gitIdentity.path, "refs")).length !== 0) {
      entry.lifecycle = "held";
      return failure("AFK-CUSTODY-HELD", "held");
    }
    readReceipt(entry);
    entry.lifecycle = "closed";
    closeSync(entry.rootFd);
    return Object.freeze({ status: "closed", repositoryCustodyHandle: input.repositoryCustodyHandle });
  } catch {
    entry.lifecycle = "held";
    return failure("AFK-CUSTODY-HELD", "held");
  }
}

export function claimSourceOwnedDisposableAfkRepositoryExercise(input) {
  if (!exactClaimInput(input)) return Object.freeze({ status: "unavailable" });
  const entry = custody.get(input.repositoryCustodyHandle);
  if (!entry) return Object.freeze({ status: "unavailable" });
  const attestation = inspectSourceOwnedControlledContinuityExerciseCustodyClaim({
    exerciseOwnerHandle: input.exerciseOwnerHandle,
    repository: entry.repository,
  });
  if (!exactAttestation(attestation, entry, entry.repository, "claiming")) return Object.freeze({ status: "unavailable" });
  if (entry.lifecycle === "held") return Object.freeze({ status: "held", lifecycle: "held" });
  if (entry.lifecycle !== "created" && entry.lifecycle !== "inspected") return Object.freeze({ status: "unavailable" });
  if (exerciseClaims.has(input.repositoryCustodyHandle)) return Object.freeze({ status: "unavailable" });

  let physical;
  try {
    physical = currentPhysicalCustody(entry);
  } catch {
    entry.lifecycle = "held";
    return Object.freeze({ status: "held", lifecycle: "held" });
  }
  if (physical.repository.primaryRoot !== attestation.repository.primaryRoot
    || physical.repository.commonDir !== attestation.repository.commonDir) {
    entry.lifecycle = "held";
    return Object.freeze({ status: "held", lifecycle: "held" });
  }

  const result = exerciseOutput("claimed", "exercise-claimed", entry, attestation);
  exerciseClaims.set(input.repositoryCustodyHandle, {
    ownerHandle: input.exerciseOwnerHandle,
    exerciseId: attestation.exerciseId,
    repository: attestation.repository,
    custodyRefSha256: entry.receipt.sha256,
    creatorSourceContextSha256: entry.sourceModule.sha256,
    sourceContextSha256: attestation.sourceContextSha256,
    invocationBindingSha256: attestation.invocationBindingSha256,
    operationBindingSha256: attestation.operationBindingSha256,
    settled: false,
  });
  entry.lifecycle = "exercise-claimed";
  entry.exerciseActive = true;
  return result;
}

export function settleSourceOwnedDisposableAfkRepositoryExercise(input) {
  if (!exactClaimInput(input)) return Object.freeze({ status: "unavailable" });
  const entry = custody.get(input.repositoryCustodyHandle);
  if (!entry) return Object.freeze({ status: "unavailable" });
  const claim = exerciseClaims.get(input.repositoryCustodyHandle);
  const attestation = inspectSourceOwnedControlledContinuityExerciseCustodyClaim({
    exerciseOwnerHandle: input.exerciseOwnerHandle,
    repository: claim?.repository ?? entry.repository,
  });
  const expectedRepository = claim?.repository ?? entry.repository;
  if (!exactAttestation(attestation, entry, expectedRepository, "settling")) return Object.freeze({ status: "unavailable" });
  if (entry.lifecycle === "held") return Object.freeze({ status: "held", lifecycle: "held" });
  if (!claim || entry.lifecycle !== "exercise-claimed" || claim.settled
    || input.exerciseOwnerHandle !== claim.ownerHandle) return Object.freeze({ status: "unavailable" });
  claim.settled = true;
  entry.exerciseActive = false;
  if (attestation.exerciseId !== claim.exerciseId
    || attestation.repository.primaryRoot !== claim.repository.primaryRoot
    || attestation.repository.commonDir !== claim.repository.commonDir
    || attestation.custodyRefSha256 !== claim.custodyRefSha256
    || attestation.sourceContextSha256 !== claim.sourceContextSha256
    || attestation.invocationBindingSha256 !== claim.invocationBindingSha256
    || attestation.operationBindingSha256 !== claim.operationBindingSha256) {
    entry.lifecycle = "held";
    return Object.freeze({ status: "held", lifecycle: "held" });
  }

  let physical;
  try {
    physical = currentPhysicalCustody(entry);
  } catch {
    entry.lifecycle = "held";
    return Object.freeze({ status: "held", lifecycle: "held" });
  }
  if (!exactAttestation(attestation, entry, physical.repository, "settling")
    || attestation.exerciseId !== claim.exerciseId
    || attestation.repository.primaryRoot !== claim.repository.primaryRoot
    || attestation.repository.commonDir !== claim.repository.commonDir
    || attestation.custodyRefSha256 !== claim.custodyRefSha256
    || attestation.sourceContextSha256 !== claim.sourceContextSha256
    || attestation.invocationBindingSha256 !== claim.invocationBindingSha256
    || attestation.operationBindingSha256 !== claim.operationBindingSha256) {
    entry.lifecycle = "held";
    return Object.freeze({ status: "held", lifecycle: "held" });
  }

  entry.lifecycle = "completed-with-evidence";
  return exerciseOutput("settled", "completed-with-evidence", entry, attestation);
}
