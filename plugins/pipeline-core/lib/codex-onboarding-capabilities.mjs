// SPDX-License-Identifier: SUL-1.0

/**
 * Fail-closed repository, session-cleanup and worktree capability observation
 * for the Codex onboarding lifecycle.
 *
 * Every write used here is a bounded disposable probe. The root/control probes
 * atomically create, fsync, rename and unlink one random regular file. Stronger
 * intents exercise the production session-descriptor and Git-worktree
 * mechanisms, then remove their exact descriptor/worktree, newly-created empty
 * parents and Git administration entry before returning.
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
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
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  hasCodexGitControlMount,
  hasCodexHostControlLayout,
  hasCodexInitializedGitControlMount,
  readCodexHostRepositoryInitReceipt,
} from "./codex-host-layout.mjs";
import {
  discoverRepository,
  loadSessionDescriptor,
  retireSessionDescriptor,
  runGit,
  startSessionDescriptor,
} from "./worktree-lifecycle.mjs";

const INTENTS = new Set(["onboarding", "bootstrap", "session", "dispatch"]);
const MODES = new Set(["auto", "local", "host-managed"]);
const GIT_VERSION = /^git version (\d+)\.(\d+)(?:\.(\d+))?((?:[.-][0-9A-Za-z]+)*)/u;

function isInside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function defaultCapabilities(intent) {
  const weak = intent === "onboarding" || intent === "bootstrap";
  return {
    status: "unavailable",
    mode: "unknown",
    gitVersion: null,
    initializesGit: false,
    rootWritable: "not-observed",
    sessionCapability: weak ? "not-required" : "not-observed",
    worktreeCapability: intent === "dispatch" ? "not-observed" : "not-required",
  };
}

function physicalRoot(rootDir) {
  if (typeof rootDir !== "string" || rootDir.length === 0) throw new Error("project root is unavailable");
  const root = resolve(rootDir);
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(root) !== root) {
    throw new Error("project root is not a physical directory");
  }
  return root;
}

function physicalDirectory(path, label) {
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== resolve(path)) {
    throw new Error(`${label} is not a physical directory`);
  }
  return resolve(path);
}

function fsyncDirectory(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    fsyncSync(fd);
  } catch (error) {
    if (!(process.platform === "win32"
      && ["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP"].includes(error?.code))) {
      throw error;
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function cleanupProbeFile(path, expectedIdentity) {
  if (!existsSync(path)) return;
  const info = lstatSync(path);
  if (!expectedIdentity || !sameIdentity(expectedIdentity, path)
    || !info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    throw new Error("disposable capability path changed identity");
  }
  unlinkSync(path);
}

function disposableWriteProbe(directory, label, faultInjector) {
  const parent = physicalDirectory(directory, `${label} directory`);
  const suffix = randomBytes(18).toString("hex");
  const source = join(parent, `.pipeline-capability-${suffix}.tmp`);
  const target = join(parent, `.pipeline-capability-${suffix}.renamed`);
  let fd;
  let probeIdentity = null;
  let primaryError = null;
  try {
    fd = openSync(source,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600);
    const opened = fstatSync(fd);
    probeIdentity = { dev: String(opened.dev), ino: String(opened.ino), mode: opened.mode };
    writeFileSync(fd, Buffer.from("capability-probe", "utf8"));
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(source, target);
    fsyncDirectory(parent);
    faultInjector?.(`${label}-probe-renamed`);
  } catch (error) {
    primaryError = error;
  }
  let cleanupError = null;
  try {
    if (fd !== undefined) closeSync(fd);
    cleanupProbeFile(source, probeIdentity);
    cleanupProbeFile(target, probeIdentity);
    fsyncDirectory(parent);
  } catch (error) {
    cleanupError = error;
  }
  if (cleanupError) throw cleanupError;
  if (primaryError) throw primaryError;
}

function gitVersion(spawn) {
  const observed = spawn("git", ["--version"], {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (observed?.error || observed?.status !== 0 || typeof observed?.stdout !== "string") return null;
  const match = observed.stdout.trim().match(GIT_VERSION);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major < 2 || (major === 2 && minor < 28)) return null;
  return `${match[1]}.${match[2]}.${match[3] ?? "0"}${match[4] ?? ""}`;
}

function gitEntryType(root) {
  const path = join(root, ".git");
  if (!existsSync(path)) return "absent";
  const info = lstatSync(path);
  if (info.isSymbolicLink()) return "invalid";
  if (info.isDirectory()) return "directory";
  if (info.isFile() && info.nlink === 1) {
    let raw;
    try { raw = readFileSync(path, "utf8"); } catch { return "invalid"; }
    return /^gitdir: [^\r\n\0]+\r?\n?$/u.test(raw) ? "file" : "invalid";
  }
  return "invalid";
}

function samePhysicalPath(left, right) {
  try { return realpathSync(left) === realpathSync(right); } catch { return false; }
}

function validateLocalRepository(root, gitType, spawn) {
  const repository = discoverRepository(root, { spawn });
  const registered = repository.worktrees.some((entry) => samePhysicalPath(entry.path, root));
  if (!registered) throw new Error("repository root is not a registered Git worktree");

  if (gitType === "directory") {
    if (repository.primaryRoot !== root || realpathSync(join(root, ".git")) !== repository.commonDir) {
      throw new Error("primary Git control directory escaped the project root");
    }
  } else {
    const pointer = readFileSync(join(root, ".git"), "utf8").trimEnd().slice("gitdir: ".length);
    const pointerPath = isAbsolute(pointer) ? resolve(pointer) : resolve(root, pointer);
    const admin = realpathSync(pointerPath);
    const worktrees = join(repository.commonDir, "worktrees");
    if (!isInside(worktrees, admin) || admin === worktrees || dirname(admin) !== worktrees) {
      throw new Error("linked-worktree Git control path escaped the common directory");
    }
    physicalDirectory(admin, "linked-worktree Git control directory");
  }
  physicalDirectory(repository.commonDir, "Git common directory");
  return repository;
}

function removeNewEmptyDirectories(paths, existed) {
  let failure = null;
  for (let index = paths.length - 1; index >= 0; index--) {
    const path = paths[index];
    if (existed[index] || !existsSync(path)) continue;
    try {
      physicalDirectory(path, "disposable capability directory");
      rmdirSync(path);
      fsyncDirectory(dirname(path));
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
}

function sessionProbe(root, repository, spawn, faultInjector) {
  const directories = [
    join(repository.commonDir, "agent-pipeline"),
    join(repository.commonDir, "agent-pipeline", "session-descriptors"),
    join(repository.commonDir, "agent-pipeline", "session-descriptors", "active"),
  ];
  const existed = directories.map(existsSync);
  const sessionId = `capability-${randomBytes(12).toString("hex")}`;
  const ownerNonce = randomBytes(32).toString("base64url");
  const descriptorPath = join(directories.at(-1), `${sessionId}.json`);
  let started = null;
  let primaryError = null;
  try {
    started = startSessionDescriptor(root, { sessionId, ownerNonce, spawn });
    faultInjector?.("session-probe-created");
    retireSessionDescriptor(root, started, { spawn });
    started = null;
  } catch (error) {
    primaryError = error;
  }
  let cleanupError = null;
  try {
    if (existsSync(descriptorPath)) {
      const loaded = loadSessionDescriptor(root, sessionId, { spawn });
      if (loaded.ownerNonce !== ownerNonce) throw new Error("disposable session descriptor changed owner");
      retireSessionDescriptor(root, loaded, { spawn });
    }
    removeNewEmptyDirectories(directories, existed);
  } catch (error) {
    cleanupError = error;
  }
  if (cleanupError) throw cleanupError;
  if (existsSync(descriptorPath)) throw new Error("disposable session descriptor leaked");
  if (primaryError) throw primaryError;
}

function gitSnapshot(root, spawn) {
  return {
    refs: String(runGit(root, ["for-each-ref", "--format=%(refname)%00%(objectname)"], { spawn }).stdout),
    worktrees: String(runGit(root, ["worktree", "list", "--porcelain", "-z"], { spawn }).stdout),
  };
}

function identity(path) {
  const info = lstatSync(path);
  return { dev: String(info.dev), ino: String(info.ino), mode: info.mode };
}

function sameIdentity(left, path) {
  try {
    const right = identity(path);
    return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
  } catch {
    return false;
  }
}

function worktreeAdminFromTarget(target, repository) {
  const marker = join(target, ".git");
  const info = lstatSync(marker);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    throw new Error("disposable worktree marker is invalid");
  }
  const raw = readFileSync(marker, "utf8");
  const match = raw.match(/^gitdir: ([^\r\n\0]+)\r?\n?$/u);
  if (!match) throw new Error("disposable worktree marker is malformed");
  const candidate = isAbsolute(match[1]) ? resolve(match[1]) : resolve(target, match[1]);
  const admin = realpathSync(candidate);
  const worktrees = join(repository.commonDir, "worktrees");
  if (!isInside(worktrees, admin) || admin === worktrees || dirname(admin) !== worktrees) {
    throw new Error("disposable worktree administration escaped the Git common directory");
  }
  physicalDirectory(admin, "disposable worktree administration");
  return { path: admin, identity: identity(admin) };
}

function removeExactProbeWorktree(target, targetIdentity, admin) {
  if (existsSync(target)) {
    if (!sameIdentity(targetIdentity, target)
      || lstatSync(target).isSymbolicLink()
      || !lstatSync(target).isDirectory()
      || realpathSync(target) !== target) {
      throw new Error("disposable worktree changed identity before rollback");
    }
    rmSync(target, { recursive: true, force: false });
  }
  if (admin && existsSync(admin.path)) {
    if (!sameIdentity(admin.identity, admin.path)
      || lstatSync(admin.path).isSymbolicLink()
      || !lstatSync(admin.path).isDirectory()
      || realpathSync(admin.path) !== admin.path) {
      throw new Error("disposable worktree administration changed identity before rollback");
    }
    rmSync(admin.path, { recursive: true, force: false });
    fsyncDirectory(dirname(admin.path));
  }
}

function worktreeProbe(root, repository, spawn, faultInjector) {
  const branch = join(repository.primaryRoot, "branch");
  const detached = join(branch, "detached");
  const commonWorktrees = join(repository.commonDir, "worktrees");
  const directories = [branch, detached, commonWorktrees];
  const existed = directories.map(existsSync);
  const before = gitSnapshot(root, spawn);
  const oid = String(runGit(root, ["rev-parse", "--verify", "HEAD^{commit}"], { spawn }).stdout).trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(oid)) throw new Error("repository HEAD is unavailable");

  const target = join(detached, `capability-${randomBytes(12).toString("hex")}`);
  let attempted = false;
  let targetIdentity = null;
  let admin = null;
  let primaryError = null;
  try {
    for (const directory of [branch, detached]) {
      if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
      physicalDirectory(directory, "disposable worktree parent");
    }
    attempted = true;
    runGit(root, ["worktree", "add", "--detach", "--no-checkout", target, oid], { spawn });
    physicalDirectory(target, "disposable worktree");
    targetIdentity = identity(target);
    admin = worktreeAdminFromTarget(target, repository);
    const observedCommon = realpathSync(String(runGit(target,
      ["rev-parse", "--path-format=absolute", "--git-common-dir"], { spawn }).stdout).trim());
    if (observedCommon !== repository.commonDir) throw new Error("disposable worktree changed Git common directory");
    faultInjector?.("worktree-probe-created");
  } catch (error) {
    primaryError = error;
  }

  let cleanupError = null;
  try {
    if (attempted) {
      if (!targetIdentity && existsSync(target)) {
        physicalDirectory(target, "partially-created disposable worktree");
        targetIdentity = identity(target);
        try { admin = worktreeAdminFromTarget(target, repository); } catch {}
      }
      if (targetIdentity && existsSync(target) && !sameIdentity(targetIdentity, target)) {
        throw new Error("disposable worktree changed identity before Git rollback");
      }
      if (admin && existsSync(admin.path) && !sameIdentity(admin.identity, admin.path)) {
        throw new Error("disposable worktree administration changed identity before Git rollback");
      }
      runGit(root, ["worktree", "remove", "--force", target], { spawn, allowNonzero: true });
      if (targetIdentity && (existsSync(target) || (admin && existsSync(admin.path)))) {
        removeExactProbeWorktree(target, targetIdentity, admin);
      }
    }
    if (existsSync(target)) throw new Error("disposable worktree path leaked");
    removeNewEmptyDirectories(directories, existed);
    const after = gitSnapshot(root, spawn);
    if (after.refs !== before.refs) throw new Error("disposable worktree probe changed refs");
    if (after.worktrees !== before.worktrees) throw new Error("disposable worktree registration leaked");
  } catch (error) {
    cleanupError = error;
  }
  if (cleanupError) throw cleanupError;
  if (primaryError) throw primaryError;
}

/**
 * Return exactly the repository component required by
 * `pipeline.project-onboarding.v4`.
 */
export function observeCodexOnboardingCapabilities({
  rootDir = process.cwd(),
  intent = "onboarding",
  repositoryMode = "auto",
  willInitializeGit = false,
  faultInjector = undefined,
  deps = {},
} = {}) {
  if (!INTENTS.has(intent)) throw new TypeError("intent must be onboarding, bootstrap, session, or dispatch");
  if (!MODES.has(repositoryMode)) throw new TypeError("repositoryMode must be auto, local, or host-managed");
  if (typeof willInitializeGit !== "boolean") throw new TypeError("willInitializeGit must be boolean");
  if (faultInjector !== undefined && typeof faultInjector !== "function") throw new TypeError("faultInjector must be a function");
  const spawn = deps.spawnSync ?? spawnSync;
  const component = defaultCapabilities(intent);

  let root;
  try {
    root = physicalRoot(rootDir);
  } catch {
    return component;
  }

  // Codex may hide the initialized host Git directory behind the same empty
  // protected mount used before initialization. The private host receipt is
  // the only distinction available to a fresh read-only hook in that view.
  const initializedHostReceipt = repositoryMode === "auto"
    ? readCodexHostRepositoryInitReceipt(root)
    : null;
  if (initializedHostReceipt) {
    component.rootWritable = "passed";
    component.gitVersion = initializedHostReceipt.gitVersion;
    component.status = "host-managed";
    component.mode = "host-managed";
    if (intent === "session" || intent === "dispatch") component.sessionCapability = "passed";
    return component;
  }

  // Some Codex environments re-expose the initialized Git control directory
  // itself. Hook processes are intentionally read-only, so neither recognized
  // post-init projection may depend on a new disposable root write.
  const initializedHostManaged = repositoryMode === "auto" && hasCodexInitializedGitControlMount(root);
  if (initializedHostManaged) {
    component.rootWritable = "passed";
    component.gitVersion = gitVersion(spawn);
    if (component.gitVersion === null) {
      component.status = "git-unavailable";
      return component;
    }
    component.status = "host-managed";
    component.mode = "host-managed";
    if (intent === "session" || intent === "dispatch") component.sessionCapability = "passed";
    return component;
  }

  try {
    disposableWriteProbe(root, "root", faultInjector);
    component.rootWritable = "passed";
  } catch {
    component.status = "root-read-only";
    component.rootWritable = "failed";
    return component;
  }

  const exactHostManaged = hasCodexHostControlLayout(root);
  const hostManaged = exactHostManaged || (repositoryMode === "auto" && hasCodexGitControlMount(root));
  if (repositoryMode === "host-managed" || (repositoryMode === "auto" && hostManaged)) {
    if (!hostManaged || (repositoryMode === "host-managed" && !exactHostManaged)) {
      component.status = "control-path-invalid";
      return component;
    }
    component.status = "host-managed";
    component.mode = "host-managed";
    return component;
  }

  component.mode = "local";
  const gitType = gitEntryType(root);
  if (gitType === "invalid") {
    component.status = "control-path-invalid";
    return component;
  }

  component.gitVersion = gitVersion(spawn);
  if (component.gitVersion === null) {
    component.status = "git-unavailable";
    return component;
  }

  if (gitType === "absent") {
    component.status = ["onboarding", "bootstrap"].includes(intent) ? "local-uninitialized" : "control-path-invalid";
    component.initializesGit = intent === "onboarding" && willInitializeGit;
    return component;
  }

  let repository;
  try {
    repository = validateLocalRepository(root, gitType, spawn);
  } catch {
    component.status = "control-path-invalid";
    return component;
  }

  try {
    disposableWriteProbe(repository.commonDir, "control", faultInjector);
  } catch {
    component.status = "control-path-read-only";
    return component;
  }

  if (intent === "onboarding" || intent === "bootstrap") {
    component.status = "local-valid-writable";
    return component;
  }

  try {
    sessionProbe(root, repository, spawn, faultInjector);
    component.sessionCapability = "passed";
  } catch {
    component.status = "session-capability-unavailable";
    component.sessionCapability = "failed";
    return component;
  }

  if (intent === "session") {
    component.status = "local-valid-writable";
    return component;
  }

  try {
    worktreeProbe(root, repository, spawn, faultInjector);
    component.worktreeCapability = "passed";
  } catch {
    component.status = "worktree-capability-unavailable";
    component.worktreeCapability = "failed";
    return component;
  }
  component.status = "local-valid-writable";
  return component;
}
