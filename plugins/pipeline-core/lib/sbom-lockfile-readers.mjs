// SPDX-License-Identifier: SUL-1.0
/**
 * C28d (PO tiles 2026-11-12): the lockfile readers of the close SBOM beyond npm, Python, Go and Rust.
 *
 * Pure and offline, like sbom-close.mjs that registers them: each reader turns a file's text into `{ components, issues }` and opens no
 * file, runs no process and uses no network. The rules every reader follows (fail closed, never a silent skip):
 *   - a package resolved from a registry is a component `{ ecosystem, name, version, purl, scope }`;
 *   - a member of the project itself (a workspace, link or virtual root) is not a dependency and is left out;
 *   - a package pinned to a git commit, a local path or a URL is a `partial` finding: it has no registry version a reader of the SBOM can
 *     look up, and its URL is never written into the SBOM (real lockfiles carry access tokens in such URLs);
 *   - a lockfile format version this module does not know is an `unsupported` finding, and an entry it cannot classify is `invalid`
 *     (thrown, so the caller names the file).
 * Readers: yarn.lock (v1 and the Berry format), pnpm-lock.yaml (5.x, 6.x, 9.x), bun.lock, uv.lock, Gradle lockfiles, NuGet
 * packages.lock.json, Gemfile.lock, composer.lock, pubspec.lock, Package.resolved, mix.lock, conan.lock (0.4, 0.5), a committed
 * CycloneDX file, and Maven pom.xml (direct dependencies only; see mavenCoverage).
 */
import { SBOM_LIFECYCLE_CODES } from "./sbom-manifest.mjs";

const finding = (state, path, reason) => ({ state, code: state === "unsupported" ? SBOM_LIFECYCLE_CODES.unsupported : state === "partial" ? SBOM_LIFECYCLE_CODES.partial : SBOM_LIFECYCLE_CODES.invalidRecord, path, reason });
const encodePart = (value) => encodeURIComponent(value).replace(/%2F/gu, "/");
const component = (ecosystem, purlType, name, version, scope) => ({ ecosystem, name, version, purl: `pkg:${purlType}/${purlType === "npm" && name.startsWith("@") ? `%40${encodePart(name.slice(1))}` : encodePart(name)}@${encodeURIComponent(version)}`, scope });
const npm = (name, version, scope = "required") => component("npm", "npm", name, version, scope);
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/u;
const short = (value) => String(value).slice(0, 80);
function dedupe(list) { const seen = new Set(); return list.filter((entry) => (seen.has(entry.purl) ? false : (seen.add(entry.purl), true))); }

// ---------------------------------------------------------------------------------------------------------------- JavaScript

/** The package name of a descriptor such as `@scope/name@^1`, `alias@npm:real@^1` or `"name@file:x"` (quotes and trailing colon removed). */
function descriptorName(descriptor) {
  const scoped = descriptor.startsWith("@");
  const at = descriptor.indexOf("@", scoped ? 1 : 0);
  const name = at === -1 ? descriptor : descriptor.slice(0, at);
  const range = at === -1 ? "" : descriptor.slice(at + 1);
  if (range.startsWith("npm:") && range.slice(4).includes("@", range.slice(4).startsWith("@") ? 1 : 0)) return descriptorName(range.slice(4));
  return { name, range };
}

function yarnEntries(text) {
  const entries = []; let current = null;
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!line.startsWith(" ")) { current = { header: line, props: [] }; entries.push(current); continue; }
    if (current === null) throw new Error("a property line before the first entry");
    current.props.push(line);
  }
  return entries;
}
const unquote = (value) => value.replace(/^"(.*)"$/u, "$1");
const safePathname = (url) => { try { return new URL(url).pathname; } catch { return ""; } };
const yarnProp = (props, key) => { for (const line of props) { const match = new RegExp(`^ {2}"?${key}"?:? (.+)$`, "u").exec(line); if (match) return unquote(match[1].trim()); } return null; };

export function parseYarnLock(text, path) {
  const v1 = /^# yarn lockfile v1\s*$/mu.test(text);
  const entries = yarnEntries(text);
  if (entries.length === 0) return { components: [], issues: [] }; // only the generated header: nothing is locked
  const meta = entries.find((entry) => entry.header === "__metadata:");
  if (!v1 && meta === undefined) throw new Error("neither a yarn v1 lockfile nor a Berry lockfile with __metadata");
  const issues = []; const out = [];
  if (!v1) {
    const version = Number(yarnProp(meta.props, "version"));
    if (!Number.isInteger(version) || version < 4 || version > 8) return { components: [], issues: [finding("unsupported", path, `yarn lockfile format ${short(yarnProp(meta.props, "version"))} has no reader yet (known: v1 and Berry formats 4 to 8)`)] };
  }
  for (const entry of entries) {
    if (entry === meta) continue;
    const first = unquote(entry.header.replace(/:$/u, "").split(/,\s*/u)[0].trim());
    const { name } = descriptorName(first);
    const version = yarnProp(entry.props, "version");
    if (v1) {
      // C28e: the DESCRIPTOR decides, not the tarball URL's shape. A semver range or dist-tag is resolved from a registry, whatever path the
      // registry serves its tarballs under (GitHub Packages has no `/-/`); a protocol, a URL or an owner/repo shorthand is not.
      // `name@npm:^1` is the registry protocol spelled out; `alias@npm:real@^1` and `alias@npm:@scope/real@^1` name the real package first.
      let range = descriptorName(first).range;
      if (/^npm:/u.test(range)) { const target = range.slice(4); range = target.includes("@") ? descriptorName(target).range : target; }
      const resolved = yarnProp(entry.props, "resolved");
      if (/^link:/u.test(range)) continue;
      if (/^file:/u.test(range)) { issues.push(finding("partial", path, `${name} is a local file dependency, not a registry version`)); continue; }
      if (/^[a-z][a-z0-9+.-]*:/iu.test(range) || range.includes("/")) { issues.push(finding("partial", path, `${name} is pinned to a git commit or URL, not a registry version`)); continue; }
      if (typeof version !== "string" || !SEMVER.test(version)) throw new Error(`${name}: entry without a version`);
      const real = resolved === null ? undefined : /\/((?:@[^/]+\/)?[^/]+)\/-\//u.exec(safePathname(resolved))?.[1];
      out.push(npm(real === undefined ? name : decodeURIComponent(real), version));
      continue;
    }
    const resolution = yarnProp(entry.props, "resolution");
    if (resolution === null) throw new Error(`${name}: entry without a resolution`);
    const { name: realName, range: locator } = descriptorName(resolution);
    if (/^(?:workspace|link|portal|patch):/u.test(locator) || entry.header.includes("@patch:")) continue; // the project itself, or a patch listed again under the locator it patches
    // A private registry whose tarball path differs from the default adds `::__archiveUrl=<encoded URL>` after the version: still a registry
    // package; the URL is dropped like every other one.
    if (/^npm:/u.test(locator)) { const pinned = locator.slice(4).replace(/::.*$/u, ""); if (!SEMVER.test(pinned)) throw new Error(`${realName}: npm resolution without a version`); out.push(npm(realName, pinned)); continue; }
    issues.push(finding("partial", path, `${realName} is resolved from ${/^file:/u.test(locator) ? "a local file" : "a git commit or URL"}, not a registry version`));
  }
  return { components: dedupe(out), issues };
}

/** The top-level `packages:` (and v9 `snapshots:`) entries of one pnpm document: key and its 4-space fields. */
function pnpmSections(doc) {
  const sections = { packages: [], snapshots: [] }; let section = null; let current = null;
  for (const line of doc.split(/\r?\n/u)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!line.startsWith(" ")) { section = /^(packages|snapshots):\s*$/u.exec(line)?.[1] ?? null; current = null; continue; }
    if (section === null) continue;
    const key = /^ {2}(?! )(.+?):\s*(\{\})?\s*$/u.exec(line);
    if (key) { current = { key: key[1].replace(/^'(.*)'$/u, "$1").replace(/^"(.*)"$/u, "$1"), fields: {} }; sections[section].push(current); continue; }
    const field = /^ {4}(?! )([A-Za-z]+):\s*(.*)$/u.exec(line);
    if (field && current) current.fields[field[1]] = field[2].trim().replace(/^'(.*)'$/u, "$1");
  }
  return sections;
}
function pnpmKey(rawKey, major) {
  // 9.x: name@version ; 6.x: /name@version(peers) ; 5.x: /name/version_peers. A key outside these forms names no registry package.
  if (major === 9) { const at = rawKey.indexOf("@", rawKey.startsWith("@") ? 1 : 0); return at === -1 ? null : { name: rawKey.slice(0, at), version: rawKey.slice(at + 1).replace(/\(.*$/u, "") }; }
  // C28e: before 9.x a package from a registry other than the default is keyed by that registry's host (`npm.corp.example/name/1.0.0`);
  // the host is dropped (never written). A tarball URL or a git host key keeps a non-semver last part and stays partial.
  const key = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?\//iu.test(rawKey) ? rawKey.slice(rawKey.indexOf("/")) : rawKey;
  if (!key.startsWith("/")) return null;
  if (major === 6) { const body = key.slice(1); const at = body.indexOf("@", body.startsWith("@") ? 1 : 0); return at === -1 ? null : { name: body.slice(0, at), version: body.slice(at + 1).replace(/\(.*$/u, "") }; }
  const parts = key.slice(1).split("/"); const version = parts.pop()?.replace(/_.*$/u, ""); return parts.length === 0 ? null : { name: parts.join("/"), version };
}
export function parsePnpmLock(text, path) {
  const out = []; const issues = []; const optional = new Set();
  for (const doc of text.split(/^---\s*$/mu)) {
    if (doc.trim() === "") continue;
    const raw = /^lockfileVersion:\s*['"]?([0-9.]+)['"]?\s*$/mu.exec(doc)?.[1];
    if (raw === undefined) throw new Error("no lockfileVersion");
    const major = Number(raw.split(".")[0]);
    if (![5, 6, 9].includes(major)) { issues.push(finding("unsupported", path, `pnpm lockfile version ${short(raw)} has no reader yet (known: 5.x, 6.x, 9.x)`)); continue; }
    const { packages, snapshots } = pnpmSections(doc);
    for (const snapshot of snapshots) if (snapshot.fields.optional === "true") { const parsed = pnpmKey(snapshot.key, 9); if (parsed) optional.add(`${parsed.name}@${parsed.version}`); }
    for (const entry of packages) {
      const resolution = entry.fields.resolution ?? "";
      const parsed = pnpmKey(entry.key, major);
      const name = entry.fields.name ?? parsed?.name ?? entry.key;
      // A registry package whose tarball URL pnpm cannot derive (a private registry) keeps `tarball:` next to its `integrity:`; it is still a
      // registry package. A tarball without an integrity hash, a git commit or a local directory is not.
      const tarballOnly = /tarball:/u.test(resolution) && !/integrity:/u.test(resolution);
      if (tarballOnly || /commit:|type:\s*git|directory:/u.test(resolution) || parsed === null || !SEMVER.test(parsed.version)) { issues.push(finding("partial", path, `${short(name)} is resolved from a git commit, a tarball URL or a local path, not a registry version`)); continue; }
      const scope = entry.fields.dev === "true" ? "dev" : entry.fields.optional === "true" || optional.has(`${parsed.name}@${parsed.version}`) ? "optional" : "required";
      out.push(npm(parsed.name, parsed.version, scope));
    }
  }
  return { components: dedupe(out), issues };
}

/** bun.lock is JSON with trailing commas; strip them outside strings, nothing else. */
function parseJsonWithTrailingCommas(text) {
  let out = ""; let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) { out += char; if (char === "\\") { out += text[index + 1] ?? ""; index += 1; } else if (char === "\"") inString = false; continue; }
    if (char === "\"") { inString = true; out += char; continue; }
    if (char === ",") { const rest = text.slice(index + 1).trimStart(); if (rest.startsWith("}") || rest.startsWith("]")) continue; }
    out += char;
  }
  return JSON.parse(out);
}
export function parseBunLock(text, path) {
  const lock = parseJsonWithTrailingCommas(text);
  if (lock === null || typeof lock !== "object" || !Number.isInteger(lock.lockfileVersion)) throw new Error("not a bun.lock");
  if (![0, 1, 2].includes(lock.lockfileVersion)) return { components: [], issues: [finding("unsupported", path, `bun.lock version ${lock.lockfileVersion} has no reader yet (known: 0 to 2)`)] };
  const out = []; const issues = [];
  const dev = new Set(Object.values(lock.workspaces ?? {}).flatMap((workspace) => Object.keys(workspace?.devDependencies ?? {})));
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") throw new Error(`${key}: package entry is not a tuple`);
    const { name, range } = descriptorName(entry[0]);
    if (/^(?:workspace|link):/u.test(range)) continue;
    if (SEMVER.test(range) && typeof entry[1] === "string") { out.push(npm(name, range, dev.has(key) ? "dev" : "required")); continue; }
    issues.push(finding("partial", path, `${name} is resolved from a git commit, a local path or a URL, not a registry version`));
  }
  return { components: dedupe(out), issues };
}

// ---------------------------------------------------------------------------------------------------------------- TOML (Cargo, Poetry, uv)

/**
 * The `[[package]]` blocks of a lockfile: for each, its top-level `key = value` lines and its `[package.<sub>]` tables, read line by
 * line. Multi-line strings are skipped as a whole, so a `name = ...` line inside a description is never read as the package name.
 */
export function tomlPackageBlocks(text) {
  const blocks = []; let current = null; let table = null; let multiline = null;
  for (const raw of text.split(/\r?\n/u)) {
    if (multiline !== null) { if (raw.split(multiline).length % 2 === 0) multiline = null; continue; }
    const line = raw.trimEnd();
    for (const quote of ['"""', "'''"]) if (line.split(quote).length % 2 === 0) { multiline = quote; break; }
    if (/^\s*#/u.test(line) || line.trim() === "") continue;
    if (/^\[\[package\]\]\s*$/u.test(line)) { current = { fields: {}, tables: {} }; table = current.fields; blocks.push(current); continue; }
    if (/^\[\[/u.test(line)) { table = null; continue; } // another array of tables (e.g. [[patch.unused]]) ends the package block
    const header = /^\[([^\]]+)\]\s*$/u.exec(line);
    if (header) { const sub = /^package\.(.+)$/u.exec(header[1]); table = current !== null && sub ? (current.tables[sub[1]] = {}) : null; continue; }
    const pair = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/u.exec(line);
    if (pair && table !== null && multiline === null) table[pair[1]] = pair[2];
  }
  return blocks;
}
const tomlString = (value) => (typeof value === "string" ? /^"((?:[^"\\]|\\.)*)"$/u.exec(value.trim())?.[1] ?? /^'([^']*)'$/u.exec(value.trim())?.[1] : undefined);
const inlineKeys = (value) => (typeof value === "string" && value.trim().startsWith("{") ? [...value.matchAll(/([A-Za-z0-9_-]+)\s*=/gu)].map((match) => match[1]) : []);
function namedVersion(block) {
  const name = tomlString(block.fields.name); const version = tomlString(block.fields.version);
  if (name === undefined || version === undefined) throw new Error("package block without a name and a version");
  return { name, version };
}
const pypiName = (name) => name.toLowerCase().replace(/[_.]+/gu, "-");

export function parseCargoLock(text, path) {
  const out = []; const issues = [];
  for (const block of tomlPackageBlocks(text)) {
    const { name, version } = namedVersion(block);
    const source = tomlString(block.fields.source);
    if (source === undefined) continue; // a path or workspace crate: the project itself
    if (!/^(?:registry|sparse)\+/u.test(source)) { issues.push(finding("partial", path, `${name} is pinned to a git commit, not a registry version`)); continue; }
    out.push(component("cargo", "cargo", name, version, "required"));
  }
  return { components: dedupe(out), issues };
}
export function parsePoetryLock(text, path) {
  const out = []; const issues = [];
  for (const block of tomlPackageBlocks(text)) {
    const { name, version } = namedVersion(block);
    const sourceType = tomlString(block.tables.source?.type);
    if (sourceType !== undefined && sourceType !== "legacy") { issues.push(finding("partial", path, `${name} comes from a ${sourceType} source, not a registry version`)); continue; }
    out.push(component("pypi", "pypi", pypiName(name), version, tomlString(block.fields.category) === "dev" ? "dev" : "required"));
  }
  return { components: dedupe(out), issues };
}
export function parseUvLock(text, path) {
  const format = /^version\s*=\s*(\d+)\s*$/mu.exec(text)?.[1];
  if (format === undefined) throw new Error("no lock format version");
  if (format !== "1") return { components: [], issues: [finding("unsupported", path, `uv.lock format ${format} has no reader yet (known: 1)`)] };
  const out = []; const issues = [];
  for (const block of tomlPackageBlocks(text)) {
    const kind = inlineKeys(block.fields.source)[0]; // only the first key names the source kind; later ones are its options
    if (kind === "virtual" || kind === "editable") continue; // the project or a workspace member
    const { name, version } = namedVersion(block);
    if (kind !== "registry") { issues.push(finding("partial", path, `${name} comes from ${kind === undefined ? "no recorded source" : `a ${kind} source`}, not a registry version`)); continue; }
    out.push(component("pypi", "pypi", pypiName(name), version, "required"));
  }
  return { components: dedupe(out), issues };
}

// ---------------------------------------------------------------------------------------------------------------- JVM

export function parseGradleLockfile(text, path) {
  const out = []; const testOnlyFile = /(?:^|\/)test[^/]*\.lockfile$/iu.test(path) && !path.endsWith("gradle.lockfile");
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("empty=")) continue;
    const match = /^([^:\s=]+):([^:\s=]+):([^:\s=]+)(?:=(.*))?$/u.exec(line);
    if (match === null) throw new Error(`a line that is no group:artifact:version entry: "${short(line)}"`);
    const configurations = (match[4] ?? "").split(",").filter(Boolean);
    const testOnly = configurations.length > 0 ? configurations.every((name) => /^test/iu.test(name)) : testOnlyFile;
    out.push(component("maven", "maven", `${match[1]}/${match[2]}`, match[3], testOnly ? "dev" : "required"));
  }
  return { components: dedupe(out), issues: [] };
}

const xmlText = (block, tag) => new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, "u").exec(block)?.[1];
/**
 * Maven pins no transitive dependency, so pom.xml is read only for its DIRECT dependencies: the `<dependency>` blocks outside
 * `<dependencyManagement>` and `<build>`, a version resolved from a literal or from this pom's own `<properties>` (anything else, a parent
 * or BOM managed version or a range, stays unresolved). The pom is always a `partial` finding unless a committed CycloneDX file covers
 * it (sbom-close.mjs applies mavenCoverage).
 */
export function readPomDependencies(text) {
  if (!/<project[\s/>]/u.test(text)) throw new Error("not a Maven pom");
  // C28e: a profile's dependencies are not part of the default build, so the build's CycloneDX file never lists them; they are not direct.
  const uncommented = text.replace(/<!--[\s\S]*?-->/gu, "").replace(/<profiles>[\s\S]*?<\/profiles>/gu, "");
  const body = uncommented.replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/gu, "").replace(/<build>[\s\S]*?<\/build>/gu, "").replace(/<parent>[\s\S]*?<\/parent>/gu, "");
  const properties = new Map();
  for (const block of uncommented.match(/<properties>[\s\S]*?<\/properties>/gu) ?? []) for (const match of block.matchAll(/<([A-Za-z0-9_.-]+)>\s*([^<]*?)\s*<\/\1>/gu)) properties.set(match[1], match[2]);
  const own = body.replace(/<dependencies>[\s\S]*?<\/dependencies>/gu, "");
  const parent = /<parent>([\s\S]*?)<\/parent>/u.exec(uncommented)?.[1] ?? "";
  for (const [key, value] of [
    ["project.groupId", xmlText(own, "groupId") ?? xmlText(parent, "groupId")], ["project.artifactId", xmlText(own, "artifactId")], ["project.version", xmlText(own, "version") ?? xmlText(parent, "version")],
    ["project.parent.groupId", xmlText(parent, "groupId")], ["project.parent.artifactId", xmlText(parent, "artifactId")], ["project.parent.version", xmlText(parent, "version")],
  ]) if (value !== undefined) properties.set(key, value);
  const resolve = (value) => { if (value === undefined) return null; const resolved = value.replace(/\$\{([^}]+)\}/gu, (whole, key) => properties.get(key) ?? whole); return /\$\{|[[\]()]|,/u.test(resolved) || resolved === "" ? null : resolved; };
  return (body.match(/<dependency>[\s\S]*?<\/dependency>/gu) ?? []).map((block) => {
    const rawGroup = xmlText(block, "groupId"); const rawArtifact = xmlText(block, "artifactId");
    if (rawGroup === undefined || rawArtifact === undefined) throw new Error("a dependency without a groupId and an artifactId");
    const groupId = resolve(rawGroup); const artifactId = resolve(rawArtifact);
    const scope = xmlText(block, "scope"); const optional = xmlText(block, "optional") === "true";
    // A name this pom cannot resolve keeps its raw text: it is never a component, and no CycloneDX file can be shown to cover it.
    return { name: `${groupId ?? rawGroup}/${artifactId ?? rawArtifact}`, version: groupId === null || artifactId === null ? null : resolve(xmlText(block, "version")), resolvedName: groupId !== null && artifactId !== null, scope: scope === "test" ? "dev" : optional || scope === "provided" ? "optional" : "required" };
  });
}
export function parsePomXml(text, path) {
  const direct = readPomDependencies(text);
  return { components: dedupe(direct.filter((entry) => entry.version !== null).map((entry) => component("maven", "maven", entry.name, entry.version, entry.scope))), issues: [], maven: { path, direct } };
}
/**
 * Which direct dependencies of a pom a CycloneDX file does not list: by name and version, or by name alone when the pom names no version.
 * C28e: a test-scope dependency is not required, because the cyclonedx-maven-plugin leaves the test scope out by default
 * (includeTestScope=false); a name part this pom cannot resolve (a property of the parent pom or of the build, e.g. a Scala binary
 * version suffix) matches any value in that part. Known limit: a version the parent or an imported BOM manages is matched by name only,
 * so a CycloneDX file from before a parent bump still covers the pom; nothing offline can see the new managed version.
 */
export function mavenCoverage(direct, cycloneComponents) {
  const maven = cycloneComponents.filter((entry) => entry.ecosystem === "maven");
  const listed = new Set(maven.map((entry) => `${entry.name}@${entry.version}`));
  const namePattern = (name) => new RegExp(`^${name.split(/\$\{[^}]+\}/u).map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("[^/]+")}$`, "u");
  const covered = (entry) => {
    if (entry.version !== null) return listed.has(`${entry.name}@${entry.version}`);
    const pattern = namePattern(entry.name);
    return maven.some((listedEntry) => pattern.test(listedEntry.name));
  };
  return direct.filter((entry) => entry.scope !== "dev" && !covered(entry)).map((entry) => `${entry.name}${entry.version === null ? "" : `@${entry.version}`}`);
}

// ---------------------------------------------------------------------------------------------------------------- .NET, Ruby, PHP, Dart, Swift, Elixir, C/C++

export function parseNugetLock(text, path) {
  const lock = JSON.parse(text);
  if (lock === null || typeof lock !== "object" || typeof lock.dependencies !== "object" || lock.dependencies === null) throw new Error("not a NuGet packages.lock.json");
  if (![1, 2].includes(lock.version)) return { components: [], issues: [finding("unsupported", path, `packages.lock.json version ${short(lock.version)} has no reader yet (known: 1 and 2)`)] };
  const out = [];
  for (const packages of Object.values(lock.dependencies)) for (const [name, entry] of Object.entries(packages ?? {})) {
    if (entry?.type === "Project") continue; // a project reference: the solution itself
    if (typeof entry?.resolved !== "string" || entry.resolved === "") throw new Error(`${name}: package without a resolved version`);
    out.push(component("nuget", "nuget", name, entry.resolved, "required"));
  }
  return { components: dedupe(out), issues: [] };
}

export function parseGemfileLock(text, path) {
  const out = []; const issues = []; let section = null; let inSpecs = false; let sawSection = false;
  for (const line of text.split(/\r?\n/u)) {
    if (/^[A-Z][A-Z ]*$/u.test(line)) { section = line.trim(); inSpecs = false; sawSection = true; continue; }
    if (line === "  specs:") { inSpecs = ["GEM", "GIT", "PATH", "PLUGIN SOURCE"].includes(section); continue; }
    if (!inSpecs) continue;
    const spec = /^ {4}([^\s(]+) \(([^)]+)\)$/u.exec(line);
    if (spec === null) { if (/^ {6}/u.test(line) || line.trim() === "") continue; throw new Error(`a specs line this reader cannot read: "${short(line)}"`); }
    if (section === "GEM") out.push(component("gem", "gem", spec[1], spec[2], "required"));
    else issues.push(finding("partial", path, `${spec[1]} comes from a ${section === "GIT" ? "git" : section === "PATH" ? "local path" : "plugin"} source, not a registry version`));
  }
  if (!sawSection) throw new Error("no Gemfile.lock section");
  return { components: dedupe(out), issues };
}

export function parseComposerLock(text, path) {
  const lock = JSON.parse(text);
  if (lock === null || typeof lock !== "object" || (!Array.isArray(lock.packages) && !Array.isArray(lock["packages-dev"]))) throw new Error("not a composer.lock");
  const out = []; const issues = [];
  for (const [list, scope] of [[lock.packages ?? [], "required"], [lock["packages-dev"] ?? [], "dev"]]) for (const entry of list) {
    if (typeof entry?.name !== "string" || typeof entry.version !== "string") throw new Error("package without a name and a version");
    if (entry.dist?.type === "path" || entry.source?.type === "path") { issues.push(finding("partial", path, `${entry.name} is a local path package, not a registry version`)); continue; }
    if (/^dev-|-dev$/u.test(entry.version)) { issues.push(finding("partial", path, `${entry.name} is pinned to a branch (${short(entry.version)}), not a released version`)); continue; }
    out.push(component("composer", "composer", entry.name, entry.version, scope));
  }
  return { components: dedupe(out), issues };
}

export function parsePubspecLock(text, path) {
  if (!/^packages:\s*(?:\{\})?\s*$/mu.test(text)) throw new Error("not a pubspec.lock");
  const out = []; const issues = []; let inPackages = false; let current = null;
  const flush = () => {
    if (current === null) return;
    const { name, fields } = current; current = null;
    if (fields.source === "sdk") return; // part of the Dart or Flutter SDK
    if (fields.source !== "hosted") { issues.push(finding("partial", path, `${name} comes from a ${fields.source ?? "unrecorded"} source, not a registry version`)); return; }
    if (typeof fields.version !== "string" || fields.version === "") throw new Error(`${name}: hosted package without a version`);
    out.push(component("pub", "pub", name, fields.version, fields.dependency === "direct dev" ? "dev" : "required"));
  };
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!line.startsWith(" ")) { flush(); inPackages = /^packages:/u.test(line); continue; }
    if (!inPackages) continue;
    const key = /^ {2}(?! )([^:\s]+):\s*$/u.exec(line);
    if (key) { flush(); current = { name: key[1], fields: {} }; continue; }
    const field = /^ {4}(?! )([a-z_]+):\s*(.*)$/u.exec(line);
    if (field && current) current.fields[field[1]] = field[2].trim().replace(/^"(.*)"$/u, "$1");
  }
  flush();
  return { components: dedupe(out), issues };
}

/** host/path of a source-control location, without scheme, credentials, port or `.git`; null when it is not one. */
function sourceLocation(location) {
  const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/u.exec(location);
  try {
    const { host, pathname } = scp ? { host: scp[1], pathname: `/${scp[2]}` } : new URL(location);
    const path = pathname.replace(/\.git$/u, "").replace(/\/+$/u, "");
    return host !== "" && path.length > 1 ? `${host.replace(/:\d+$/u, "")}${path}` : null;
  } catch { return null; }
}
export function parsePackageResolved(text, path) {
  const lock = JSON.parse(text);
  if (lock === null || typeof lock !== "object" || !Number.isInteger(lock.version)) throw new Error("not a Package.resolved");
  if (![1, 2, 3].includes(lock.version)) return { components: [], issues: [finding("unsupported", path, `Package.resolved version ${lock.version} has no reader yet (known: 1 to 3)`)] };
  const pins = lock.version === 1 ? lock.object?.pins : lock.pins;
  if (!Array.isArray(pins)) throw new Error("no pins");
  const out = []; const issues = [];
  for (const pin of pins) {
    const kind = lock.version === 1 ? "remoteSourceControl" : pin?.kind;
    const label = pin?.identity ?? pin?.package ?? "a package";
    const version = pin?.state?.version;
    if (kind === "registry" && typeof version === "string") { out.push(component("swift", "swift", String(pin.identity).replace(".", "/"), version, "required")); continue; }
    if (kind !== "remoteSourceControl") { issues.push(finding("partial", path, `${short(label)} is a local package, not a released version`)); continue; }
    if (typeof version !== "string" || version === "") { issues.push(finding("partial", path, `${short(label)} is pinned to a branch or a revision, not a released version`)); continue; }
    const location = sourceLocation(lock.version === 1 ? pin.repositoryURL : pin.location);
    out.push(component("swift", "swift", location ?? String(label), version, "required"));
  }
  return { components: dedupe(out), issues };
}

export function parseMixLock(text, path) {
  if (!text.trimStart().startsWith("%{")) throw new Error("not a mix.lock");
  const out = []; const issues = [];
  for (const line of text.split(/\r?\n/u)) {
    const entry = /^\s*"([^"]+)":\s*\{:(\w+),\s*(.*)$/u.exec(line);
    if (entry === null) { if (/^\s*(?:%\{|\}|)\s*$/u.test(line)) continue; throw new Error(`a line this reader cannot read: "${short(line)}"`); }
    if (entry[2] !== "hex") { issues.push(finding("partial", path, `${entry[1]} comes from a ${entry[2]} source, not a registry version`)); continue; }
    const hex = /^:([A-Za-z0-9_]+),\s*"([^"]+)"/u.exec(entry[3]);
    if (hex === null) throw new Error(`${entry[1]}: hex entry without a package and a version`);
    out.push(component("hex", "hex", hex[1], hex[2], "required"));
  }
  return { components: dedupe(out), issues };
}

const conanRef = (reference) => { const match = /^([^/@#%:\s]+)\/([^@#%:\s]+)/u.exec(String(reference)); if (match === null) throw new Error(`a reference this reader cannot read: "${short(reference)}"`); return match; };
export function parseConanLock(text, path) {
  const lock = JSON.parse(text);
  if (lock === null || typeof lock !== "object") throw new Error("not a conan.lock");
  const version = lock.version ?? lock.graph_lock?.version;
  const out = [];
  if (version === "0.5") {
    for (const [list, scope] of [[lock.requires, "required"], [lock.build_requires, "dev"], [lock.python_requires, "dev"]]) for (const reference of list ?? []) { const [, name, ref] = conanRef(reference); out.push(component("conan", "conan", name, ref, scope)); }
    return { components: dedupe(out), issues: [] };
  }
  if (version === "0.4") {
    const nodes = lock.graph_lock?.nodes;
    if (nodes === null || typeof nodes !== "object") throw new Error("no graph_lock nodes");
    const build = new Set(Object.values(nodes).flatMap((node) => node?.build_requires ?? []));
    for (const [id, node] of Object.entries(nodes)) {
      if (typeof node?.path === "string" || node?.ref === undefined) continue; // the consumer conanfile itself
      const [, name, ref] = conanRef(node.ref); out.push(component("conan", "conan", name, ref, build.has(id) ? "dev" : "required"));
    }
    return { components: dedupe(out), issues: [] };
  }
  return { components: [], issues: [finding("unsupported", path, `conan.lock version ${short(version)} has no reader yet (known: 0.4 and 0.5)`)] };
}

// ---------------------------------------------------------------------------------------------------------------- CycloneDX

/** A committed CycloneDX JSON file produced by the project's own build: every component needs a package URL. */
export function parseCycloneDx(text, path) {
  const bom = JSON.parse(text);
  if (bom === null || typeof bom !== "object" || bom.bomFormat !== "CycloneDX") throw new Error("not a CycloneDX JSON document");
  if (!/^1\.[2-6]$/u.test(String(bom.specVersion))) return { components: [], issues: [finding("unsupported", path, `CycloneDX ${short(bom.specVersion)} has no reader yet (known: 1.2 to 1.6)`)] };
  const out = []; const issues = [];
  const walk = (list) => {
    for (const entry of list ?? []) {
      if (entry?.scope === "excluded") continue;
      const purl = typeof entry?.purl === "string" ? entry.purl : null;
      const match = purl === null ? null : /^pkg:([a-z][a-z0-9.+-]*)\/(.+)@([^?#]+)/u.exec(purl);
      if (match === null) { issues.push(finding("partial", path, `component ${short(entry?.name ?? "without a name")} has no package URL with a version`)); walk(entry?.components); continue; }
      const name = decodeURIComponent(match[2]);
      out.push({ ecosystem: match[1] === "golang" ? "golang" : match[1], name, version: decodeURIComponent(match[3]), purl: purl.replace(/[?#].*$/u, ""), scope: entry.scope === "optional" ? "optional" : "required" });
      walk(entry.components);
    }
  };
  walk(bom.components);
  return { components: dedupe(out), issues };
}
