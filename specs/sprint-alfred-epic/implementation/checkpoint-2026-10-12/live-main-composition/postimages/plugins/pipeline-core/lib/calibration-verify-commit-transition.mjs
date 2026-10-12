// SPDX-License-Identifier: SUL-1.0
/**
 * Narrow private-State equivalent of the existing tracked-State verify delta.
 * Records bind observations, never native/code provenance. Admission reopens
 * real approval authority and the entire staged set; a marker cannot grant it.
 * State imports these declaration-only functions; no top-level observation is
 * permitted in this module, preserving the synchronous State writer protocol.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { observeCurrentPlanApprovalForCalibration, classifyVerifyCommand } from "../scripts/pipeline-state.mjs";
import { ensureHardenedPrivateDirectory } from "./hardened-private-directory.mjs";
import { assertPrivateRegularFile, writePrivateFileNoReplaceAtomic } from "./private-boundary.mjs";
import { parseStrictJson } from "./governance-event.mjs";
import { resolveTrustedSystemExecutable } from "./trusted-tool-resolution.mjs";

const PATHS = Object.freeze(["project/pipeline.json", ".claude/pipeline.json"]);
const SCHEMA = "pipeline.calibration-verify-commit-transition.v1";
const MAX_BYTES = 1_048_576;
const HELD = new WeakMap();
const HEX = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
const same = (a, b) => canonical(a) === canonical(b);
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && same(Object.keys(value).sort(), [...keys].sort());
const identity = (info) => [info.dev, info.ino, info.size, info.mode, info.nlink, info.mtimeMs, info.ctimeMs];
const owned = (info) => typeof process.getuid !== "function" || info.uid === process.getuid();

function chain(anchor, target) {
  const suffix = relative(anchor, target);
  if (isAbsolute(suffix) || suffix === ".." || suffix.startsWith(`..${sep}`)) fail("CVCT-PATH");
  let cursor = anchor;
  for (const part of ["", ...suffix.split(sep).filter(Boolean)]) {
    if (part) cursor = join(cursor, part);
    const info = lstatSync(cursor);
    if (!info.isDirectory() || info.isSymbolicLink() || !owned(info)) fail("CVCT-DIRECTORY");
  }
}

function readBounded(anchor, path, privateFile = false) {
  chain(anchor, dirname(path));
  const before = privateFile ? assertPrivateRegularFile(path) : lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || !owned(before)
    || before.size < 1 || before.size > MAX_BYTES) fail("CVCT-FILE");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!same(identity(before), identity(fstatSync(fd)))) fail("CVCT-CAS");
    const bytes = readFileSync(fd);
    const afterFd = fstatSync(fd);
    const after = privateFile ? assertPrivateRegularFile(path) : lstatSync(path);
    if (bytes.length !== before.size || !same(identity(before), identity(afterFd))
      || !same(identity(before), identity(after))) fail("CVCT-CAS");
    chain(anchor, dirname(path));
    return { bytes, sha256: sha(bytes), mode: before.mode & 0o777 };
  } finally { closeSync(fd); }
}

function repository(rootDir) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir)) fail("CVCT-ROOT");
  const root = resolve(rootDir);
  if (realpathSync(root) !== root || lstatSync(root).isSymbolicLink()) fail("CVCT-ROOT");
  const binary = resolveTrustedSystemExecutable("git");
  if (!binary.ok) fail("CVCT-GIT-UNAVAILABLE");
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" };
  for (const key of Object.keys(env)) {
    if (["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT"].includes(key)
      || /^GIT_CONFIG_(?:KEY|VALUE)_/u.test(key)) delete env[key];
  }
  // Preserve the actual Git hook index environment and inherited Node preload.
  // No PATH wrapper, host-global configuration or hidden auth operation occurs.
  const git = (args) => {
    const result = spawnSync(binary.path, args, { cwd: root, env, encoding: null, timeout: 15_000, maxBuffer: MAX_BYTES, windowsHide: true });
    if (result.error || result.signal || result.status !== 0 || !Buffer.isBuffer(result.stdout)) fail("CVCT-GIT-READ");
    return result.stdout;
  };
  if (realpathSync(git(["rev-parse", "--show-toplevel"]).toString("utf8").trim()) !== root) fail("CVCT-ROOT");
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]).toString("utf8").trim();
  if (!isAbsolute(common) || realpathSync(common) !== common || lstatSync(common).isSymbolicLink()) fail("CVCT-COMMON-DIR");
  const head = git(["rev-parse", "--verify", "HEAD"]).toString("ascii").trim();
  const tree = git(["rev-parse", "--verify", "HEAD^{tree}"]).toString("ascii").trim();
  if (!OID.test(head) || !OID.test(tree)) fail("CVCT-HEAD");
  return { root, common, head, tree, git, directory: join(common, "agent-pipeline", "calibration-verify-commit") };
}

function approval(repo) {
  const value = observeCurrentPlanApprovalForCalibration({ rootDir: repo.root });
  const keys = ["status", "rootDir", "statePath", "stateSha256", "stateRevision", "candidate", "submissionSha256", "approvalSha256", "authoritySha256", "approvalBasis", "sourceRefs"];
  if (!exactKeys(value, keys) || value.status !== "eligible" || value.rootDir !== repo.root
    || !HEX.test(value.stateSha256) || !HEX.test(value.submissionSha256) || !HEX.test(value.approvalSha256) || !HEX.test(value.authoritySha256)
    || !same(value.candidate, { commit: repo.head, tree: repo.tree })
    || !["signature", "chat-attributed-unattested"].includes(value.approvalBasis)
    || !(value.stateRevision === null || Number.isSafeInteger(value.stateRevision) && value.stateRevision >= 0)
    || !Array.isArray(value.sourceRefs) || value.sourceRefs.length < 1 || value.sourceRefs.length > 64
    || value.sourceRefs.some((ref) => !exactKeys(ref, ["path", "sha256", "size"]) || typeof ref.path !== "string" || ref.path.length > 1024 || !HEX.test(ref.sha256) || !Number.isSafeInteger(ref.size) || ref.size < 1 || ref.size > MAX_BYTES)) fail("CVCT-APPROVAL-UNAVAILABLE");
  return value;
}

function twinAt(repo, path, revision) {
  const bytes = repo.git(["show", `${revision}:${path}`]);
  const value = parseStrictJson(bytes);
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("CVCT-CALIBRATION");
  const entries = repo.git(revision === "HEAD" ? ["ls-tree", "-z", "HEAD", "--", path] : ["ls-files", "--stage", "-z", "--", path]).toString("utf8").split("\0").filter(Boolean);
  const match = entries.length === 1 && (revision === "HEAD" ? /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/u : /^(100644|100755) ([a-f0-9]+) 0\t(.+)$/u).exec(entries[0]);
  if (!match || match[3] !== path || !OID.test(match[2])) fail("CVCT-CALIBRATION");
  return { path, bytes, value, sha256: sha(bytes), gitMode: match[1], blob: match[2] };
}

// Select only actual committed and physically present tiers. An omitted legacy
// peer must be absent in HEAD, index and the physical layout on every recheck.
function committedCalibrationPaths(repo) {
  const paths = [];
  for (const path of PATHS) {
    const tracked = repo.git(["ls-tree", "-z", "HEAD", "--", path]).length !== 0;
    let present = false;
    let cursor = repo.root;
    const parts = path.split("/");
    for (let i = 0; i < parts.length; i++) {
      cursor = join(cursor, parts[i]);
      let info;
      try { info = lstatSync(cursor); }
      catch (error) { if (error.code === "ENOENT") break; throw error; }
      if (info.isSymbolicLink() || !owned(info)) fail("CVCT-CALIBRATION");
      if (i < parts.length - 1) {
        if (!info.isDirectory()) fail("CVCT-CALIBRATION");
      } else {
        if (!info.isFile() || info.nlink !== 1) fail("CVCT-CALIBRATION");
        present = true;
      }
    }
    if (tracked !== present || (!tracked && repo.git(["ls-files", "--stage", "-z", "--", path]).length !== 0)) fail("CVCT-CALIBRATION");
    if (tracked) paths.push(path);
  }
  if (paths[0] !== PATHS[0]) fail("CVCT-CALIBRATION");
  return paths;
}

export function inspectCommittedCalibrationVerifyLayout({ rootDir } = {}) {
  try {
    const repo = repository(rootDir);
    const paths = committedCalibrationPaths(repo);
    const entries = paths.map((path) => twinAt(repo, path, "HEAD"));
    if (entries.length === 2 && !same(entries[0].value, entries[1].value)) fail("CVCT-TWIN-CAS");
    for (const entry of entries) {
      const file = readBounded(repo.root, join(repo.root, entry.path));
      if (file.sha256 !== entry.sha256 || (file.mode & 0o111 ? "100755" : "100644") !== entry.gitMode) fail("CVCT-TWIN-CAS");
    }
    const finalRepo = repository(repo.root);
    if (finalRepo.head !== repo.head || finalRepo.tree !== repo.tree || !same(committedCalibrationPaths(finalRepo), paths)) fail("CVCT-CAS");
    const status = classifyVerifyCommand(entries[0].value.verify);
    return status === "configured" ? { status, command: entries[0].value.verify, paths } : { status, paths };
  } catch (error) { return { status: "unavailable", code: unavailable(error).code }; }
}

function transition(repo, currentApproval, command) {
  if (classifyVerifyCommand(command) !== "configured" || typeof command !== "string" || Buffer.byteLength(command) > 32_768 || /[\r\n\0]/u.test(command)) fail("CVCT-COMMAND");
  const before = committedCalibrationPaths(repo).map((path) => twinAt(repo, path, "HEAD"));
  if ((before.length === 2 && !same(before[0].value, before[1].value)) || before.some((entry) => classifyVerifyCommand(entry.value.verify) !== "baseline-only")) fail("CVCT-BASELINE");
  const entries = before.map((entry) => {
    const after = Buffer.from(`${JSON.stringify({ ...entry.value, verify: command }, null, 2)}\n`, "utf8");
    return { path: entry.path, beforeSha256: entry.sha256, beforeBlob: entry.blob, gitMode: entry.gitMode, afterSha256: sha(after), afterSize: after.length };
  });
  const facts = { rootDir: repo.root, commonDir: repo.common, head: repo.head, tree: repo.tree, approval: currentApproval, verifyCommand: command, entries };
  return { ...facts, id: sha(canonical(facts)) };
}

const recordPath = (repo, id, phase) => join(repo.directory, `${id}.${phase}.json`);
function currentFiles(repo, facts, after) {
  for (const entry of facts.entries) {
    const file = readBounded(repo.root, join(repo.root, entry.path));
    if (file.sha256 !== (after ? entry.afterSha256 : entry.beforeSha256)
      || (file.mode & 0o111 ? "100755" : "100644") !== entry.gitMode) fail("CVCT-TWIN-CAS");
  }
}
function readRecord(repo, path) {
  const raw = readBounded(repo.common, path, true).bytes;
  const value = parseStrictJson(raw);
  if (!exactKeys(value, ["schema", "phase", "facts"]) || value.schema !== SCHEMA || !["prepared", "ready"].includes(value.phase)
    || Buffer.from(`${JSON.stringify(value, null, 2)}\n`).compare(raw) !== 0) fail("CVCT-RECORD");
  return value;
}
function publish(repo, facts, phase) {
  const path = recordPath(repo, facts.id, phase);
  const bytes = Buffer.from(`${JSON.stringify({ schema: SCHEMA, phase, facts }, null, 2)}\n`);
  if (bytes.length > MAX_BYTES) fail("CVCT-RECORD-BOUNDS");
  const published = writePrivateFileNoReplaceAtomic(path, bytes);
  if (!published.created || !same(readRecord(repo, path), { schema: SCHEMA, phase, facts })) fail("CVCT-RECORD-CONFLICT");
}
const unavailable = (error) => ({ ok: false, code: typeof error?.code === "string" && /^[A-Z][A-Z0-9-]{1,63}$/u.test(error.code) ? error.code : "CVCT-UNAVAILABLE" });

export function prepareCalibrationVerifyCommitTransition({ rootDir, verifyCommand } = {}) {
  let held = null;
  try {
    const repo = repository(rootDir);
    const facts = transition(repo, approval(repo), verifyCommand);
    currentFiles(repo, facts, false);
    ensureHardenedPrivateDirectory(repo.common, repo.directory);
    const lockPath = join(repo.directory, "transition.lock");
    const fd = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    held = { repo, facts, fd, lockPath, lockIdentity: null };
    writeFileSync(fd, `${facts.id}\n`); fsyncSync(fd);
    held.lockIdentity = identity(assertPrivateRegularFile(lockPath));
    if (!same(identity(fstatSync(fd)), held.lockIdentity)) fail("CVCT-LOCK");
    if (!same(approval(repository(rootDir)), facts.approval)) fail("CVCT-APPROVAL-CAS");
    currentFiles(repo, facts, false);
    publish(repo, facts, "prepared");
    const preparedHandle = Object.freeze({});
    HELD.set(preparedHandle, held);
    return { ok: true, preparedHandle, paths: facts.entries.map((entry) => entry.path) };
  } catch (error) {
    // Preserve any exclusive lock/journal after interruption. Never reclaim a
    // stale preparation automatically or pretend it has no effects.
    if (held) { try { closeSync(held.fd); } catch { /* preserve original typed failure */ } }
    return unavailable(error);
  }
}

export function completeCalibrationVerifyCommitTransition({ preparedHandle } = {}) {
  const held = preparedHandle && HELD.get(preparedHandle);
  if (!held) return { ok: false, code: "CVCT-HANDLE" };
  HELD.delete(preparedHandle);
  try {
    const repo = repository(held.repo.root);
    const facts = transition(repo, approval(repo), held.facts.verifyCommand);
    if (!same(facts, held.facts) || !same(identity(fstatSync(held.fd)), held.lockIdentity)
      || !same(identity(assertPrivateRegularFile(held.lockPath)), held.lockIdentity)) fail("CVCT-CAS");
    if (!same(readRecord(repo, recordPath(repo, facts.id, "prepared")), { schema: SCHEMA, phase: "prepared", facts })) fail("CVCT-RECORD");
    currentFiles(repo, facts, true);
    publish(repo, facts, "ready");
    if (!same(approval(repository(repo.root)), facts.approval)) fail("CVCT-APPROVAL-CAS");
    currentFiles(repo, facts, true);
    closeSync(held.fd); held.fd = null;
    if (!same(identity(assertPrivateRegularFile(held.lockPath)), held.lockIdentity)) fail("CVCT-LOCK");
    unlinkSync(held.lockPath);
    return { ok: true, code: "CVCT-COMMIT-READY", paths: facts.entries.map((entry) => entry.path) };
  } catch (error) {
    if (held.fd !== null) { try { closeSync(held.fd); } catch { /* preserve original typed failure */ } }
    return unavailable(error);
  }
}

export function inspectCalibrationVerifyCommitTransition({ rootDir, stagedPaths } = {}) {
  try {
    const repo = repository(rootDir);
    const actual = repo.git(["diff", "--cached", "--name-only", "-z", "HEAD"]).toString("utf8").split("\0").filter(Boolean);
    const paths = committedCalibrationPaths(repo);
    if (!same([...actual].sort(), [...paths].sort()) || !Array.isArray(stagedPaths)
      || !same([...stagedPaths].sort(), [...actual].sort())) fail("CVCT-STAGED-SET");
    const after = paths.map((path) => twinAt(repo, path, ""));
    if (after.length === 2 && !same(after[0].value, after[1].value)) fail("CVCT-TWIN-CAS");
    const facts = transition(repo, approval(repo), after[0].value.verify);
    for (const entry of facts.entries) {
      const staged = after.find((value) => value.path === entry.path);
      if (staged.sha256 !== entry.afterSha256 || staged.gitMode !== entry.gitMode) fail("CVCT-STAGED-CAS");
    }
    chain(repo.common, repo.directory);
    if (existsSync(join(repo.directory, "transition.lock"))) fail("CVCT-INCOMPLETE");
    if (!same(readRecord(repo, recordPath(repo, facts.id, "ready")), { schema: SCHEMA, phase: "ready", facts })) fail("CVCT-RECORD");
    currentFiles(repo, facts, true);
    const finalRepo = repository(repo.root);
    if (!same(transition(finalRepo, approval(finalRepo), facts.verifyCommand), facts)
      || !same(finalRepo.git(["diff", "--cached", "--name-only", "-z", "HEAD"]).toString("utf8").split("\0").filter(Boolean), actual)) fail("CVCT-CAS");
    for (const entry of facts.entries) {
      const staged = twinAt(finalRepo, entry.path, "");
      if (staged.sha256 !== entry.afterSha256 || staged.gitMode !== entry.gitMode) fail("CVCT-STAGED-CAS");
    }
    return { ok: true, code: "CVCT-COMMIT-READY", paths: facts.entries.map((entry) => entry.path) };
  } catch (error) { return unavailable(error); }
}
