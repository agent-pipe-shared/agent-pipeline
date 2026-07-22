#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Canonical pipeline-owned worktree placement plus session-owned temporary
 * resource registration/cleanup. This module never discovers deletion targets
 * from a prefix or glob: every destructive effect is driven by a mode-0600
 * manifest entry whose physical identity and canary are revalidated first.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { spawnSync } from "node:child_process";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";

export const WORKTREE_RECORD_SCHEMA = "pipeline.worktree-lifecycle.v1";
export const CLEANUP_MANIFEST_SCHEMA = "pipeline.session-cleanup-manifest.v1";
export const CLEANUP_RECEIPT_SCHEMA = "pipeline.session-cleanup-receipt.v1";
export const HYGIENE_RECEIPT_SCHEMA = "pipeline.worktree-hygiene-receipt.v1";
export const SESSION_DESCRIPTOR_SCHEMA = "pipeline.session-descriptor.v1";

const SAFE_COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const SAFE_PURPOSE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SHA256 = /^[0-9a-f]{64}$/;
const TEMP_TYPES = new Set(["scratch-file", "scratch-directory", "disposable-worktree"]);
const TEMP_CLASSES = new Set(["scratch", "disposable-control", "generated-output"]);
const CLEANUP_POLICIES = new Set(["unlink-file", "remove-directory", "remove-worktree"]);
const PROTECTED_CONTENT_CLASSES = new Set(["spec", "prd", "state", "implementation", "unknown"]);
const FIXED_GIT_CONFIG = [
  "-c", "core.hooksPath=/dev/null",
  "-c", "commit.gpgSign=false",
  "-c", "tag.gpgSign=false",
  "-c", "core.fsmonitor=false",
  "-c", "credential.helper=",
];

export class WorktreeLifecycleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorktreeLifecycleError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new WorktreeLifecycleError(code, message);
}

export function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function rawSha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nowIso(now = new Date()) {
  return now.toISOString();
}

function gitEnvironment(env = process.env) {
  const allowed = [
    "PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "TMP", "TEMP", "TMPDIR",
    "LANG", "LC_ALL", "LC_CTYPE",
  ];
  const result = {};
  for (const key of allowed) if (typeof env[key] === "string") result[key] = env[key];
  result.GIT_CONFIG_NOSYSTEM = "1";
  result.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  result.GIT_TERMINAL_PROMPT = "0";
  result.GIT_ASKPASS = process.platform === "win32" ? "" : "/bin/false";
  result.GIT_PAGER = "cat";
  result.GIT_EDITOR = "true";
  result.GIT_SEQUENCE_EDITOR = "true";
  result.LC_ALL = "C";
  return result;
}

export function runGit(cwd, args, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const result = spawn("git", [...FIXED_GIT_CONFIG, ...args], {
    cwd,
    env: gitEnvironment(options.env),
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
    shell: false,
  });
  if (result.error) fail("WT-GIT-SPAWN", `git could not start: ${result.error.message}`);
  if (result.status !== 0 && !options.allowNonzero) {
    const detail = String(result.stderr || result.stdout || "").trim().slice(0, 500);
    fail("WT-GIT-FAILED", `git ${args[0] || "command"} failed (${result.status})${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function gitText(cwd, args, options = {}) {
  return String(runGit(cwd, args, options).stdout).trim();
}

function ensureSafeId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail("WT-INVALID-ID", `${label} is not a safe identifier`);
  return value;
}

function safeBranchSegments(branchOrRef) {
  if (typeof branchOrRef !== "string") fail("WT-INVALID-BRANCH", "branch must be a string");
  const branch = branchOrRef.startsWith("refs/heads/") ? branchOrRef.slice("refs/heads/".length) : branchOrRef;
  if (!branch || branch.length > 240 || branch.includes("\\") || branch.includes("\0")) {
    fail("WT-INVALID-BRANCH", "branch is not a bounded slash-separated name");
  }
  const segments = branch.split("/");
  if (segments.some((segment) => !SAFE_COMPONENT.test(segment)
    || segment === "." || segment === ".." || segment.endsWith(".") || segment.endsWith(".lock")
    || segment.includes("..") || segment.includes("@{"))) {
    fail("WT-INVALID-BRANCH", "branch contains an unsafe path component");
  }
  return { branch, fullRef: `refs/heads/${branch}`, segments };
}

function ensureSafePurpose(purpose) {
  if (typeof purpose !== "string" || !SAFE_PURPOSE.test(purpose)) {
    fail("WT-INVALID-PURPOSE", "detached purpose must be a lowercase safe label");
  }
  return purpose;
}

function isInside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function assertExistingDirectoryPhysical(path, label) {
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isDirectory()) fail("WT-PATH-TYPE", `${label} must be a non-symlink directory`);
  const physical = realpathSync(path);
  if (physical !== resolve(path)) fail("WT-PATH-ALIAS", `${label} must be addressed by its physical path`);
  return physical;
}

function assertNoSymlinkComponents(rootPhysical, target) {
  if (!isInside(rootPhysical, target) || target === rootPhysical) fail("WT-OUTSIDE-PRIMARY", "target is outside the physical primary root");
  const rel = relative(rootPhysical, target);
  let cursor = rootPhysical;
  for (const segment of rel.split(sep)) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) continue;
    if (lstatSync(cursor).isSymbolicLink()) fail("WT-SYMLINK-PARENT", "target crosses a symlink component");
  }
}

function assertNoCaseFoldCollision(rootPhysical, target) {
  const rel = relative(rootPhysical, target);
  let cursor = rootPhysical;
  for (const segment of rel.split(sep)) {
    if (!existsSync(cursor)) return;
    const matches = readdirSync(cursor).filter((name) => name.toLocaleLowerCase("en-US") === segment.toLocaleLowerCase("en-US"));
    if (matches.some((name) => name !== segment)) fail("WT-CASE-COLLISION", "target has a case-fold path collision");
    cursor = join(cursor, segment);
  }
}

function makeParentsPhysical(rootPhysical, parent) {
  if (!isInside(rootPhysical, parent)) fail("WT-OUTSIDE-PRIMARY", "parent is outside the primary root");
  const rel = relative(rootPhysical, parent);
  let cursor = rootPhysical;
  for (const segment of rel.split(sep).filter(Boolean)) {
    assertNoCaseFoldCollision(rootPhysical, join(cursor, segment));
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) mkdirSync(cursor, { mode: 0o700 });
    if (lstatSync(cursor).isSymbolicLink() || !lstatSync(cursor).isDirectory()) {
      fail("WT-SYMLINK-PARENT", "target parent is not a physical directory");
    }
  }
}

export function parseWorktreePorcelain(raw) {
  const records = [];
  let current = null;
  for (const field of String(raw).split("\0")) {
    if (field === "") {
      if (current) records.push(current);
      current = null;
      continue;
    }
    const split = field.indexOf(" ");
    const key = split === -1 ? field : field.slice(0, split);
    const value = split === -1 ? true : field.slice(split + 1);
    if (key === "worktree") {
      if (current) records.push(current);
      current = { path: value };
    } else {
      if (!current) fail("WT-WORKTREE-LIST", "worktree porcelain contains a field before worktree");
      current[key] = value;
    }
  }
  if (current) records.push(current);
  return records;
}

export function discoverRepository(startPath, options = {}) {
  const start = assertExistingDirectoryPhysical(startPath, "repository path");
  const commonRaw = gitText(start, ["rev-parse", "--path-format=absolute", "--git-common-dir"], options);
  const commonDir = realpathSync(commonRaw);
  if (basename(commonDir) !== ".git") fail("WT-GIT-COMMON-DIR", "primary checkout must have a physical .git common directory");
  const primaryRoot = assertExistingDirectoryPhysical(dirname(commonDir), "primary checkout");
  const records = parseWorktreePorcelain(runGit(start, ["worktree", "list", "--porcelain", "-z"], options).stdout);
  const primaryRecord = records.find((entry) => {
    try { return realpathSync(entry.path) === primaryRoot; } catch { return false; }
  });
  if (!primaryRecord) fail("WT-PRIMARY-MISSING", "Git did not report the physical primary checkout");
  return {
    start,
    primaryRoot,
    commonDir,
    objectFormat: gitText(start, ["rev-parse", "--show-object-format"], options),
    worktrees: records,
  };
}

export function canonicalBranchTarget(primaryRoot, branchOrRef) {
  const root = assertExistingDirectoryPhysical(primaryRoot, "primary checkout");
  const parsed = safeBranchSegments(branchOrRef);
  const target = resolve(root, "branch", ...parsed.segments);
  assertNoSymlinkComponents(root, target);
  assertNoCaseFoldCollision(root, target);
  return { ...parsed, target };
}

export function canonicalDetachedTarget(primaryRoot, purpose, oid) {
  const root = assertExistingDirectoryPhysical(primaryRoot, "primary checkout");
  const label = ensureSafePurpose(purpose);
  if (!OID.test(oid)) fail("WT-INVALID-OID", "detached worktree requires a full lowercase commit OID");
  const target = resolve(root, "branch", "detached", `${label}-${oid.slice(0, 12)}`);
  assertNoSymlinkComponents(root, target);
  assertNoCaseFoldCollision(root, target);
  return { purpose: label, oid, target };
}

/**
 * Directory durability is a hard POSIX flush but is not portably available on
 * native Windows, where opening or fsync-ing a directory handle raises
 * EPERM/EINVAL. The regular-file flush that precedes every call is the hard
 * durability guarantee; parent-directory durability is therefore best-effort on
 * Windows, and its typed-unavailable outcome is not a failure.
 */
function unsupportedDirectoryDurability(error) {
  return process.platform === "win32"
    && (error?.code === "EPERM" || error?.code === "EINVAL"
      || error?.code === "EISDIR" || error?.code === "EACCES"
      || error?.code === "ENOTSUP");
}

function fsyncDirectory(path) {
  let fd;
  try {
    fd = openSync(path, "r");
  } catch (error) {
    if (unsupportedDirectoryDurability(error)) return;
    throw error;
  }
  try {
    fsyncSync(fd);
  } catch (error) {
    if (unsupportedDirectoryDurability(error)) return;
    throw error;
  } finally {
    closeSync(fd);
  }
}

/**
 * Only the components newly created by this call are hardened as owned; a
 * pre-existing (possibly raced-in) directory is merely assessed, never assumed
 * to be ours -- the same discipline as private-boundary.mjs's directory chain.
 * `existing` must be the nearest already-existing ancestor captured BEFORE the
 * caller's mkdirSync, and `code` is the caller's own error code.
 */
function assureWindowsLocalDirectories(existing, parent, code) {
  const created = [];
  for (let cursor = resolve(parent); cursor !== existing; cursor = dirname(cursor)) created.push(cursor);
  created.reverse();
  for (const directory of created) {
    if (hardenWindowsPrivateDirectory(directory).status !== "secure") fail(code, "local state directory Windows assurance is unavailable or insecure");
  }
  if (created.length === 0 && assessWindowsPrivatePath(existing).status !== "secure") {
    fail(code, "local state directory Windows assurance is unavailable or insecure");
  }
}

function writeAtomic(path, bytes, mode = 0o600, { windowsAssurance = true } = {}) {
  const parent = dirname(path);
  let existing = parent;
  while (!existsSync(existing)) existing = dirname(existing);
  if (realpathSync(existing) !== resolve(existing)) fail("WT-LOCAL-SYMLINK", "local state path crosses a symlink");
  const existingBeforeCreate = resolve(existing);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (lstatSync(parent).isSymbolicLink() || realpathSync(parent) !== resolve(parent)) {
    fail("WT-LOCAL-SYMLINK", "local state directory crosses a symlink");
  }
  if (process.platform === "win32" && windowsAssurance) assureWindowsLocalDirectories(existingBeforeCreate, parent, "WT-LOCAL-WINDOWS-ASSURANCE");
  const temporary = join(parent, `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const fd = openSync(temporary, "wx", mode);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  fsyncDirectory(parent);
}

export function ensurePrimaryBranchExclude(repository) {
  const repo = typeof repository === "string" ? discoverRepository(repository) : repository;
  if (realpathSync(join(repo.primaryRoot, ".git")) !== repo.commonDir) {
    fail("WT-PRIMARY-GITDIR", "primary .git directory does not equal the Git common directory");
  }
  const info = join(repo.commonDir, "info");
  if (!existsSync(info)) mkdirSync(info, { mode: 0o700 });
  if (lstatSync(info).isSymbolicLink() || !lstatSync(info).isDirectory()) fail("WT-EXCLUDE-SYMLINK", "Git info directory is not physical");
  const exclude = join(info, "exclude");
  if (existsSync(exclude) && lstatSync(exclude).isSymbolicLink()) fail("WT-EXCLUDE-SYMLINK", "Git exclude file is a symlink");
  const before = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  const lines = before.split(/\r?\n/).filter((line, index, all) => !(line === "" && index === all.length - 1));
  const next = [...lines.filter((line) => line !== "/branch/"), "/branch/"];
  const rendered = `${next.join("\n")}\n`;
  // .git/info is Git's own conventional directory, not Pipeline private state; it
  // is never hardened as owned and must not be held to the private-state DACL bar.
  if (rendered !== before) writeAtomic(exclude, rendered, 0o600, { windowsAssurance: false });
  return { path: exclude, changed: rendered !== before, digest: rawSha256(rendered) };
}

function localRoot(commonDir) {
  return join(commonDir, "agent-pipeline");
}

function worktreeRecordPath(repo, target) {
  const id = rawSha256(Buffer.from(target)).slice(0, 32);
  return join(localRoot(repo.commonDir), "worktrees", `${id}.json`);
}

function fileIdentity(path) {
  const stat = lstatSync(path);
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: stat.mode,
    kind: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
  };
}

function sameIdentity(left, right) {
  return left && right && left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && left.kind === right.kind;
}

function publishWorktreeRecord(repo, record) {
  const path = worktreeRecordPath(repo, record.physicalPath);
  writeAtomic(path, canonicalJson(record));
  return { path, record };
}

function readWorktreeRecords(repo) {
  const dir = join(localRoot(repo.commonDir), "worktrees");
  if (!existsSync(dir)) return [];
  if (lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory()) fail("WT-REGISTRY-TYPE", "worktree registry is not a physical directory");
  return readdirSync(dir).filter((name) => /^[0-9a-f]{32}\.json$/.test(name)).map((name) => {
    const path = join(dir, name);
    const stat = lstatSync(path);
    const posixModeViolation = process.platform !== "win32" && (stat.mode & 0o077) !== 0;
    const windowsInsecure = process.platform === "win32" && (assessWindowsPrivatePath(path).status !== "secure" || assessWindowsPrivatePath(dir).status !== "secure");
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || posixModeViolation || windowsInsecure) {
      fail("WT-REGISTRY-TYPE", "worktree record is not a private single-link regular file");
    }
    const record = JSON.parse(readFileSync(path, "utf8"));
    if (record.schema !== WORKTREE_RECORD_SCHEMA) fail("WT-REGISTRY-SCHEMA", "worktree record schema is invalid");
    return { path, record };
  });
}

function resolveCommit(repo, value, options = {}) {
  const oid = gitText(repo.primaryRoot, ["rev-parse", "--verify", `${value}^{commit}`], options);
  if (!OID.test(oid)) fail("WT-INVALID-OID", "Git returned a noncanonical commit OID");
  return oid;
}

function verifyReadyWorktree(repo, target, expected) {
  const physical = assertExistingDirectoryPhysical(target, "created worktree");
  if (physical !== target) fail("WT-PATH-ALIAS", "created worktree path changed physically");
  const oid = gitText(target, ["rev-parse", "HEAD"]);
  if (oid !== expected.oid) fail("WT-OID-MISMATCH", "created worktree has the wrong commit");
  const branch = gitText(target, ["symbolic-ref", "-q", "HEAD"], { allowNonzero: true });
  if ((expected.ref ?? "") !== branch) fail("WT-REF-MISMATCH", "created worktree has the wrong branch state");
  const common = realpathSync(gitText(target, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  if (common !== repo.commonDir) fail("WT-COMMON-DIR-MISMATCH", "created worktree has a different Git common directory");
  return { physical, oid, ref: branch || null, identity: fileIdentity(physical) };
}

function newWorktreeRecord(repo, fields, now) {
  return {
    schema: WORKTREE_RECORD_SCHEMA,
    revision: 0,
    status: "creating",
    lifecycle: fields.lifecycle,
    physicalPath: fields.physicalPath,
    primaryRoot: repo.primaryRoot,
    commonDir: repo.commonDir,
    ref: fields.ref ?? null,
    oid: fields.oid,
    purpose: fields.purpose ?? null,
    sessionId: fields.sessionId ?? null,
    sourcePath: fields.sourcePath ?? null,
    identity: null,
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
    reason: null,
  };
}

function failWorktreeRecord(repo, record, error, now) {
  const blocked = {
    ...record,
    revision: record.revision + 1,
    status: "blocked",
    updatedAt: nowIso(now),
    reason: error instanceof WorktreeLifecycleError ? error.code : "WT-INTERNAL",
  };
  try { publishWorktreeRecord(repo, blocked); } catch { /* preserve the primary failure */ }
}

export function createBranchWorktree(startPath, branchOrRef, options = {}) {
  const repo = discoverRepository(startPath, options);
  const mapping = canonicalBranchTarget(repo.primaryRoot, branchOrRef);
  if (existsSync(mapping.target)) fail("WT-TARGET-EXISTS", "canonical branch target already exists");
  runGit(repo.primaryRoot, ["check-ref-format", "--branch", mapping.branch], options);
  runGit(repo.primaryRoot, ["show-ref", "--verify", mapping.fullRef], options);
  const oid = resolveCommit(repo, mapping.fullRef, options);
  makeParentsPhysical(repo.primaryRoot, dirname(mapping.target));
  ensurePrimaryBranchExclude(repo);
  const record = newWorktreeRecord(repo, {
    lifecycle: "persistent-branch",
    physicalPath: mapping.target,
    ref: mapping.fullRef,
    oid,
  }, options.now);
  publishWorktreeRecord(repo, record);
  try {
    // `git worktree add <path> refs/heads/x` may treat the fully qualified ref as
    // a detached commit-ish. The already check-ref-format/show-ref-validated
    // short branch name is required here so Git attaches HEAD to that branch.
    runGit(repo.primaryRoot, ["worktree", "add", mapping.target, mapping.branch], options);
    const verified = verifyReadyWorktree(repo, mapping.target, { oid, ref: mapping.fullRef });
    const ready = { ...record, revision: 1, status: "ready", identity: verified.identity, updatedAt: nowIso(options.now) };
    publishWorktreeRecord(repo, ready);
    return ready;
  } catch (error) {
    failWorktreeRecord(repo, record, error, options.now);
    throw error;
  }
}

function ownerDigest(ownerNonce) {
  if (typeof ownerNonce !== "string" || ownerNonce.length < 16 || ownerNonce.length > 256) {
    fail("WT-OWNER-NONCE", "owner nonce must contain 16..256 characters");
  }
  return rawSha256(Buffer.from(ownerNonce));
}

function sessionDescriptorPath(repo, sessionId) {
  ensureSafeId(sessionId, "session ID");
  return join(localRoot(repo.commonDir), "session-descriptors", "active", `${sessionId}.json`);
}

function assertPrivateRegularFile(path, code, label) {
  const stat = lstatSync(path);
  // POSIX mode bits express owner-only exclusivity directly; native Windows has no
  // such mode semantics (mode is a synthetic constant), so the equivalent assurance
  // there is the shared owner-DACL check on both the file and its parent directory.
  const posixModeViolation = process.platform !== "win32" && (stat.mode & 0o077) !== 0;
  const windowsInsecure = process.platform === "win32"
    && (assessWindowsPrivatePath(path).status !== "secure" || assessWindowsPrivatePath(dirname(path)).status !== "secure");
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || posixModeViolation || windowsInsecure) {
    fail(code, `${label} is not a private single-link regular file`);
  }
}

function validSessionDescriptor(value, repo, sessionId) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 7
    && value.schema === SESSION_DESCRIPTOR_SCHEMA
    && value.sessionId === sessionId
    && value.primaryRoot === repo.primaryRoot
    && value.commonDir === repo.commonDir
    && typeof value.createdAt === "string"
    && typeof value.ownerNonce === "string"
    && value.ownerNonceSha256 === ownerDigest(value.ownerNonce);
}

/** Create the local, non-committed capability used by all session cleanup calls. */
export function startSessionDescriptor(startPath, options = {}) {
  const repo = discoverRepository(startPath, options);
  const sessionId = options.sessionId ?? `session-${randomBytes(12).toString("hex")}`;
  ensureSafeId(sessionId, "session ID");
  const path = sessionDescriptorPath(repo, sessionId);
  if (existsSync(path)) fail("WT-SESSION-EXISTS", "session descriptor already exists");
  const ownerNonce = options.ownerNonce ?? randomBytes(32).toString("base64url");
  const descriptor = {
    schema: SESSION_DESCRIPTOR_SCHEMA,
    sessionId,
    primaryRoot: repo.primaryRoot,
    commonDir: repo.commonDir,
    createdAt: nowIso(options.now),
    ownerNonce,
    ownerNonceSha256: ownerDigest(ownerNonce),
  };
  writeAtomic(path, canonicalJson(descriptor));
  return {
    repo,
    path,
    sessionId,
    ownerNonce,
    descriptorSha256: rawSha256(readFileSync(path)),
  };
}

/** Load a descriptor only from this repository's private Git-common-dir namespace. */
export function loadSessionDescriptor(startPath, sessionId, options = {}) {
  const repo = discoverRepository(startPath, options);
  ensureSafeId(sessionId, "session ID");
  const path = sessionDescriptorPath(repo, sessionId);
  if (!existsSync(path)) fail("WT-SESSION-MISSING", "session descriptor is missing");
  assertPrivateRegularFile(path, "WT-SESSION-DESCRIPTOR", "session descriptor");
  let descriptor;
  try { descriptor = JSON.parse(readFileSync(path, "utf8")); } catch { fail("WT-SESSION-DESCRIPTOR", "session descriptor is malformed"); }
  if (!validSessionDescriptor(descriptor, repo, sessionId)) fail("WT-SESSION-BINDING", "session descriptor binding is invalid");
  const descriptorSha256 = rawSha256(readFileSync(path));
  if (options.expectedDescriptorSha256 !== undefined) {
    if (typeof options.expectedDescriptorSha256 !== "string" || !SHA256.test(options.expectedDescriptorSha256)
      || !timingSafeEqual(Buffer.from(descriptorSha256), Buffer.from(options.expectedDescriptorSha256))) {
      fail("WT-SESSION-DIGEST", "session descriptor digest does not match the persisted handle");
    }
  }
  return {
    repo,
    path,
    sessionId,
    ownerNonce: descriptor.ownerNonce,
    descriptorSha256,
  };
}

/** Remove a descriptor only after the exact holder has finished cleanup. */
export function retireSessionDescriptor(startPath, fields, options = {}) {
  const loaded = loadSessionDescriptor(startPath, fields.sessionId, {
    ...options,
    expectedDescriptorSha256: fields.descriptorSha256 ?? options.expectedDescriptorSha256,
  });
  if (loaded.ownerNonce !== fields.ownerNonce) fail("WT-SESSION-OWNER", "session descriptor owner does not match");
  if (existsSync(cleanupManifestPath(loaded.repo, fields.sessionId))) {
    fail("WT-SESSION-ACTIVE", "session descriptor cannot retire while cleanup manifest is active");
  }
  unlinkSync(loaded.path);
  fsyncDirectory(dirname(loaded.path));
  return { sessionId: loaded.sessionId, descriptorSha256: loaded.descriptorSha256 };
}

function cleanupManifestPath(repo, sessionId) {
  ensureSafeId(sessionId, "session ID");
  return join(localRoot(repo.commonDir), "session-cleanup", "active", `${sessionId}.json`);
}

function cleanupReceiptPath(repo, sessionId) {
  ensureSafeId(sessionId, "session ID");
  return join(localRoot(repo.commonDir), "session-cleanup", "receipts", `${sessionId}.json`);
}

/** Read only the closure state needed by a private, session-bound receipt owner. */
export function inspectSessionClosure(startPath, sessionId, options = {}) {
  const repo = discoverRepository(startPath, options);
  ensureSafeId(sessionId, "session ID");
  const descriptor = sessionDescriptorPath(repo, sessionId);
  if (existsSync(descriptor)) {
    loadSessionDescriptor(startPath, sessionId, {
      ...options,
      expectedDescriptorSha256: options.expectedDescriptorSha256,
    });
    return { status: "active", closedAt: null };
  }
  const receiptPath = cleanupReceiptPath(repo, sessionId);
  if (!existsSync(receiptPath)) return { status: "unknown", closedAt: null };
  assertPrivateRegularFile(receiptPath, "WT-SESSION-CLOSURE", "session cleanup receipt");
  let receipt;
  try { receipt = JSON.parse(readFileSync(receiptPath, "utf8")); } catch { fail("WT-SESSION-CLOSURE", "session cleanup receipt is malformed"); }
  const expectedKeys = ["schema", "sessionSha256", "status", "counts", "outcomes", "completedAt"];
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)
    || JSON.stringify(Object.keys(receipt).sort()) !== JSON.stringify(expectedKeys.sort())
    || receipt.schema !== CLEANUP_RECEIPT_SCHEMA
    || receipt.sessionSha256 !== rawSha256(Buffer.from(sessionId))
    || receipt.status !== "complete"
    || typeof receipt.completedAt !== "string"
    || Number.isNaN(Date.parse(receipt.completedAt))) {
    fail("WT-SESSION-CLOSURE", "session cleanup receipt is not a completed closure record");
  }
  return { status: "closed", closedAt: receipt.completedAt };
}

function processIdentityAlive(pid, startId) {
  if (!Number.isSafeInteger(pid) || pid < 1 || typeof startId !== "string") return true;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
  return processStartIdentity(pid) === startId;
}

function acquireManifestLock(repo, sessionId, nonce) {
  const manifestPath = cleanupManifestPath(repo, sessionId);
  const lockPath = `${manifestPath}.lock`;
  const expectedOwner = ownerDigest(nonce);
  const lockParent = dirname(lockPath);
  let existingLockAncestor = lockParent;
  while (!existsSync(existingLockAncestor)) existingLockAncestor = dirname(existingLockAncestor);
  const existingLockAncestorBeforeCreate = resolve(existingLockAncestor);
  mkdirSync(lockParent, { recursive: true, mode: 0o700 });
  if (realpathSync(lockParent) !== resolve(lockParent)) fail("WT-LOCAL-SYMLINK", "cleanup lock directory crosses a symlink");
  if (process.platform === "win32") assureWindowsLocalDirectories(existingLockAncestorBeforeCreate, lockParent, "WT-MANIFEST-LOCK");
  if (existsSync(lockPath)) {
    const stat = lstatSync(lockPath);
    const posixModeViolation = process.platform !== "win32" && (stat.mode & 0o077) !== 0;
    const windowsInsecure = process.platform === "win32" && assessWindowsPrivatePath(lockPath).status !== "secure";
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || posixModeViolation || windowsInsecure) {
      fail("WT-MANIFEST-LOCK", "cleanup writer lock is not a private regular file");
    }
    let stale;
    try { stale = JSON.parse(readFileSync(lockPath, "utf8")); } catch { fail("WT-MANIFEST-LOCK", "cleanup writer lock is malformed"); }
    if (stale.schema !== "pipeline.session-cleanup-lock.v1" || stale.sessionId !== sessionId
      || stale.ownerNonceSha256 !== expectedOwner || processIdentityAlive(stale.pid, stale.processStartId)) {
      fail("WT-MANIFEST-LOCK", "cleanup manifest has a live, foreign or untrusted writer lock");
    }
    unlinkSync(lockPath);
    fsyncDirectory(dirname(lockPath));
  }
  const lock = {
    schema: "pipeline.session-cleanup-lock.v1",
    sessionId,
    ownerNonceSha256: expectedOwner,
    pid: process.pid,
    processStartId: processStartIdentity(process.pid),
  };
  const bytes = canonicalJson(lock);
  const fd = openSync(lockPath, "wx", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  fsyncDirectory(dirname(lockPath));
  return () => {
    if (!existsSync(lockPath) || rawSha256(readFileSync(lockPath)) !== rawSha256(bytes)) {
      fail("WT-MANIFEST-LOCK", "cleanup writer lock ownership changed");
    }
    unlinkSync(lockPath);
    fsyncDirectory(dirname(lockPath));
  };
}

function newManifest(repo, sessionId, nonce, now) {
  return {
    schema: CLEANUP_MANIFEST_SCHEMA,
    revision: 0,
    sessionId,
    ownerNonceSha256: ownerDigest(nonce),
    primaryRoot: repo.primaryRoot,
    commonDir: repo.commonDir,
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
    resources: [],
  };
}

function loadManifest(repo, sessionId, nonce, { create = false, now } = {}) {
  const path = cleanupManifestPath(repo, sessionId);
  if (!existsSync(path)) {
    if (!create) fail("WT-MANIFEST-MISSING", "session cleanup manifest is missing");
    return { path, manifest: newManifest(repo, sessionId, nonce, now) };
  }
  const stat = lstatSync(path);
  const posixModeViolation = process.platform !== "win32" && (stat.mode & 0o077) !== 0;
  const windowsInsecure = process.platform === "win32" && (assessWindowsPrivatePath(path).status !== "secure" || assessWindowsPrivatePath(dirname(path)).status !== "secure");
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || posixModeViolation || windowsInsecure) {
    fail("WT-MANIFEST-TYPE", "cleanup manifest is not a private single-link regular file");
  }
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (manifest.schema !== CLEANUP_MANIFEST_SCHEMA || manifest.sessionId !== sessionId
    || manifest.ownerNonceSha256 !== ownerDigest(nonce)
    || manifest.primaryRoot !== repo.primaryRoot || manifest.commonDir !== repo.commonDir
    || !Array.isArray(manifest.resources)) {
    fail("WT-MANIFEST-BINDING", "cleanup manifest binding is invalid");
  }
  return { path, manifest };
}

function writeManifest(path, manifest, now) {
  const next = { ...manifest, revision: manifest.revision + 1, updatedAt: nowIso(now) };
  writeAtomic(path, canonicalJson(next));
  return next;
}

function allowedRootFor(repo, type, path) {
  const physicalTmp = realpathSync(tmpdir());
  const detached = resolve(repo.primaryRoot, "branch", "detached");
  const absolute = resolve(path);
  if (type === "disposable-worktree") {
    if (!isInside(detached, absolute) || absolute === detached) fail("WT-TEMP-ROOT", "disposable worktree is outside branch/detached");
    return detached;
  }
  if (!isInside(physicalTmp, absolute) || absolute === physicalTmp) fail("WT-TEMP-ROOT", "scratch resource is outside the physical temporary root");
  return physicalTmp;
}

function assertTemporaryClassification(resource) {
  if (!TEMP_TYPES.has(resource.type)) fail("WT-TEMP-TYPE", "temporary resource type is unsupported");
  if (!TEMP_CLASSES.has(resource.contentClass) || PROTECTED_CONTENT_CLASSES.has(resource.contentClass)) {
    fail("WT-TEMP-CONTENT", "Specs, PRDs, state and implementation work cannot be temporary resources");
  }
  if (resource.soleCopy !== false) fail("WT-TEMP-SOLE-COPY", "temporary resources must explicitly declare soleCopy:false");
  if (!CLEANUP_POLICIES.has(resource.cleanupPolicy)) fail("WT-TEMP-POLICY", "cleanup policy is unsupported");
  const expectedPolicy = resource.type === "scratch-file" ? "unlink-file"
    : resource.type === "scratch-directory" ? "remove-directory" : "remove-worktree";
  if (resource.cleanupPolicy !== expectedPolicy) fail("WT-TEMP-POLICY", "cleanup policy does not match resource type");
}

export function registerTemporaryIntent(startPath, fields, options = {}) {
  const repo = discoverRepository(startPath, options);
  const sessionId = ensureSafeId(fields.sessionId, "session ID");
  const resourceId = ensureSafeId(fields.resourceId, "resource ID");
  assertTemporaryClassification(fields);
  const releaseLock = acquireManifestLock(repo, sessionId, fields.ownerNonce);
  try {
  if (existsSync(cleanupReceiptPath(repo, sessionId))) {
    fail("WT-SESSION-CLOSED", "a completed cleanup receipt already closes this session ID");
  }
  const path = resolve(fields.path);
  const allowedRoot = allowedRootFor(repo, fields.type, path);
  if (!isInside(allowedRoot, path) || path === allowedRoot) fail("WT-TEMP-ROOT", "temporary path is not a child of its allowed root");
  const loaded = loadManifest(repo, sessionId, fields.ownerNonce, { create: true, now: options.now });
  if (loaded.manifest.resources.some((entry) => entry.resourceId === resourceId || entry.physicalPath === path)) {
    fail("WT-TEMP-DUPLICATE", "temporary resource is already registered");
  }
  const resource = {
    resourceId,
    type: fields.type,
    contentClass: fields.contentClass,
    soleCopy: false,
    cleanupPolicy: fields.cleanupPolicy,
    physicalPath: path,
    allowedRoot,
    status: "creating",
    creationIdentity: {
      pid: process.pid,
      processStartId: processStartIdentity(process.pid),
    },
    objectIdentity: null,
    canary: null,
    sealedTreeSha256: null,
    createdAt: nowIso(options.now),
  };
  const manifest = writeManifest(loaded.path, { ...loaded.manifest, resources: [...loaded.manifest.resources, resource] }, options.now);
  return { repo, path: loaded.path, manifest, resource };
  } finally {
    releaseLock();
  }
}

function readCanary(resource, canaryRelative) {
  if (resource.type === "scratch-file") {
    if (canaryRelative !== null && canaryRelative !== undefined && canaryRelative !== "") fail("WT-CANARY-PATH", "file canary must be the file itself");
    return { relativePath: null, sha256: rawSha256(readFileSync(resource.physicalPath)) };
  }
  if (typeof canaryRelative !== "string" || !canaryRelative || isAbsolute(canaryRelative)
    || canaryRelative.split(/[\\/]/).some((part) => !part || part === "." || part === "..")) {
    fail("WT-CANARY-PATH", "directory canary must be a safe relative file path");
  }
  const candidate = resolve(resource.physicalPath, canaryRelative);
  if (!isInside(resource.physicalPath, candidate) || !existsSync(candidate)) fail("WT-CANARY-MISSING", "registered canary is missing");
  const stat = lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) fail("WT-CANARY-TYPE", "registered canary must be a single-link regular file");
  return { relativePath: canaryRelative.split(sep).join("/"), sha256: rawSha256(readFileSync(candidate)) };
}

function treeFingerprint(root) {
  const entries = [];
  function visit(current, prefix) {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) fail("WT-TEMP-SYMLINK", "temporary directory contains a symlink");
      const rel = prefix ? `${prefix}/${name}` : name;
      if (stat.isDirectory()) {
        entries.push([rel, "directory", stat.mode]);
        visit(path, rel);
      } else if (stat.isFile()) {
        if (stat.nlink !== 1) fail("WT-TEMP-HARDLINK", "temporary directory contains a hard-linked file");
        entries.push([rel, "file", stat.mode, rawSha256(readFileSync(path))]);
      } else {
        fail("WT-TEMP-TYPE", "temporary directory contains an unsupported object");
      }
    }
  }
  visit(root, "");
  return rawSha256(Buffer.from(canonicalJson(entries)));
}

function resourceFingerprint(resource) {
  if (resource.type === "scratch-file") return rawSha256(readFileSync(resource.physicalPath));
  if (resource.type === "scratch-directory") return treeFingerprint(resource.physicalPath);
  return null;
}

export function finalizeTemporaryResource(startPath, fields, options = {}) {
  const repo = discoverRepository(startPath, options);
  const releaseLock = acquireManifestLock(repo, fields.sessionId, fields.ownerNonce);
  try {
  const loaded = loadManifest(repo, fields.sessionId, fields.ownerNonce);
  const index = loaded.manifest.resources.findIndex((entry) => entry.resourceId === fields.resourceId);
  if (index < 0) fail("WT-TEMP-MISSING", "temporary resource intent is missing");
  const resource = loaded.manifest.resources[index];
  if (resource.status !== "creating") fail("WT-TEMP-PHASE", "temporary resource is not awaiting finalization");
  const physical = assertExistingDirectoryOrFile(resource.physicalPath, resource.type);
  if (physical !== resource.physicalPath) fail("WT-PATH-ALIAS", "temporary resource moved through an alias");
  if (!isInside(realpathSync(resource.allowedRoot), physical)) fail("WT-TEMP-ROOT", "temporary resource escaped its allowed root");
  const canary = readCanary(resource, fields.canaryRelative ?? (resource.type === "disposable-worktree" ? ".git" : null));
  const ready = {
    ...resource,
    status: "ready",
    objectIdentity: fileIdentity(resource.physicalPath),
    canary,
    sealedTreeSha256: resourceFingerprint(resource),
  };
  const resources = [...loaded.manifest.resources];
  resources[index] = ready;
  const manifest = writeManifest(loaded.path, { ...loaded.manifest, resources }, options.now);
  return { repo, path: loaded.path, manifest, resource: ready };
  } finally {
    releaseLock();
  }
}

function assertExistingDirectoryOrFile(path, type) {
  if (!existsSync(path)) fail("WT-TEMP-MISSING", "temporary resource does not exist");
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) fail("WT-TEMP-SYMLINK", "temporary resource is a symlink");
  const expectedDirectory = type !== "scratch-file";
  if (expectedDirectory !== stat.isDirectory() || (!expectedDirectory && !stat.isFile())) {
    fail("WT-TEMP-TYPE", "temporary resource has the wrong physical type");
  }
  if (!expectedDirectory && stat.nlink !== 1) fail("WT-TEMP-HARDLINK", "temporary file must have exactly one hard link");
  return realpathSync(path);
}

export function sealTemporaryResource(startPath, fields, options = {}) {
  const repo = discoverRepository(startPath, options);
  const releaseLock = acquireManifestLock(repo, fields.sessionId, fields.ownerNonce);
  try {
  const loaded = loadManifest(repo, fields.sessionId, fields.ownerNonce);
  const index = loaded.manifest.resources.findIndex((entry) => entry.resourceId === fields.resourceId);
  if (index < 0) fail("WT-TEMP-MISSING", "temporary resource is not registered");
  const resource = loaded.manifest.resources[index];
  if (!new Set(["ready", "sealed"]).has(resource.status)) fail("WT-TEMP-PHASE", "temporary resource cannot be sealed in its current phase");
  const refreshScratch = options.refreshScratch === true;
  if (refreshScratch && (resource.status !== "sealed" || resource.type !== "scratch-directory")) {
    fail("WT-TEMP-PHASE", "only a sealed scratch directory may refresh its tree seal");
  }
  validateResourcePhysical(repo, resource, { requireCleanWorktree: false, allowScratchTreeRefresh: refreshScratch });
  const sealed = { ...resource, status: "sealed", sealedTreeSha256: resourceFingerprint(resource) };
  const resources = [...loaded.manifest.resources];
  resources[index] = sealed;
  const manifest = writeManifest(loaded.path, { ...loaded.manifest, resources }, options.now);
  return { repo, path: loaded.path, manifest, resource: sealed };
  } finally {
    releaseLock();
  }
}

/** Read back one sealed temporary resource before granting it to a host. */
export function inspectTemporaryResource(startPath, fields, options = {}) {
  const repo = discoverRepository(startPath, options);
  const releaseLock = acquireManifestLock(repo, fields.sessionId, fields.ownerNonce);
  try {
    const loaded = loadManifest(repo, fields.sessionId, fields.ownerNonce);
    const resource = loaded.manifest.resources.find((entry) => entry.resourceId === fields.resourceId);
    if (!resource) fail("WT-TEMP-MISSING", "temporary resource is not registered");
    if (resource.status !== "sealed") fail("WT-TEMP-PHASE", "temporary resource is not sealed for host use");
    validateResourcePhysical(repo, resource, { requireCleanWorktree: false });
    return { repo, path: loaded.path, resource: structuredClone(resource) };
  } finally {
    releaseLock();
  }
}

export function createDetachedWorktree(startPath, purpose, oidish, fields = {}, options = {}) {
  const repo = discoverRepository(startPath, options);
  const oid = resolveCommit(repo, oidish, options);
  const mapping = canonicalDetachedTarget(repo.primaryRoot, purpose, oid);
  if (existsSync(mapping.target)) fail("WT-TARGET-EXISTS", "canonical detached target already exists");
  const sessionId = ensureSafeId(fields.sessionId, "session ID");
  const ownerNonce = fields.ownerNonce;
  makeParentsPhysical(repo.primaryRoot, dirname(mapping.target));
  ensurePrimaryBranchExclude(repo);
  const record = newWorktreeRecord(repo, {
    lifecycle: "detached-operational",
    physicalPath: mapping.target,
    oid,
    purpose: mapping.purpose,
    sessionId,
  }, options.now);
  publishWorktreeRecord(repo, record);
  registerTemporaryIntent(repo.primaryRoot, {
    sessionId,
    ownerNonce,
    resourceId: fields.resourceId ?? `detached-${mapping.purpose}-${oid.slice(0, 12)}`,
    type: "disposable-worktree",
    contentClass: "disposable-control",
    soleCopy: false,
    cleanupPolicy: "remove-worktree",
    path: mapping.target,
  }, options);
  try {
    runGit(repo.primaryRoot, ["worktree", "add", "--detach", mapping.target, oid], options);
    const verified = verifyReadyWorktree(repo, mapping.target, { oid, ref: null });
    const ready = { ...record, revision: 1, status: "ready", identity: verified.identity, updatedAt: nowIso(options.now) };
    publishWorktreeRecord(repo, ready);
    finalizeTemporaryResource(repo.primaryRoot, {
      sessionId,
      ownerNonce,
      resourceId: fields.resourceId ?? `detached-${mapping.purpose}-${oid.slice(0, 12)}`,
      canaryRelative: ".git",
    }, options);
    return ready;
  } catch (error) {
    failWorktreeRecord(repo, record, error, options.now);
    throw error;
  }
}

function processStartIdentity(pid) {
  if (process.platform !== "linux") return `pid-${pid}`;
  try {
    const fields = readFileSync(`/proc/${pid}/stat`, "utf8").trim().split(" ");
    return fields[21] || `pid-${pid}`;
  } catch {
    return `pid-${pid}`;
  }
}

function validateResourcePhysical(repo, resource, { requireCleanWorktree = true, allowScratchTreeRefresh = false } = {}) {
  const physical = assertExistingDirectoryOrFile(resource.physicalPath, resource.type);
  if (physical !== resource.physicalPath || !isInside(realpathSync(resource.allowedRoot), physical)) {
    fail("WT-RESOURCE-ALIAS", "registered resource path no longer resolves exactly inside its allowed root");
  }
  if (!sameIdentity(resource.objectIdentity, fileIdentity(physical))) fail("WT-RESOURCE-IDENTITY", "registered resource identity changed");
  const canary = readCanary(resource, resource.canary.relativePath);
  if (canary.sha256 !== resource.canary.sha256) fail("WT-CANARY-DRIFT", "registered resource canary changed");
  if (resource.type === "scratch-directory" && !allowScratchTreeRefresh && resourceFingerprint(resource) !== resource.sealedTreeSha256) {
    fail("WT-RESOURCE-DRIFT", "registered scratch directory changed after sealing");
  }
  if (resource.type === "scratch-file" && resourceFingerprint(resource) !== resource.sealedTreeSha256) {
    fail("WT-RESOURCE-DRIFT", "registered scratch file changed after sealing");
  }
  if (resource.type === "disposable-worktree") {
    const common = realpathSync(gitText(resource.physicalPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
    if (common !== repo.commonDir) fail("WT-COMMON-DIR-MISMATCH", "registered worktree changed repositories");
    if (requireCleanWorktree) {
      const dirty = runGit(resource.physicalPath, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout;
      const ignored = runGit(resource.physicalPath, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]).stdout;
      if (String(dirty).length > 0 || String(ignored).length > 0) fail("WT-WORKTREE-DIRTY", "registered worktree contains dirty, untracked or ignored data");
    }
  }
  return physical;
}

function classifyCleanupFailure(error) {
  return error instanceof WorktreeLifecycleError ? error.code : "WT-INTERNAL";
}

function sanitizedCleanupReceipt(sessionId, resources, status, now) {
  const outcomes = resources.map((resource) => ({
    resourceId: resource.resourceId,
    type: resource.type,
    classification: resource.contentClass,
    status: resource.status === "removed" ? "removed" : "blocked",
    code: resource.reason ?? (resource.status === "removed" ? "removed" : "WT-CLEANUP-INCOMPLETE"),
  }));
  return {
    schema: CLEANUP_RECEIPT_SCHEMA,
    sessionSha256: rawSha256(Buffer.from(sessionId)),
    status,
    counts: {
      registered: outcomes.length,
      removed: outcomes.filter((entry) => entry.status === "removed").length,
      blocked: outcomes.filter((entry) => entry.status === "blocked").length,
    },
    outcomes,
    completedAt: nowIso(now),
  };
}

function removeRegisteredResource(repo, resource) {
  if (resource.type === "disposable-worktree") {
    runGit(repo.primaryRoot, ["worktree", "remove", resource.physicalPath]);
    if (existsSync(resource.physicalPath)) fail("WT-CLEANUP-FAILED", "Git retained the disposable worktree path");
    const registered = readWorktreeRecords(repo).find(({ record }) => record.physicalPath === resource.physicalPath);
    if (registered) publishWorktreeRecord(repo, {
      ...registered.record,
      revision: registered.record.revision + 1,
      status: "removed",
      identity: null,
      updatedAt: nowIso(),
      reason: null,
    });
  } else if (resource.type === "scratch-file") {
    unlinkSync(resource.physicalPath);
  } else {
    rmSync(resource.physicalPath, { recursive: true, force: false });
  }
}

export function cleanupSession(startPath, fields, options = {}) {
  const repo = discoverRepository(startPath, options);
  const releaseLock = acquireManifestLock(repo, fields.sessionId, fields.ownerNonce);
  try {
  if (options.allowAbsent === true && !existsSync(cleanupManifestPath(repo, fields.sessionId))) {
    const receipt = sanitizedCleanupReceipt(fields.sessionId, [], "complete", options.now);
    const receiptPath = cleanupReceiptPath(repo, fields.sessionId);
    if (existsSync(receiptPath)) fail("WT-SESSION-CLOSED", "a completed cleanup receipt already closes this session ID");
    writeAtomic(receiptPath, canonicalJson(receipt));
    return { ok: true, receipt, receiptPath };
  }
  const loaded = loadManifest(repo, fields.sessionId, fields.ownerNonce);
  const preflight = [];
  for (const resource of loaded.manifest.resources) {
    if (resource.status === "removed") continue;
    if (resource.status === "cleanup-intent" && !existsSync(resource.physicalPath)) continue;
    if (resource.status === "creating") {
      // Intent is durable before physical scratch creation. A crash before or
      // during that materialization is still safe to drain by exact manifest
      // identity; no canary/tree claim exists at this phase.
      if (!existsSync(resource.physicalPath)) continue;
      try {
        const physical = assertExistingDirectoryOrFile(resource.physicalPath, resource.type);
        if (physical !== resource.physicalPath || !isInside(realpathSync(resource.allowedRoot), physical)) {
          fail("WT-RESOURCE-ALIAS", "creating resource path no longer resolves exactly inside its allowed root");
        }
      } catch (error) {
        preflight.push({ resourceId: resource.resourceId, code: classifyCleanupFailure(error) });
      }
      continue;
    }
    try {
      if (!new Set(["ready", "sealed", "cleanup-intent"]).has(resource.status)) fail("WT-TEMP-PHASE", "temporary resource is not cleanup-ready");
      validateResourcePhysical(repo, resource);
    } catch (error) {
      preflight.push({ resourceId: resource.resourceId, code: classifyCleanupFailure(error) });
    }
  }
  if (preflight.length > 0) {
    const resources = loaded.manifest.resources.map((resource) => {
      const blocked = preflight.find((entry) => entry.resourceId === resource.resourceId);
      return blocked ? { ...resource, reason: blocked.code } : resource;
    });
    return { ok: false, receipt: sanitizedCleanupReceipt(fields.sessionId, resources, "blocked", options.now), manifestPath: loaded.path };
  }

  let manifest = loaded.manifest;
  const inject = (step) => { if (options.faultInjector) options.faultInjector(step); };
  for (let index = 0; index < manifest.resources.length; index += 1) {
    let resource = manifest.resources[index];
    if (resource.status === "removed") continue;
    if (resource.status !== "cleanup-intent") {
      const resources = [...manifest.resources];
      resource = { ...resource, status: "cleanup-intent", reason: null };
      resources[index] = resource;
      manifest = writeManifest(loaded.path, { ...manifest, resources }, options.now);
      inject(`cleanup-intent:${resource.resourceId}`);
    }
    if (existsSync(resource.physicalPath)) removeRegisteredResource(repo, resource);
    inject(`resource-removed:${resource.resourceId}`);
    const resources = [...manifest.resources];
    resources[index] = { ...resource, status: "removed", reason: null, objectIdentity: null };
    manifest = writeManifest(loaded.path, { ...manifest, resources }, options.now);
    inject(`resource-recorded:${resource.resourceId}`);
  }

  const receipt = sanitizedCleanupReceipt(fields.sessionId, manifest.resources, "complete", options.now);
  const receiptPath = cleanupReceiptPath(repo, fields.sessionId);
  writeAtomic(receiptPath, canonicalJson(receipt));
  unlinkSync(loaded.path);
  fsyncDirectory(dirname(loaded.path));
  return { ok: true, receipt, receiptPath };
  } finally {
    releaseLock();
  }
}

export function classifyCanonicalWorktree(repo, record) {
  let physical;
  try { physical = realpathSync(record.path); } catch { fail("WT-WORKTREE-MISSING", "registered Git worktree path is missing"); }
  if (physical === repo.primaryRoot) return { lifecycle: "primary", canonical: true };
  if (!isInside(repo.primaryRoot, physical)) return { lifecycle: "external", canonical: false };
  if (record.branch) {
    const expected = canonicalBranchTarget(repo.primaryRoot, record.branch).target;
    return { lifecycle: "persistent-branch", canonical: physical === expected, expected };
  }
  const detachedRoot = resolve(repo.primaryRoot, "branch", "detached");
  const name = basename(physical);
  return {
    lifecycle: "detached-operational",
    canonical: isInside(detachedRoot, physical) && physical !== detachedRoot && /^[a-z0-9][a-z0-9-]{1,39}-[0-9a-f]{12}$/.test(name),
  };
}

export function checkSessionHygiene(startPath, fields, options = {}) {
  const repo = discoverRepository(startPath, options);
  const reasons = [];
  const status = runGit(repo.start, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout;
  if (String(status).length > 0) reasons.push("current-worktree-dirty");
  if (existsSync(cleanupManifestPath(repo, fields.sessionId))) reasons.push("session-manifest-not-drained");
  const records = readWorktreeRecords(repo);
  if (records.some(({ record }) => record.sessionId === fields.sessionId && record.status === "ready" && record.lifecycle === "detached-operational")) {
    reasons.push("owned-temporary-worktree-remains");
  }
  const canonical = repo.worktrees.map((record) => classifyCanonicalWorktree(repo, record));
  if (canonical.some((entry) => !entry.canonical)) reasons.push("noncanonical-worktree");
  const receipt = {
    schema: HYGIENE_RECEIPT_SCHEMA,
    sessionSha256: rawSha256(Buffer.from(fields.sessionId)),
    ok: reasons.length === 0,
    counts: {
      linkedWorktrees: canonical.length,
      noncanonicalWorktrees: canonical.filter((entry) => !entry.canonical).length,
      activeSessionManifests: existsSync(cleanupManifestPath(repo, fields.sessionId)) ? 1 : 0,
      ownedTemporaryResidue: records.filter(({ record }) => record.sessionId === fields.sessionId && record.status === "ready").length,
    },
    reasons,
    checkedAt: nowIso(options.now),
  };
  return receipt;
}

function assertCleanWorktree(path) {
  const dirty = runGit(path, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout;
  const ignored = runGit(path, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]).stdout;
  if (String(dirty).length > 0 || String(ignored).length > 0) fail("WT-WORKTREE-DIRTY", "source worktree is dirty, untracked or ignored");
}

export function migrateBranchWorktree(startPath, sourcePath, branchOrRef, options = {}) {
  const repo = discoverRepository(startPath, options);
  const source = assertExistingDirectoryPhysical(sourcePath, "migration source");
  if (source === repo.primaryRoot) fail("WT-MIGRATE-PRIMARY", "primary checkout cannot be migrated");
  const sourceCommon = realpathSync(gitText(source, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  if (sourceCommon !== repo.commonDir) fail("WT-COMMON-DIR-MISMATCH", "migration source belongs to a different repository");
  assertCleanWorktree(source);
  const mapping = canonicalBranchTarget(repo.primaryRoot, branchOrRef);
  if (existsSync(mapping.target)) fail("WT-TARGET-EXISTS", "canonical migration target already exists");
  const sourceRef = gitText(source, ["symbolic-ref", "-q", "HEAD"], { allowNonzero: true });
  if (sourceRef !== mapping.fullRef) fail("WT-REF-MISMATCH", "migration source has the wrong branch");
  const oid = resolveCommit(repo, mapping.fullRef, options);
  if (gitText(source, ["rev-parse", "HEAD"]) !== oid) fail("WT-OID-MISMATCH", "migration source does not match branch OID");
  makeParentsPhysical(repo.primaryRoot, dirname(mapping.target));
  ensurePrimaryBranchExclude(repo);
  const record = newWorktreeRecord(repo, {
    lifecycle: "persistent-branch",
    physicalPath: mapping.target,
    ref: mapping.fullRef,
    oid,
    sourcePath: source,
  }, options.now);
  publishWorktreeRecord(repo, { ...record, status: "migrating" });
  const inject = (step) => { if (options.faultInjector) options.faultInjector(step); };
  try {
    runGit(repo.primaryRoot, ["worktree", "add", "--detach", mapping.target, oid], options);
    inject("target-created");
    verifyReadyWorktree(repo, mapping.target, { oid, ref: null });
    inject("target-verified");
    assertCleanWorktree(source);
    runGit(repo.primaryRoot, ["worktree", "remove", source], options);
    inject("source-removed");
    runGit(mapping.target, ["switch", mapping.branch], options);
    inject("branch-attached");
    const verified = verifyReadyWorktree(repo, mapping.target, { oid, ref: mapping.fullRef });
    const ready = { ...record, revision: 1, status: "ready", sourcePath: null, identity: verified.identity, updatedAt: nowIso(options.now) };
    publishWorktreeRecord(repo, ready);
    return ready;
  } catch (error) {
    failWorktreeRecord(repo, { ...record, status: "migrating" }, error, options.now);
    throw error;
  }
}
