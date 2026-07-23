// SPDX-License-Identifier: SUL-1.0

/** Read-only observation of one Public source checkout and one installed copy. */
import { execFileSync as nodeExecFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";

const SCHEMA = "pipeline.public-core-observation.v1";
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const PLUGIN_VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/u;
const MANIFEST_KEYS = Object.freeze(["name", "version", "description", "hooks", "author", "interface"]);
const IDENTITY_FIELDS = Object.freeze(["dev", "ino", "mode", "size", "mtimeNs", "ctimeNs"]);
const MANIFEST_PATH = ".codex-plugin/plugin.json";
const UTF8 = new TextDecoder("utf-8", { fatal: true });

class ObservationError extends Error {
  constructor(code) {
    super(code);
    this.name = "PublicCoreObservationError";
    this.code = code;
  }
}

function fail(code) {
  throw new ObservationError(code);
}

function exactObject(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function resolveDependencies(value) {
  if (!exactObject(value, Object.keys(value ?? {}))) fail("SNT-A2-DEPENDENCY-SCHEMA");
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "execFileSync" && key !== "afterOpen")) fail("SNT-A2-DEPENDENCY-SCHEMA");
  if (Object.hasOwn(value, "execFileSync") && typeof value.execFileSync !== "function") fail("SNT-A2-DEPENDENCY-SCHEMA");
  if (Object.hasOwn(value, "afterOpen") && typeof value.afterOpen !== "function") fail("SNT-A2-DEPENDENCY-SCHEMA");
  return {
    execFileSync: value.execFileSync ?? nodeExecFileSync,
    afterOpen: value.afterOpen,
  };
}

function physicalDirectory(path, code) {
  // On POSIX "\" is an ordinary filename character, never a separator, so any
  // backslash is separator-confusion-shaped input and rejected outright. On
  // native Windows "\" is the platform separator itself (every real absolute
  // path contains it), so the same literal ban would reject every legitimate
  // root; resolve(path) !== path below already enforces host-canonical form
  // (including collapsing "." / "..") without needing a POSIX-only heuristic.
  if (typeof path !== "string"
    || !isAbsolute(path)
    || path.includes("\0")
    || (process.platform !== "win32" && path.includes("\\"))
    || resolve(path) !== path) fail(code);
  let info;
  try { info = lstatSync(path, { bigint: true }); } catch { fail(code); }
  if (!info.isDirectory() || info.isSymbolicLink()) fail(code);
  try { if (realpathSync(path) !== path) fail(code); } catch (error) {
    if (error instanceof ObservationError) throw error;
    fail(code);
  }
  return { path, info };
}

function resolveSourceLayout(sourcePluginRoot) {
  const source = physicalDirectory(sourcePluginRoot, "SNT-A2-SOURCE-ROOT-UNSAFE");
  const pluginsRoot = dirname(source.path);
  const gitRoot = dirname(pluginsRoot);
  if (basename(source.path) !== "pipeline-core" || basename(pluginsRoot) !== "plugins" || gitRoot === pluginsRoot) {
    fail("SNT-A2-SOURCE-LAYOUT-INVALID");
  }
  physicalDirectory(pluginsRoot, "SNT-A2-SOURCE-ROOT-UNSAFE");
  physicalDirectory(gitRoot, "SNT-A2-SOURCE-ROOT-UNSAFE");
  return { sourcePluginRoot: source.path, gitRoot };
}

function gitLine(execFileSync, gitRoot, args, failureCode) {
  let output;
  try {
    output = execFileSync("git", args, {
      cwd: gitRoot,
      shell: false,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    fail(failureCode);
  }
  if (typeof output !== "string") fail(failureCode);
  let line = output.endsWith("\n") ? output.slice(0, -1) : output;
  if (line.endsWith("\r")) line = line.slice(0, -1);
  if (line.length === 0 || line.includes("\n") || line.includes("\r") || line.includes("\0") || line.trim() !== line) fail(failureCode);
  return line;
}

function validBranch(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 255
    && !value.startsWith("/")
    && !value.endsWith("/")
    && !value.endsWith(".")
    && !value.endsWith(".lock")
    && !value.includes("..")
    && !value.includes("@{")
    && !/[\\\s~^:?*[\]]/u.test(value)
    && value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function validRepository(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === ""
      && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function observeGit(gitRoot, execFileSync) {
  const top = gitLine(execFileSync, gitRoot, ["rev-parse", "--show-toplevel"], "SNT-A2-GIT-UNAVAILABLE");
  const commit = gitLine(execFileSync, gitRoot, ["rev-parse", "HEAD"], "SNT-A2-GIT-UNAVAILABLE");
  const tree = gitLine(execFileSync, gitRoot, ["rev-parse", "HEAD^{tree}"], "SNT-A2-GIT-UNAVAILABLE");
  const branch = gitLine(execFileSync, gitRoot, ["symbolic-ref", "--short", "HEAD"], "SNT-A2-GIT-DETACHED");
  const repository = gitLine(execFileSync, gitRoot, ["remote", "get-url", "origin"], "SNT-A2-GIT-ORIGIN-MISSING");
  let pluginStatus;
  try {
    pluginStatus = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all", "--", "plugins/pipeline-core"], {
      cwd: gitRoot,
      shell: false,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    fail("SNT-A2-GIT-UNAVAILABLE");
  }
  // git rev-parse --show-toplevel always prints forward slashes, even on
  // native Windows where gitRoot is a native backslash path for the same
  // directory; normalize only the comparison, never the trusted gitRoot value.
  const topComparable = process.platform === "win32" ? top.replaceAll("/", sep) : top;
  if (topComparable !== gitRoot) fail("SNT-A2-GIT-ROOT-MISMATCH");
  if (!OID.test(commit) || !OID.test(tree)) fail("SNT-A2-GIT-OID-INVALID");
  if (!validBranch(branch)) fail("SNT-A2-GIT-BRANCH-INVALID");
  if (!validRepository(repository)) fail("SNT-A2-GIT-ORIGIN-INVALID");
  if (pluginStatus !== "") fail("SNT-A2-SOURCE-DIRTY");
  return { repository, branch, commit, tree };
}

function sameIdentity(left, right) {
  return IDENTITY_FIELDS.every((field) => left[field] === right[field]);
}

function pathInside(root, path) {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

function physicalEntry(path, root, code) {
  let info;
  try { info = lstatSync(path, { bigint: true }); } catch { fail(code); }
  if (info.isSymbolicLink()) fail("SNT-A2-PLUGIN-SYMLINK");
  try {
    if (!pathInside(root, path) || realpathSync(path) !== path) fail("SNT-A2-PLUGIN-PATH-UNSAFE");
  } catch (error) {
    if (error instanceof ObservationError) throw error;
    fail("SNT-A2-PLUGIN-PATH-UNSAFE");
  }
  return info;
}

function stableFile(root, path, relativePath, afterOpen) {
  const pathBefore = physicalEntry(path, root, "SNT-A2-PLUGIN-CHANGED");
  if (!pathBefore.isFile() || pathBefore.nlink !== 1n) fail("SNT-A2-PLUGIN-NONREGULAR");
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error?.code === "ELOOP") fail("SNT-A2-PLUGIN-SYMLINK");
    fail("SNT-A2-PLUGIN-UNREADABLE");
  }
  try {
    const descriptorBefore = fstatSync(descriptor, { bigint: true });
    if (!descriptorBefore.isFile() || descriptorBefore.nlink !== 1n || !sameIdentity(pathBefore, descriptorBefore)) {
      fail("SNT-A2-PLUGIN-CHANGED");
    }
    if (afterOpen !== undefined) afterOpen({ root, relativePath });
    const bytes = readFileSync(descriptor);
    const descriptorAfter = fstatSync(descriptor, { bigint: true });
    const pathAfter = physicalEntry(path, root, "SNT-A2-PLUGIN-CHANGED");
    if (!sameIdentity(descriptorBefore, descriptorAfter)
      || !sameIdentity(descriptorAfter, pathAfter)
      || descriptorAfter.size !== BigInt(bytes.length)) fail("SNT-A2-PLUGIN-CHANGED");
    return {
      path: relativePath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.length,
      bytes,
    };
  } catch (error) {
    if (error instanceof ObservationError) throw error;
    fail("SNT-A2-PLUGIN-UNREADABLE");
  } finally {
    closeSync(descriptor);
  }
}

function assertDirectoryStable(path, root, expected) {
  const observed = path === root
    ? physicalDirectory(path, "SNT-A2-PLUGIN-CHANGED").info
    : physicalEntry(path, root, "SNT-A2-PLUGIN-CHANGED");
  if (!observed.isDirectory() || !sameIdentity(expected, observed)) fail("SNT-A2-PLUGIN-CHANGED");
}

function lexical(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function snapshotPluginRoot(pluginRoot, afterOpen, rootCode) {
  const { path: root, info: rootIdentity } = physicalDirectory(pluginRoot, rootCode);
  const directories = [];
  const files = [];
  function visit(directory, parts, expectedIdentity) {
    const relativeDirectory = parts.join("/");
    if (relativeDirectory !== "") directories.push(relativeDirectory);
    assertDirectoryStable(directory, root, expectedIdentity);
    let names;
    try { names = readdirSync(directory).sort(lexical); } catch { fail("SNT-A2-PLUGIN-UNREADABLE"); }
    assertDirectoryStable(directory, root, expectedIdentity);
    for (const name of names) {
      assertDirectoryStable(directory, root, expectedIdentity);
      if (name === "" || name === "." || name === ".." || name.includes("/") || name.includes("\\") || name.includes("\0")) {
        fail("SNT-A2-PLUGIN-PATH-UNSAFE");
      }
      const child = join(directory, name);
      const relativePath = [...parts, name].join("/");
      const info = physicalEntry(child, root, "SNT-A2-PLUGIN-CHANGED");
      if (info.isDirectory()) visit(child, [...parts, name], info);
      else if (info.isFile()) files.push(stableFile(root, child, relativePath, afterOpen));
      else fail("SNT-A2-PLUGIN-NONREGULAR");
      assertDirectoryStable(directory, root, expectedIdentity);
    }
    assertDirectoryStable(directory, root, expectedIdentity);
  }
  visit(root, [], rootIdentity);
  files.sort((left, right) => lexical(left.path, right.path));
  directories.sort(lexical);
  const content = files.map(({ path, sha256, byteLength }) => ({ path, sha256, byteLength }));
  const contentSha256 = createHash("sha256")
    .update(JSON.stringify(content))
    .digest("hex");
  return { files, directories, content, contentSha256 };
}

function parseManifest(snapshot, side) {
  const entry = snapshot.files.find(({ path }) => path === MANIFEST_PATH);
  if (entry === undefined) fail(`SNT-A2-${side}-MANIFEST-MISSING`);
  let manifest;
  try { manifest = JSON.parse(UTF8.decode(entry.bytes)); } catch { fail(`SNT-A2-${side}-MANIFEST-MALFORMED`); }
  if (!exactObject(manifest, MANIFEST_KEYS)
    || manifest.name !== "pipeline-core"
    || !PLUGIN_NAME.test(manifest.name)
    || !PLUGIN_VERSION.test(manifest.version)
    || manifest.hooks !== "./hooks/codex-hooks.json") fail(`SNT-A2-${side}-MANIFEST-SCHEMA`);
  return { name: manifest.name, version: manifest.version, manifestSha256: entry.sha256 };
}

function sameSnapshot(source, installed) {
  if (source.directories.join("\0") !== installed.directories.join("\0")) return false;
  if (source.content.length !== installed.content.length) return false;
  return source.content.every((entry, index) => {
    const other = installed.content[index];
    return entry.path === other.path
      && entry.sha256 === other.sha256
      && entry.byteLength === other.byteLength
      && SHA256.test(entry.sha256);
  });
}

function rejected(code) {
  return { schema: SCHEMA, status: "rejected", reasonCodes: [code] };
}

export function observePublicCoreIdentity(input = {}, deps = {}) {
  try {
    if (!exactObject(input, ["sourcePluginRoot", "installedPluginRoot"])) fail("SNT-A2-INPUT-SCHEMA");
    const dependencies = resolveDependencies(deps);
    const layout = resolveSourceLayout(input.sourcePluginRoot);
    physicalDirectory(input.installedPluginRoot, "SNT-A2-INSTALLED-ROOT-UNSAFE");
    const candidate = observeGit(layout.gitRoot, dependencies.execFileSync);
    const source = snapshotPluginRoot(layout.sourcePluginRoot, dependencies.afterOpen, "SNT-A2-SOURCE-ROOT-UNSAFE");
    const installed = input.installedPluginRoot === layout.sourcePluginRoot
      ? source
      : snapshotPluginRoot(input.installedPluginRoot, dependencies.afterOpen, "SNT-A2-INSTALLED-ROOT-UNSAFE");
    const sourceManifest = parseManifest(source, "SOURCE");
    const installedManifest = parseManifest(installed, "INSTALLED");
    if (sourceManifest.name !== installedManifest.name
      || sourceManifest.version !== installedManifest.version
      || sourceManifest.manifestSha256 !== installedManifest.manifestSha256) fail("SNT-A2-MANIFEST-MISMATCH");
    if (!sameSnapshot(source, installed) || source.contentSha256 !== installed.contentSha256) fail("SNT-A2-CONTENT-MISMATCH");
    return {
      schema: SCHEMA,
      status: "ready",
      candidate,
      plugin: {
        name: installedManifest.name,
        version: installedManifest.version,
        manifestSha256: installedManifest.manifestSha256,
        contentSha256: installed.contentSha256,
      },
    };
  } catch (error) {
    return rejected(error instanceof ObservationError ? error.code : "SNT-A2-INTERNAL-ERROR");
  }
}
