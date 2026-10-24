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
import { observeCurrentPlanApprovalForCalibration, classifyVerifyCommand, inspectValidatedCalibrationSourceWitness, retireDeadCalibrationContinuityLock } from "../scripts/pipeline-state.mjs";
import { isActiveSourceOwnedSessionAuthorityBoundary } from "./session-authority-registry.mjs";
import { ensureHardenedPrivateDirectory } from "./hardened-private-directory.mjs";
import { assertPrivateRegularFile, writePrivateFileNoReplaceAtomic } from "./private-boundary.mjs";
import { parseStrictJson } from "./governance-event.mjs";
import { resolveTrustedSystemExecutable } from "./trusted-tool-resolution.mjs";
import { GIT_NULL_DEVICE } from "./git-null-device.mjs";

const PATHS = Object.freeze(["project/pipeline.json", ".claude/pipeline.json"]);
const SCHEMA = "pipeline.calibration-verify-commit-transition.v1";
const MAX_BYTES = 1_048_576;
const HELD = new WeakMap();
const HEX = /^[a-f0-9]{64}$/u;
const CODE = /^[A-Z][A-Z0-9-]{1,63}$/u;
const OID =/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const fail = (code, windowsAuthorityCause = null) => { const error = new Error(code); error.code = code;
  if (windowsAuthorityCause) error.windowsAuthorityCause = windowsAuthorityCause; throw error; };
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
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE };
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
  // `--path-format=absolute` prints a forward-slash path on win32 (`D:/x/.git`) while realpathSync returns the
  // native spelling (`D:\x\.git`), so the identity check compares against the native-normalized form.
  if (!isAbsolute(common) || realpathSync(common) !== resolve(common) || lstatSync(common).isSymbolicLink()) fail("CVCT-COMMON-DIR");
  const head = git(["rev-parse", "--verify", "HEAD"]).toString("ascii").trim();
  const tree = git(["rev-parse", "--verify", "HEAD^{tree}"]).toString("ascii").trim();
  if (!OID.test(head) || !OID.test(tree)) fail("CVCT-HEAD");
  return { root, common, head, tree, git, directory: join(common, "agent-pipeline", "calibration-verify-commit") };
}

function approval(repo, phaseEntry = false) {
  const value = observeCurrentPlanApprovalForCalibration({ rootDir: repo.root, phaseEntry });
  if (value && value.status === "unavailable" && typeof value.code === "string" && CODE.test(value.code))
    fail(value.code, /^WIN-AUTH-[A-Z-]{1,64}$/u.test(value.windowsAuthorityCause ?? "") ? value.windowsAuthorityCause : null);
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

// Select only actual committed and physically present tiers. An omitted peer
// must be absent in HEAD, index and the physical layout on every recheck.
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
  if (paths.length === 0) fail("CVCT-CALIBRATION");
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

/** A fresh command may normalize only exact committed-baseline or its own
 * computed verify-field delta. This observation never reads a journal. */
export function inspectReplayableCalibrationVerifyLayout({ rootDir, verifyCommand, phaseEntry = false } = {}) {
  try {
    const repo = repository(rootDir);
    const committed = committedCalibrationPaths(repo).map(path => twinAt(repo,path,"HEAD"));
    if (committed.length === 2 && !same(committed[0].value,committed[1].value)) fail("CVCT-TWIN-CAS");
    if (classifyVerifyCommand(committed[0].value.verify) === "configured") {
      if (committed[0].value.verify !== verifyCommand) fail("CVCT-COMMAND");
      currentFiles(repo,{entries:committed.map(entry=>({...entry,beforeSha256:entry.sha256}))},false);
      return {status:"committed-configured",paths:committed.map(entry=>entry.path)};
    }
    const facts = transition(repo,approval(repo,phaseEntry),verifyCommand);
    let currentCount=0;
    for (const entry of facts.entries) {
      const file=readBounded(repo.root,join(repo.root,entry.path));
      if ((file.mode & 0o111 ? "100755" : "100644") !== entry.gitMode
        || ![entry.beforeSha256,entry.afterSha256].includes(file.sha256)) fail("CVCT-TWIN-CAS");
      if (file.sha256===entry.afterSha256) currentCount++;
    }
    const finalRepo=repository(repo.root);
    if (finalRepo.head!==repo.head || finalRepo.tree!==repo.tree
      || !same(approval(finalRepo,phaseEntry),facts.approval)) fail("CVCT-CAS");
    return {status:currentCount===0?"baseline-only":currentCount===facts.entries.length?"configured-current":"partial-current",
      paths:facts.entries.map(entry=>entry.path)};
  } catch(error) { return {status:"unavailable",code:unavailable(error).code}; }
}

function transition(repo, currentApproval, command, statePostSha256 = null) {
  if (classifyVerifyCommand(command) !== "configured" || typeof command !== "string" || Buffer.byteLength(command) > 32_768 || /[\r\n\0]/u.test(command)) fail("CVCT-COMMAND");
  const before = committedCalibrationPaths(repo).map((path) => twinAt(repo, path, "HEAD"));
  if ((before.length === 2 && !same(before[0].value, before[1].value)) || before.some((entry) => classifyVerifyCommand(entry.value.verify) !== "baseline-only")) fail("CVCT-BASELINE");
  const entries = before.map((entry) => {
    const after = Buffer.from(`${JSON.stringify({ ...entry.value, verify: command }, null, 2)}\n`, "utf8");
    return { path: entry.path, beforeSha256: entry.sha256, beforeBlob: entry.blob, gitMode: entry.gitMode, afterSha256: sha(after), afterSize: after.length };
  });
  if (statePostSha256 !== null && !HEX.test(statePostSha256)) fail("CVCT-STATE-POSTIMAGE");
  // The original non-phase record never carried this field. Its canonical ID
  // remains byte-for-byte compatible with records already published by hooks.
  const facts = { rootDir: repo.root, commonDir: repo.common, head: repo.head, tree: repo.tree, approval: currentApproval, verifyCommand: command,
    ...(statePostSha256 === null ? {} : { statePostSha256 }), entries };
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
function replayableFiles(repo,facts) {
  for(const entry of facts.entries) {
    const file=readBounded(repo.root,join(repo.root,entry.path));
    if ((file.mode & 0o111 ? "100755" : "100644") !== entry.gitMode
      || ![entry.beforeSha256,entry.afterSha256].includes(file.sha256)) fail("CVCT-TWIN-CAS");
  }
}
function retireDeadTransitionLock(repo,sourceBoundary) {
  if (!isActiveSourceOwnedSessionAuthorityBoundary({boundary:sourceBoundary,rootDir:repo.root})) fail("CVCT-SOURCE-WRITER");
  const path=join(repo.directory,"transition.lock");
  if (!existsSync(path)) return;
  const before=lstatSync(path),file=readBounded(repo.common,path,true);
  const match=/^([a-f0-9]{64})\n([1-9][0-9]*)\n$/u.exec(file.bytes.toString("ascii"));
  if (!match || !Number.isSafeInteger(Number(match[2]))) fail("CVCT-LOCK");
  try { process.kill(Number(match[2]),0); fail("CVCT-LIVE-OWNER"); }
  catch(error) { if(error.code!=="ESRCH") throw error; }
  if(!same(identity(before),identity(lstatSync(path)))
    || readBounded(repo.common,path,true).sha256!==file.sha256) fail("CVCT-LOCK");
  unlinkSync(path);
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
  if (!same(readRecord(repo, path), { schema: SCHEMA, phase, facts })) fail("CVCT-RECORD-CONFLICT");
}
const unavailable = (error) => ({ ok: false, code: typeof error?.code === "string" && CODE.test(error.code) ? error.code : "CVCT-UNAVAILABLE",
  ...(/^WIN-AUTH-[A-Z-]{1,64}$/u.test(error?.windowsAuthorityCause ?? "") ? {windowsAuthorityCause:error.windowsAuthorityCause} : {}) });

function sameApprovalAcrossPhase(before, after) {
  if (before.statePath !== after.statePath || before.stateSha256 === after.stateSha256
    || !same(before.candidate, after.candidate)
    || before.submissionSha256 !== after.submissionSha256
    || before.approvalSha256 !== after.approvalSha256
    || before.authoritySha256 !== after.authoritySha256
    || before.approvalBasis !== after.approvalBasis
    || before.stateRevision !== after.stateRevision) return false;
  const withoutState = value => value.sourceRefs.filter(ref => ref.path !== value.statePath);
  return same(withoutState(before), withoutState(after));
}

export function prepareCalibrationVerifyCommitTransition({ rootDir, verifyCommand, phaseEntry = false, sourceWitness = null, sourceBoundary = null } = {}) {
  let held = null;
  try {
    const repo = repository(rootDir);
    if (typeof phaseEntry !== "boolean") fail("CVCT-PHASE-ENTRY");
    const source = phaseEntry ? inspectValidatedCalibrationSourceWitness(sourceWitness) : null;
    if (phaseEntry ? !source || source.rootDir !== repo.root || !HEX.test(source.statePostSha256)
      || !HEX.test(source.statePreSha256) : sourceWitness !== null) fail("CVCT-SOURCE-WRITER");
    const currentApproval = approval(repo, phaseEntry);
    if (source && source.statePreSha256 !== currentApproval.stateSha256) fail("CVCT-SOURCE-WRITER");
    const facts = transition(repo, currentApproval, verifyCommand, source?.statePostSha256 ?? null);
    replayableFiles(repo, facts);
    ensureHardenedPrivateDirectory(repo.common, repo.directory);
    const boundary=source?.sourceBoundary ?? sourceBoundary;
    retireDeadTransitionLock(repo,boundary);
    const lockPath = join(repo.directory, "transition.lock");
    const fd = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    held = { repo, facts, phaseEntry, fd, lockPath, lockIdentity: null };
    writeFileSync(fd, `${facts.id}\n${process.pid}\n`); fsyncSync(fd);
    held.lockIdentity = identity(assertPrivateRegularFile(lockPath));
    if (!same(identity(fstatSync(fd)), held.lockIdentity)) fail("CVCT-LOCK");
    if (!same(approval(repository(rootDir), phaseEntry), facts.approval)) fail("CVCT-APPROVAL-CAS");
    replayableFiles(repo, facts);
    publish(repo, facts, "prepared");
    const preparedHandle = Object.freeze({});
    HELD.set(preparedHandle, held);
    return { ok: true, preparedHandle, paths: facts.entries.map((entry) => entry.path),
      entries:facts.entries.map(entry=>({path:entry.path,beforeSha256:entry.beforeSha256,afterSha256:entry.afterSha256})) };
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
    const facts = transition(repo, approval(repo), held.facts.verifyCommand, held.facts.statePostSha256);
    const continuous = held.phaseEntry
      ? sameApprovalAcrossPhase(held.facts.approval, facts.approval)
        && same({ ...held.facts, id: null, approval: null }, { ...facts, id: null, approval: null })
      : same(facts, held.facts);
    if (!continuous || (held.phaseEntry && facts.approval.stateSha256 !== held.facts.statePostSha256)
      || !same(identity(fstatSync(held.fd)), held.lockIdentity)
      || !same(identity(assertPrivateRegularFile(held.lockPath)), held.lockIdentity)) fail("CVCT-CAS");
    if (!same(readRecord(repo, recordPath(repo, held.facts.id, "prepared")), { schema: SCHEMA, phase: "prepared", facts: held.facts })) fail("CVCT-RECORD");
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

/** Release only this process's exact preparation after a refused companion write.
 * The prepared journal stays as an audit preimage. An exact later preparation
 * may reuse it, but only after the committed calibration preimage is restored. */
export function abandonCalibrationVerifyCommitTransition({ preparedHandle } = {}) {
  const held = preparedHandle && HELD.get(preparedHandle);
  if (!held) return { ok: false, code: "CVCT-HANDLE" };
  HELD.delete(preparedHandle);
  try {
    const repo = repository(held.repo.root);
    if (repo.head !== held.repo.head || repo.tree !== held.repo.tree
      || !same(identity(fstatSync(held.fd)), held.lockIdentity)
      || !same(identity(assertPrivateRegularFile(held.lockPath)), held.lockIdentity)
      || !same(readRecord(repo, recordPath(repo, held.facts.id, "prepared")), { schema: SCHEMA, phase: "prepared", facts: held.facts })
      || !same(approval(repo, held.phaseEntry), held.facts.approval)) fail("CVCT-CAS");
    closeSync(held.fd); held.fd = null;
    if (!same(identity(assertPrivateRegularFile(held.lockPath)), held.lockIdentity)) fail("CVCT-LOCK");
    unlinkSync(held.lockPath);
    return { ok: true, code: "CVCT-ABANDONED" };
  } catch (error) {
    if (held.fd !== null) { try { closeSync(held.fd); } catch { /* retain the typed failure */ } }
    return unavailable(error);
  }
}

/** The State writer proved its replacement did not commit. Undo only the exact
 * configured companion image held by this same process. */
export function rollbackCalibrationVerifyCommitTransition({ preparedHandle } = {}) {
  const held = preparedHandle && HELD.get(preparedHandle);
  if (!held) return { ok: false, code: "CVCT-HANDLE" };
  try {
    const repo = repository(held.repo.root);
    if (!same(approval(repo, held.phaseEntry), held.facts.approval)
      || !same(identity(fstatSync(held.fd)), held.lockIdentity)
      || !same(identity(assertPrivateRegularFile(held.lockPath)), held.lockIdentity)) fail("CVCT-CAS");
    currentFiles(repo, held.facts, true);
    for (const entry of held.facts.entries) {
      const original = twinAt(repo, entry.path, "HEAD");
      if (original.sha256 !== entry.beforeSha256) fail("CVCT-CAS");
      writeFileSync(join(repo.root, entry.path), original.bytes);
    }
    currentFiles(repo, held.facts, false);
    return abandonCalibrationVerifyCommitTransition({ preparedHandle });
  } catch (error) { return unavailable(error); }
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
    const approved = approval(repo);
    const candidates = [
      transition(repo, approved, after[0].value.verify),
      transition(repo, approved, after[0].value.verify, approved.stateSha256),
    ];
    const facts = candidates.find(value => existsSync(recordPath(repo, value.id, "ready")));
    if (!facts) fail("CVCT-RECORD");
    for (const entry of facts.entries) {
      const staged = after.find((value) => value.path === entry.path);
      if (staged.sha256 !== entry.afterSha256 || staged.gitMode !== entry.gitMode) fail("CVCT-STAGED-CAS");
    }
    chain(repo.common, repo.directory);
    if (existsSync(join(repo.directory, "transition.lock"))) fail("CVCT-INCOMPLETE");
    if (!same(readRecord(repo, recordPath(repo, facts.id, "ready")), { schema: SCHEMA, phase: "ready", facts })) fail("CVCT-RECORD");
    currentFiles(repo, facts, true);
    const finalRepo = repository(repo.root);
    if (!same(transition(finalRepo, approval(finalRepo), facts.verifyCommand, facts.statePostSha256), facts)
      || !same(finalRepo.git(["diff", "--cached", "--name-only", "-z", "HEAD"]).toString("utf8").split("\0").filter(Boolean), actual)) fail("CVCT-CAS");
    for (const entry of facts.entries) {
      const staged = twinAt(finalRepo, entry.path, "");
      if (staged.sha256 !== entry.afterSha256 || staged.gitMode !== entry.gitMode) fail("CVCT-STAGED-CAS");
    }
    return { ok: true, code: "CVCT-COMMIT-READY", paths: facts.entries.map((entry) => entry.path) };
  } catch (error) { return unavailable(error); }
}

/** Existing ready records remain valid after restart; this reads their exact
 * current approval and calibration bytes without granting journal authority. */
export function inspectCurrentCalibrationVerifyReady({rootDir,verifyCommand}={}) {
  try {
    const repo=repository(rootDir),currentApproval=approval(repo);
    const candidates=[transition(repo,currentApproval,verifyCommand),
      transition(repo,currentApproval,verifyCommand,currentApproval.stateSha256)];
    const facts=candidates.find(value=>existsSync(recordPath(repo,value.id,"ready")));
    if(!facts || existsSync(join(repo.directory,"transition.lock"))) fail("CVCT-RECORD");
    if(!same(readRecord(repo,recordPath(repo,facts.id,"ready")),{schema:SCHEMA,phase:"ready",facts})) fail("CVCT-RECORD");
    currentFiles(repo,facts,true);
    if(!same(approval(repository(repo.root)),currentApproval)) fail("CVCT-APPROVAL-CAS");
    return {ok:true,code:"CVCT-COMMIT-READY",paths:facts.entries.map(entry=>entry.path)};
  } catch(error) {return unavailable(error);}
}

/** One-line repair per unmet configure-verify condition (AC-140, never-fully-blocking). */
export function configureVerifyRepair(code) {
  if (code === "CVCT-AUTHORITY-STALE") return "restore the approved PRD/Spec bytes, or run reopen-design and approve the plan again";
  if (code === "CVCT-PROFILE-STALE") return "restore the approved PO profile, or submit and approve the plan again";
  if (code === "CVCT-FILE") return "make the State file a private regular file of its owner (mode 0600 on POSIX, owner-only ACL on Windows), then retry";
  if (code === "CVCT-SOURCE-MISSING" || code === "CVCT-PATH") return "restore the approved source file the approval names (or run reopen-design and approve again), then retry";
  if (code === "CVCT-CAS" || code === "CVCT-APPROVAL-CAS") return "a source changed during the check; retry once no other write is running";
  if (code === "CVCT-HEAD-UNAVAILABLE" || code === "CVCT-HEAD") return "check out a valid committed HEAD, then retry";
  if (code === "CVCT-MODE-UNAVAILABLE") return "set the human approval mode (gates.push_approval: signature or chat) in pipeline.user.yaml, then retry";
  if (String(code).startsWith("DAB-") || code === "CVCT-DESIGN-REQUEST-UNAVAILABLE" || code === "CVCT-DESIGN-APPROVAL-MISMATCH") return "the design approval no longer matches its request; present and approve the current design again";
  return "run `pipeline-state.mjs inspect` and follow its nextAction, then retry";
}
