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
  // The first sixteen entries are the original declaration (the first twelve are physical roots below, the last four rely on
  // the basename rule). PO decision D109 (2026-10-22) appends the entries after them, from the sourced catalogue
  // scratch/agent-out/sensitive-paths-research.md (MITRE ATT&CK, vendor docs); they are matched by name for the current
  // home, every OTHER user's home (/home/<u>, /Users/<u>) and a Windows profile seen through WSL (/mnt/<drive>/Users/<u>).
  // Skipped on purpose (unverified or high false-positive risk): see the notes of the D109 change.
  homeRelativePaths: Object.freeze([".ssh",".aws",".gnupg",".kube",".docker",".azure",".config/gcloud",".config/gh",".codex/auth.json",".claude/.credentials.json",".gemini/oauth_creds.json",".gemini/config/oauth_creds.json",".netrc",".git-credentials",".npmrc",".pypirc",
    ".config/git/credentials",".vault-token",".terraformrc",".terraform.d/credentials.tfrc.json",".cargo/credentials",".cargo/credentials.toml",".pgpass",".cache/huggingface/token",".gem/credentials",".local/share/gem/credentials",
    ".gcm",".password-store",".local/share/keyrings",".local/share/kwalletd",
    ".config/google-chrome",".config/chromium",".config/BraveSoftware",".config/microsoft-edge",".mozilla/firefox",
    ".config/Bitwarden",".config/Bitwarden CLI",".var/app/com.bitwarden.desktop","snap/bitwarden/current/.config/Bitwarden",".op",".config/op",
    ".bash_history",".zsh_history",".config/pip/pip.conf",".pip/pip.conf",
    "Library/Keychains","Library/Application Support/Google/Chrome","Library/Application Support/Chromium","Library/Application Support/Firefox",
    "Library/Application Support/Bitwarden","Library/Application Support/Bitwarden CLI","Library/Containers/com.bitwarden.desktop","Library/Application Support/pip/pip.conf"]),
  // D109: Windows profile folders refused as a WHOLE (native Windows already did through %APPDATA%/%LOCALAPPDATA%; WSL now equals it),
  // relative to C:\Users\<user> or /mnt/<drive>/Users/<user>; and the drive-level system folders. Exceptions: namedExceptions below.
  windowsProfileRelativePaths: Object.freeze(["AppData/Roaming", "AppData/Local"]),
  windowsSystemRoots: Object.freeze(["ProgramData", "Windows", "$Recycle.Bin", "System Volume Information"]),
  // D109: reviewed carve-outs from a refused root. path is relative to a home (or Windows profile); kind is "file" (that one file),
  // "dir" (that subtree, the secret-name screen still applies inside it) or "files-with-suffix" (direct children ending in suffix;
  // overridesBasename lets a public-key name through the secret-name rule, never a name whose PHYSICAL target is secret). An entry past
  // its expiry (inclusive end of that UTC day) is ignored, so no exception becomes permanent silently.
  namedExceptions: Object.freeze([
    Object.freeze({ id: "NE-1", path: ".ssh/known_hosts", kind: "file", reason: "host keys of servers already contacted; ssh(1) lists it as not private (https://man.openbsd.org/ssh.1)", owner: "PO", decision: "D109", expires: "2027-04-22" }),
    Object.freeze({ id: "NE-2", path: ".ssh/config", kind: "file", reason: "client configuration, no key material; it may name hosts and IdentityFile paths, which the owner accepts (ssh(1))", owner: "PO", decision: "D109", expires: "2027-04-22" }),
    Object.freeze({ id: "NE-3", path: ".ssh", kind: "files-with-suffix", suffix: ".pub", overridesBasename: true, reason: "public keys are documented as not sensitive (ssh(1)); the physical target must be a .pub file too", owner: "PO", decision: "D109", expires: "2027-04-22" }),
    Object.freeze({ id: "NE-4", path: ".aws/config", kind: "file", reason: "profile, region and role settings, kept by the AWS CLI in a file separate from credentials (https://docs.aws.amazon.com/cli/v1/userguide/cli-configure-files.html)", owner: "PO", decision: "D109", expires: "2027-04-22" }),
    Object.freeze({ id: "NE-5", path: "AppData/Local/Temp", kind: "dir", windowsOnly: true, reason: "scratch space that build and test tools need; temp files can hold secrets, so the secret-name screen still applies and the entry expires", owner: "PO", decision: "D109", expires: "2027-04-22" }),
  ]),
  // PO decision D105 (2026-10-22, extending D96): the host locations D96 made newly readable that hold credentials are
  // enrolled here, not in a second list: sudoers, TLS private keys, container/cluster secret mounts (both /var/run and
  // /run spellings, plus the macOS /private one) and cron spools. SSH host private keys are the basename rule below.
  posixAbsolutePaths: Object.freeze(["/etc/shadow", "/etc/sudoers", "/etc/sudoers.d", "/etc/ssl/private",
    "/var/run/secrets", "/run/secrets", "/private/var/run/secrets", "/var/spool/cron",
    // D109: shadow backup, WireGuard private keys, NetworkManager connection keyfiles, macOS system and network keychains.
    "/etc/shadow-", "/etc/wireguard", "/etc/NetworkManager/system-connections", "/Library/Keychains", "/Network/Library/Keychains"]),
  secretBasenameRegex: Object.freeze({ source: "^(?:po-private\\.pem|ssh_host_[a-z0-9_]+_key|id_(?:rsa|dsa|ecdsa|ed25519|ecdsa_sk|ed25519_sk|mldsa44_ed25519)(?:\\.pub)?|credentials(?:\\.toml|\\.tfrc\\.json)?|auth\\.json|oauth_creds\\.json|\\.credentials\\.json|application_default_credentials\\.json|\\.(?:npmrc|netrc|git-credentials|pypirc|vault-token|pgpass|bash_history|zsh_history)|ConsoleHost_history\\.txt|Cookies\\.binarycookies|logins\\.json|key[34]\\.db|cookies\\.sqlite|Login Data(?: For Account)?|\\.env(?:\\.(?!(?:example|sample|template)$).*)?|[^/\\\\]+\\.(?:p12|pfx|key|pem|kdbx|opvault|keychain-db|ppk|pgp|gpg|asc|cer|p7b|jks|keystore))$", flags: "iu" }),
  recursiveInventoryGlobs: Object.freeze(["po-private.pem","id_*","credentials",".env*",".npmrc",".netrc",".git-credentials",".pypirc","*.pem","*.key","*.p12","*.pfx",
    "ssh_host_*_key","credentials.toml","credentials.tfrc.json",".vault-token",".pgpass",".bash_history",".zsh_history","ConsoleHost_history.txt","Cookies.binarycookies",
    "logins.json","key[34].db","cookies.sqlite","Login Data","*.kdbx","*.opvault","*.keychain-db","*.ppk","*.pgp","*.gpg","*.asc","*.cer","*.p7b","*.jks","*.keystore"]),
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

// PO decision D109 (2026-10-22): name-based credential locations that do not depend on which platform runs the guard.
// A path is classified by SHAPE, as a string: a home (the current one, another user's /home/<u> or /Users/<u>), or a
// Windows drive (native C:\ or WSL /mnt/<letter>/), inside which C:\Users\<u> is a profile. The home-relative entries,
// the whole AppData\Roaming and AppData\Local, the drive-level system folders and the reviewed named exceptions all come
// from PASSIVE_READ_CREDENTIAL_ROOTS; this block holds no list of its own. Windows spellings compare case-insensitively.
const fold = (values) => Object.freeze(values.map((value) => value.toLowerCase()));
const HOME_ENTRIES_FOLDED = fold(PASSIVE_READ_CREDENTIAL_ROOTS.homeRelativePaths);
const PROFILE_ENTRIES_FOLDED = fold(PASSIVE_READ_CREDENTIAL_ROOTS.windowsProfileRelativePaths);
const WINDOWS_SYSTEM_FOLDED = fold(PASSIVE_READ_CREDENTIAL_ROOTS.windowsSystemRoots);
const NATIVE_DRIVE = /^[a-z]:(?:[\\/](.*))?$/iu;
const WSL_DRIVE = /^\/mnt(?:\/([a-z])(?:\/(.*))?)?$/u;
const WINDOWS_PROFILE = /^users\/([^/]+)(?:\/(.*))?$/iu;
const OTHER_USER_HOME = /^\/(?:home|Users)\/([^/]+)(?:\/(.*))?$/u;

function classifyHostPath(identity, homePrefixes) {
  let rest = null;
  const native = NATIVE_DRIVE.exec(identity);
  if (native !== null) rest = (native[1] ?? "").replaceAll("\\", "/");
  else {
    const wsl = WSL_DRIVE.exec(identity);
    if (wsl !== null) rest = wsl[1] === undefined ? "" : (wsl[2] ?? "");
  }
  if (rest !== null) {
    const profile = WINDOWS_PROFILE.exec(rest);
    return profile === null ? { windows: true, drive: true, profile: false, rest }
      : { windows: true, drive: true, profile: true, rest: profile[2] ?? "" };
  }
  for (const prefix of homePrefixes) {
    if (identity === prefix) return { windows: false, drive: false, profile: false, rest: "" };
    if (identity.startsWith(`${prefix}/`)) return { windows: false, drive: false, profile: false, rest: identity.slice(prefix.length + 1) };
  }
  const other = OTHER_USER_HOME.exec(identity);
  return other === null ? null : { windows: false, drive: false, profile: false, rest: other[2] ?? "" };
}

function homeRestRefused(rest, windows, recursive, directoryListing) {
  const probe = windows ? rest.toLowerCase() : rest;
  if (probe === "") return recursive || directoryListing;
  const entries = windows ? [...HOME_ENTRIES_FOLDED, ...PROFILE_ENTRIES_FOLDED] : PASSIVE_READ_CREDENTIAL_ROOTS.homeRelativePaths;
  return entries.some((entry) => probe === entry || probe.startsWith(`${entry}/`)
    || (recursive && entry.startsWith(`${probe}/`)));
}

function hostCredentialRefusal(info, recursive, directoryListing) {
  if (info.drive && !info.profile) {
    if (info.rest === "") return recursive;
    const segments = info.rest.toLowerCase().split("/");
    if (WINDOWS_SYSTEM_FOLDED.includes(segments[0])) return true;
    return segments[0] === "users" && segments.length === 1 && recursive;
  }
  return homeRestRefused(info.rest, info.windows, recursive, directoryListing);
}

function hostException(info, now) {
  if (info === null || (info.drive && !info.profile)) return null;
  const rest = info.windows ? info.rest.toLowerCase() : info.rest;
  return PASSIVE_READ_CREDENTIAL_ROOTS.namedExceptions.find((entry) => {
    if ((entry.windowsOnly && !info.windows) || Date.parse(`${entry.expires}T23:59:59.999Z`) < now) return false;
    const path = info.windows ? entry.path.toLowerCase() : entry.path;
    if (entry.kind === "file") return rest === path;
    if (entry.kind === "dir") return rest === path || rest.startsWith(`${path}/`);
    if (entry.kind === "files-with-suffix") {
      const suffix = info.windows ? entry.suffix.toLowerCase() : entry.suffix;
      const name = rest.slice(path.length + 1);
      return rest.startsWith(`${path}/`) && !name.includes("/") && name.endsWith(suffix) && name.length > suffix.length;
    }
    return false;
  }) ?? null;
}

/** True when `identity` (an absolute path, either spelling) lies in a name-based credential location and no live named exception covers it. */
export function isHostCredentialLocation(identity, { homePrefixes = [], recursive = false, directoryListing = false, now = Date.now() } = {}) {
  if (typeof identity !== "string" || identity === "") return false;
  const info = classifyHostPath(identity, homePrefixes);
  return info !== null && hostException(info, now) === null && hostCredentialRefusal(info, recursive, directoryListing);
}

// PO decision D96 (2026-10-22, with the 2026-09-10 correction in docs/adr/draft-read-scope-containment-boundary.md):
// a passive read outside the repository is not by itself a denial reason. Every absolute host path qualifies here;
// the credential roots, system pseudo roots and secret basenames are screened for BOTH identities by the caller
// before this predicate is reached.
function userVisibleHostPath(path) {
  if (process.platform === "win32") return /^[a-z]:[\\/]/iu.test(path) && !systemPseudoPath(path);
  return isAbsolute(path);
}

// Runtime skill instruction trees under the home directory. A skill file is a runtime authority,
// so it is reachable only by its own physical name, never through an alias that merely resolves
// into the tree (ALF-B8-AC147: a project-local alias to the skill tree stays refused).
const HOST_SKILL_TREE_HOME_PATHS = Object.freeze([".codex/skills"]);

// True when the NAME is outside every host skill tree but its physical resolution is inside one.
// A name that is itself inside the tree (including through a linked home directory) is not an
// alias; links elsewhere keep their existing lane.
function resolvesIntoSkillTreeThroughAlias(homeDir, lexical, physical, realpath) {
  for (const relativeRoot of HOST_SKILL_TREE_HOME_PATHS) {
    const lexicalRoot = resolve(homeDir, relativeRoot);
    let physicalRoot = lexicalRoot;
    try { physicalRoot = realpath(lexicalRoot); }
    catch { /* an unresolvable tree root cannot be proven to host this target; the target's own readback decides */ }
    if (!within(physicalRoot, physical) && !within(lexicalRoot, physical)) continue;
    if (within(lexicalRoot, lexical) || within(physicalRoot, lexical)) continue;
    return true;
  }
  return false;
}

// Host-wide runner session and skill collections: a recursive directory search outside the repository stays
// refused when it lies in, or contains, one of these (D96 admits outside directories, but not other sessions'
// content). This is NOT a credential list; it only bounds directory recursion and never widens a refusal elsewhere.
const SESSION_COLLECTION_HOME_PATHS = Object.freeze([".codex/sessions", ".codex/skills", ".claude/projects"]);

function touchesSessionCollection(homeDir, identities, realpath) {
  return SESSION_COLLECTION_HOME_PATHS.some((relativeRoot) => {
    const lexicalRoot = resolve(homeDir, relativeRoot);
    let physicalRoot = lexicalRoot;
    try { physicalRoot = realpath(lexicalRoot); }
    catch (error) { if (error?.code !== "ENOENT") return true; }
    return identities.some((identity) => [lexicalRoot, physicalRoot].some((root) =>
      within(root, identity) || within(identity, root)));
  });
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
  now = Date.now(),
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
  const homePrefixes = [resolve(homeDir)];
  try { homePrefixes.push(realpath(homeDir)); } catch { /* an unresolvable home keeps its lexical prefix */ }
  for (const identity of identities) {
    const hostShape = classifyHostPath(identity, homePrefixes);
    const exception = hostException(hostShape, now);
    if (systemPseudoPath(identity)) return false;
    // D105: a recursive search that would sweep an enrolled absolute credential location (an ancestor of it) is refused,
    // exactly as a recursive search over an ancestor of a home credential root is below.
    if (recursive && process.platform !== "win32"
      && PASSIVE_READ_CREDENTIAL_ROOTS.posixAbsolutePaths.some((root) => within(identity, root))) return false;
    if (exception?.overridesBasename !== true && SECRET_BASENAME.test(basename(identity))) return false;
    if (hostShape !== null && exception === null && hostCredentialRefusal(hostShape, recursive, directoryListing)) return false;
    for (const protectedRoot of protectedRoots) {
      let physicalRoot = protectedRoot;
      try { physicalRoot = realpath(protectedRoot); }
      catch (error) { if (error?.code !== "ENOENT") return false; }
      const inside = within(protectedRoot, identity) || within(physicalRoot, identity);
      const ancestor = (recursive || directoryListing)
        && (within(identity, protectedRoot) || within(identity, physicalRoot));
      // A live named exception lifts only the "inside a refused root" refusal of this one identity (lexical and physical
      // are judged separately); it never lifts the ancestor refusal and never a refused physical target.
      if ((inside && exception === null) || ancestor) return false;
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
    // A name outside the host skill tree that resolves into it (for example a project-local
    // alias) is not the skill file's own name, so the host-visible fallback must not admit it.
    if (resolvesIntoSkillTreeThroughAlias(homeDir, lexical, physical, realpath)) return false;
    if (!identities.every((identity) => userVisibleHostPath(identity))) return false;
    try {
      // D96: a recursive operand outside the repository may also be a directory; the whole-tree secret screen
      // (safeRecursiveTree, below) is the unchanged examiner that decides it. A plain read still needs a file.
      const observed = stat(candidate);
      if (!recursive && !directoryListing && !observed.isFile()) return false;
      if (!observed.isFile() && !observed.isDirectory()) return false;
      // A recursive search must not sweep a host-wide runner session or skill collection (it holds other
      // sessions' content); an exact file in one keeps its existing lane.
      if (recursive && observed.isDirectory()
        && touchesSessionCollection(homeDir, identities, realpath)) return false;
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
