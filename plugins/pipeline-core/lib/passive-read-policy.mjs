// SPDX-License-Identifier: SUL-1.0
/** Exact host-visible read operands may leave the repository, but credential roots remain private. */
import { spawnSync } from "node:child_process";
import { readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { readMachinePlane } from "./machine-plane.mjs";
import { resolveRepoScopedDirectory } from "./po-key-directory.mjs";

/** One immutable credential declaration shared with passive shell readers. */
export const PASSIVE_READ_CREDENTIAL_ROOTS = Object.freeze({
  homeRelativePaths: Object.freeze([".ssh",".aws",".gnupg",".kube",".docker",".azure",".config/gcloud",".config/gh",".codex/auth.json",".claude/.credentials.json",".gemini/oauth_creds.json",".gemini/config/oauth_creds.json",".netrc",".git-credentials",".npmrc",".pypirc"]),
  posixAbsolutePaths: Object.freeze(["/etc/shadow"]),
  secretBasenameRegex: Object.freeze({ source: "^(?:po-private\\.pem|id_(?:rsa|dsa|ecdsa|ed25519)(?:\\.pub)?|credentials|auth\\.json|oauth_creds\\.json|\\.credentials\\.json|application_default_credentials\\.json|\\.(?:npmrc|netrc|git-credentials|pypirc)|\\.env(?:\\.(?!(?:example|sample|template)$).*)?|[^/\\\\]+\\.(?:p12|pfx|key|pem))$", flags: "iu" }),
  recursiveInventoryGlobs: Object.freeze(["po-private.pem","id_*","credentials",".env*",".npmrc",".netrc",".git-credentials",".pypirc","*.pem","*.key","*.p12","*.pfx"]),
  systemPseudoRoots: Object.freeze(["/proc","/sys","/dev","/run","/etc","/root","/private/etc","/private/var/run","/System"]),
});
// Keep the actual RegExp private: freezing a RegExp object does not seal its internal slots.
const SECRET_BASENAME = new RegExp(PASSIVE_READ_CREDENTIAL_ROOTS.secretBasenameRegex.source,
  PASSIVE_READ_CREDENTIAL_ROOTS.secretBasenameRegex.flags);

function within(root, path, includeEqual = true) {
  const part = relative(root, path);
  return (includeEqual || part !== "") && part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

function rawCandidate(raw, root, home) {
  if (/^(?:\\\\[.?]\\|\/\/[.?]\/)/u.test(raw)) return null;
  if (raw === "~") return home;
  if (raw.startsWith("~/") || (process.platform === "win32" && raw.startsWith("~\\"))) {
    return `${home}${sep}${raw.slice(2)}`;
  }
  if (raw.startsWith("~")) return null;
  if (process.platform !== "win32" && (/^[A-Za-z]:[\\/]/u.test(raw) || raw.startsWith("\\\\"))) return null;
  if (process.platform === "win32" && /^[A-Za-z]:(?![\\/])/u.test(raw)) return null;
  return isAbsolute(raw) ? raw : `${root}${sep}${raw}`;
}

function systemPseudoPath(path) {
  const unixRoots = PASSIVE_READ_CREDENTIAL_ROOTS.systemPseudoRoots;
  if (process.platform !== "win32") return PASSIVE_READ_CREDENTIAL_ROOTS.posixAbsolutePaths
    .some((root) => within(root, path)) || unixRoots.some((root) => within(root, path));
  const lower = path.toLowerCase();
  return /^(?:[a-z]:[\\/](?:windows|programdata|\$recycle\.bin)(?:[\\/]|$)|[\\/]{2}[.?][\\/])/u.test(lower);
}

function userVisibleHostPath(path, homeDir) {
  if (process.platform === "win32") return /^[a-z]:[\\/]/iu.test(path) && !systemPseudoPath(path);
  return [homeDir, "/home", "/mnt", "/media", "/tmp", "/private/tmp",
    "/Users", "/Volumes", "/workspace", "/workspaces", "/var/folders", "/private/var/folders"]
    .some((root) => within(root, path));
}

// A recursive search can encounter files the command did not name. Match the
// default rg inventory (including its ignore rules); the admitting grammar
// rejects options that re-enable hidden/ignored content. A bounded filesystem
// fallback keeps a fresh project diagnosable when rg is not on PATH.
function safeRecursiveTree(start, protectedRoots, realpath, stat) {
  const inventory = spawnSync("rg", ["--files", "-0",
    ...PASSIVE_READ_CREDENTIAL_ROOTS.recursiveInventoryGlobs.flatMap((glob) => ["-g", glob])], {
    cwd: start, encoding: "buffer", timeout: 10000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, RIPGREP_CONFIG_PATH: "" },
  });
  if ((inventory.status === 0 || inventory.status === 1) && Buffer.isBuffer(inventory.stdout)) {
    for (const name of inventory.stdout.toString("utf8").split("\0")) {
      if (!name) continue;
      const path = resolve(start, name);
      let physical;
      try { physical = realpath(path); }
      catch { return false; }
      if (SECRET_BASENAME.test(basename(path)) || SECRET_BASENAME.test(basename(physical))) return false;
      if (protectedRoots.some((root) => within(root, path) || within(root, physical))) return false;
    }
    return true;
  }
  const pending = [start];
  const seen = new Set();
  let entries = 0;
  while (pending.length) {
    const path = pending.pop();
    if (++entries > 10000) return false;
    let physical;
    let observed;
    try { physical = realpath(path); observed = stat(path); }
    catch { return false; }
    if (seen.has(physical)) continue;
    seen.add(physical);
    if (SECRET_BASENAME.test(basename(path)) || SECRET_BASENAME.test(basename(physical))) return false;
    if (protectedRoots.some((root) => within(root, path) || within(root, physical))) return false;
    if (!observed.isDirectory()) continue;
    let children;
    try { children = readdirSync(path); }
    catch { return false; }
    // The fallback has no verified ignore semantics, so inspect every entry.
    for (const child of children) pending.push(resolve(path, child));
  }
  return true;
}

/**
 * This check is for passive path operands only. Callers still need a closed
 * command-specific grammar; a read option that executes or writes must never
 * reach this function as an operand.
 */
export function isAllowedPassiveReadTarget(raw, {
  rootDir, homeDir = homedir(), credentialRoots = [], recursive = false, directoryListing = false,
  additionalRecursiveRoots = [],
  realpath = realpathSync.native ?? realpathSync, stat = statSync,
  repoKeyDirectory = resolveRepoScopedDirectory,
  machinePlaneRead = readMachinePlane,
} = {}) {
  if (typeof raw !== "string" || !raw || /[\0$`*?\[\]{}]/u.test(raw)
    || typeof rootDir !== "string" || !rootDir
    || typeof homeDir !== "string" || !homeDir
    || !Array.isArray(credentialRoots)
    || !Array.isArray(additionalRecursiveRoots)) return false;
  const candidate = rawCandidate(raw, rootDir, homeDir);
  if (candidate === null) return false;
  const lexical = resolve(candidate);
  let physical = lexical;
  try { physical = realpath(candidate); }
  catch (error) { if (error?.code !== "ENOENT") return false; }
  // Preserve the original twelve physical-root readbacks. The four appended
  // credential filenames are already denied by the same shared basename rule;
  // enrolling them again would introduce new realpath/error/alias behavior.
  const protectedRoots = PASSIVE_READ_CREDENTIAL_ROOTS.homeRelativePaths.slice(0, 12)
    .map((path) => resolve(homeDir, path)).concat(credentialRoots.map((path) => resolve(path)));
  if (process.platform === "win32") {
    for (const variable of ["APPDATA", "LOCALAPPDATA"]) {
      const value = process.env[variable];
      if (typeof value === "string" && isAbsolute(value)) protectedRoots.push(resolve(value));
    }
  }
  // Auxiliary configuration failure is not an empty credential inventory.
  // Keep host/recursive expansion closed, but evaluate exact own files below.
  let machine;
  try { machine = machinePlaneRead(); }
  catch { machine = null; }
  const machineUnknown = (machine?.status !== "valid" && machine?.status !== "absent")
    || (machine?.status === "valid" && machine.plane?.poKeyDirectory !== null
      && typeof machine.plane?.poKeyDirectory !== "string");
  if (machine?.status === "valid" && typeof machine.plane?.poKeyDirectory === "string") {
    protectedRoots.push(resolve(machine.plane.poKeyDirectory));
  }
  let repoKey;
  try { repoKey = repoKeyDirectory(rootDir); }
  catch { repoKey = null; }
  const repoKeyUnknown = (repoKey?.status !== "valid" && repoKey?.status !== "absent")
    || (repoKey?.status === "valid" && typeof repoKey.directory !== "string");
  if (repoKey?.status === "valid" && typeof repoKey.directory === "string") {
    protectedRoots.push(resolve(repoKey.directory));
  }
  const inProject = within(rootDir, lexical) && within(rootDir, physical);
  if (machineUnknown || repoKeyUnknown) {
    // No alias, private implementation directory, missing path, hard link,
    // directory inventory, or outside root inherits this fallback. Existing
    // credential/system/secret-name checks still apply to both identities.
    const samePath = (a, b) => process.platform === "win32"
      ? a.toLowerCase() === b.toLowerCase() : a === b;
    let observed;
    try {
      if (!isAbsolute(rootDir) || !samePath(realpath(rootDir), resolve(rootDir))
        || !inProject || !samePath(lexical, physical)) return false;
      observed = stat(candidate);
    } catch { return false; }
    if (!observed.isFile() || observed.nlink !== 1
      || relative(rootDir, lexical).split(/[\\/]/u).some((part) => part.startsWith("."))) return false;
  }
  const identities = [lexical, physical];
  for (const identity of identities) {
    if (systemPseudoPath(identity)) return false;
    if (SECRET_BASENAME.test(basename(identity))) return false;
    for (const protectedRoot of protectedRoots) {
      let physicalRoot = protectedRoot;
      try { physicalRoot = realpath(protectedRoot); }
      catch (error) { if (error?.code !== "ENOENT") return false; }
      if (within(protectedRoot, identity) || within(physicalRoot, identity)
        || ((recursive || directoryListing)
          && (within(identity, protectedRoot) || within(identity, physicalRoot)))) return false;
    }
  }
  // Caller-owned resolved roots extend only bounded read operations. Directory
  // roots may contain recursive inventory; file roots match one exact file and
  // never admit siblings or descendants. Keep rootDir unchanged: relative
  // operands and the repository key pointer always belong to the original project.
  // Reject ambiguous, missing, aliased, and credential-containing boundaries.
  const recursiveRoots = [];
  if (!inProject && (recursive || directoryListing)) {
    for (const boundary of additionalRecursiveRoots) {
      if (typeof boundary !== "string" || !isAbsolute(boundary)
        || resolve(boundary) !== boundary || /[\0$`*?\[\]{}]/u.test(boundary)) return false;
      // Unrelated auxiliary roots cannot deny this target. A relevant root
      // still needs its exact physical identity and credential checks below.
      if (!within(boundary, lexical)) continue;
      let observed;
      try {
        if (realpath(boundary) !== boundary) return false;
        observed = stat(boundary);
      } catch { return false; }
      if (!observed.isDirectory() && !observed.isFile()) return false;
      if (observed.isDirectory()) {
        for (const protectedRoot of protectedRoots) {
          let physicalRoot = protectedRoot;
          try { physicalRoot = realpath(protectedRoot); }
          catch (error) { if (error?.code !== "ENOENT") return false; }
          if (within(boundary, protectedRoot) || within(boundary, physicalRoot)) return false;
        }
      }
      recursiveRoots.push({ path: boundary, directory: observed.isDirectory() });
    }
  }
  const inAdditional = (recursive || directoryListing) && recursiveRoots.some(({ path, directory }) =>
    directory
      ? within(path, lexical) && within(path, physical)
      : lexical === path && physical === path);
  if (!inProject && inAdditional && raw.split(/[\\/]/u).includes("..")) return false;
  if (!inProject && !inAdditional) {
    if (!identities.every((identity) => userVisibleHostPath(identity, homeDir))) return false;
    try {
      const observed = stat(candidate);
      if (recursive && !observed.isFile()) return false;
      if (!directoryListing && !observed.isFile()) return false;
      if (directoryListing && !observed.isFile() && !observed.isDirectory()) return false;
    } catch { return false; }
  }
  if (recursive || (directoryListing && inAdditional)) {
    let observed;
    try { observed = stat(candidate); }
    catch { return false; }
    if (directoryListing && inAdditional && !observed.isFile() && !observed.isDirectory()) return false;
    if (observed.isDirectory() && !safeRecursiveTree(candidate, protectedRoots, realpath, stat)) return false;
  }
  return true;
}
