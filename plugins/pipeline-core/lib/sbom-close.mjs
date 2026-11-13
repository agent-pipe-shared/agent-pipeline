// SPDX-License-Identifier: SUL-1.0
/**
 * C28c (PO decision 2026-11-11): the SBOM is a standard part of the feature close and of the audit bundle.
 *
 * Pure and offline: the caller hands in the list of tracked paths and a reader for their text, so this module opens no file, runs no process
 * and uses no network or package manager. It reads LOCKFILES (what is pinned), never resolves anything itself:
 *   npm (package-lock.json, npm-shrinkwrap.json), Python (poetry.lock, Pipfile.lock, pinned requirements.txt), Go (go.mod), Rust (Cargo.lock),
 *   and since candidate 28d (sbom-lockfile-readers.mjs) yarn, pnpm, bun, uv, Gradle, NuGet, Bundler, Composer, pub, SwiftPM, Mix, Conan,
 *   a committed CycloneDX file, and Maven pom.xml for its direct dependencies (partial unless a CycloneDX file of the build covers it).
 * A manifest without a lockfile, an unpinned requirement or a lockfile format this module has no reader for is NAMED as a finding of a typed
 * state (`partial`, `unsupported`, `invalid`, `stale`); every such finding BLOCKS the close, unless the PO's signed override for exactly those findings is recorded.
 * No component at all is an explicit `not-applicable` record with its reason, never an absent file.
 * The component inventory is flat: dependency edges are not recorded (`edges: "not-recorded"`), so a document never claims a graph it did not read.
 */
import { createHash } from "node:crypto";
import { generateNodeSbom, NODE_GRAPH_SCHEMA } from "./sbom-node-adapter.mjs";
import { SBOM_LIFECYCLE_CODES } from "./sbom-manifest.mjs";
import {
  mavenCoverage, parseBunLock, parseCargoLock, parseComposerLock, parseConanLock, parseCycloneDx, parseGemfileLock, parseGradleLockfile, parseMixLock,
  parseNugetLock, parsePackageResolved, parsePnpmLock, parsePoetryLock, parsePomXml, parsePubspecLock, parseUvLock, parseYarnLock,
} from "./sbom-lockfile-readers.mjs";

export const SBOM_CLOSE_RECORD_SCHEMA = "pipeline.sbom-close-record.v1";
export const SBOM_CLOSE_STATUSES = Object.freeze(["complete", "not-applicable", "overridden"]);
export const SBOM_CLOSE_CODES = Object.freeze({ complete: "SBOM-COMPLETE", notApplicable: "SBOM-NOT-APPLICABLE", overridden: "SBOM-OVERRIDDEN" });
export const SBOM_DOCUMENT_FORMATS = Object.freeze(["cyclonedx-json", "spdx-json"]);
const DOCUMENT_FILES = Object.freeze({ "cyclonedx-json": "cyclonedx.json", "spdx-json": "spdx.json" });
const SHA = /^[a-f0-9]{64}$/u;
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

// Paths holding fixtures, vendored code, generated output or the pipeline's own working files are not the project's dependencies.
const IGNORED_SEGMENTS = new Set(["node_modules", "vendor", "third_party", "fixtures", "fixture", "__fixtures__", "testdata", "scratch", "specs", "docs", "examples", ".claude", ".git", "dist", "build", "target", ".venv", "venv"]);
// Dependency inputs no reader exists for yet (candidate 28d moved every other name of the first list to a reader).
const UNSUPPORTED_NAMES = new Set(["bun.lockb", "Podfile", "Podfile.lock", "build.sbt", "packages.config", "paket.lock", "pdm.lock", "pylock.toml", "vcpkg.json"]);

const baseName = (path) => path.slice(path.lastIndexOf("/") + 1);
const dirOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const ancestors = (dir) => { const out = [dir]; let current = dir; while (current !== "") { current = dirOf(current); out.push(current); } return out; };
const encodePart = (value) => encodeURIComponent(value).replace(/%2F/gu, "/");
const finding = (state, code, path, reason) => ({ state, code, path, reason });

function npmPurl(name, version) { return `pkg:npm/${name.startsWith("@") ? `%40${encodePart(name.slice(1))}` : encodePart(name)}@${encodeURIComponent(version)}`; }
function parseNpmLock(text, path) {
  const lock = JSON.parse(text);
  const out = [];
  if (lock !== null && typeof lock === "object" && lock.packages !== null && typeof lock.packages === "object") {
    for (const [key, entry] of Object.entries(lock.packages)) {
      if (key === "" || entry === null || typeof entry !== "object" || entry.link === true) continue;
      const at = key.lastIndexOf("node_modules/");
      if (at === -1) continue; // a workspace member of the project itself
      const name = typeof entry.name === "string" ? entry.name : key.slice(at + "node_modules/".length);
      if (typeof entry.version !== "string" || entry.version === "") throw new Error(`${path}: package without a version`);
      out.push({ ecosystem: "npm", name, version: entry.version, purl: npmPurl(name, entry.version), scope: entry.dev === true ? "dev" : entry.optional === true ? "optional" : "required" });
    }
    return { components: out, issues: [] };
  }
  if (lock !== null && typeof lock === "object" && lock.dependencies !== null && typeof lock.dependencies === "object") {
    const walk = (dependencies) => {
      for (const [name, entry] of Object.entries(dependencies)) {
        if (entry === null || typeof entry !== "object" || typeof entry.version !== "string") throw new Error(`${path}: dependency without a version`);
        out.push({ ecosystem: "npm", name, version: entry.version, purl: npmPurl(name, entry.version), scope: entry.dev === true ? "dev" : entry.optional === true ? "optional" : "required" });
        if (entry.dependencies !== undefined && entry.dependencies !== null && typeof entry.dependencies === "object") walk(entry.dependencies);
      }
    };
    walk(lock.dependencies);
    return { components: out, issues: [] };
  }
  if (lock !== null && typeof lock === "object" && (lock.packages !== undefined || lock.dependencies !== undefined || lock.lockfileVersion !== undefined)) return { components: out, issues: [] };
  throw new Error(`${path}: not an npm lockfile`);
}

// Cargo.lock and poetry.lock (and uv.lock) are read by sbom-lockfile-readers.mjs: one TOML block reader that skips multi-line strings.

function parsePipfileLock(text, path) {
  const lock = JSON.parse(text);
  if (lock === null || typeof lock !== "object" || Array.isArray(lock) || (lock.default === undefined && lock.develop === undefined)) throw new Error(`${path}: not a Pipfile.lock`);
  const out = []; const issues = [];
  for (const [section, scope] of [["default", "required"], ["develop", "dev"]]) {
    for (const [rawName, entry] of Object.entries(lock[section] ?? {})) {
      const version = typeof entry?.version === "string" ? /^==\s*(\S+)$/u.exec(entry.version)?.[1] : undefined;
      if (version === undefined) { issues.push(finding("partial", SBOM_LIFECYCLE_CODES.partial, path, `${rawName} has no pinned version (a git, path or url requirement)`)); continue; }
      const name = rawName.toLowerCase().replace(/_/gu, "-");
      out.push({ ecosystem: "pypi", name, version, purl: `pkg:pypi/${encodePart(name)}@${encodeURIComponent(version)}`, scope });
    }
  }
  return { components: out, issues };
}

function parseRequirements(text, path) {
  const out = []; const issues = [];
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.replace(/(^|\s)#.*$/u, "").trim();
    if (line === "") continue;
    if (line.startsWith("-")) { issues.push(finding("partial", SBOM_LIFECYCLE_CODES.partial, path, `the option line "${line.slice(0, 60)}" pulls in requirements this reader does not follow`)); continue; }
    const pinned = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*==\s*([A-Za-z0-9][A-Za-z0-9._+!-]*)(?:\s*;.*)?$/u.exec(line);
    if (pinned === null) { issues.push(finding("partial", SBOM_LIFECYCLE_CODES.partial, path, `the requirement "${line.slice(0, 60)}" is not pinned with ==`)); continue; }
    const name = pinned[1].toLowerCase().replace(/_/gu, "-");
    out.push({ ecosystem: "pypi", name, version: pinned[2], purl: `pkg:pypi/${encodePart(name)}@${encodeURIComponent(pinned[2])}`, scope: "required" });
  }
  return { components: out, issues };
}

function parseGoMod(text, path) {
  const out = []; let inBlock = false; let sawModule = false;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (/^module\s/u.test(line)) sawModule = true;
    if (/^require\s*\($/u.test(line)) { inBlock = true; continue; }
    if (inBlock && line === ")") { inBlock = false; continue; }
    const body = inBlock ? line : /^require\s+(\S.*)$/u.exec(line)?.[1];
    if (body === undefined || body === "" || body.startsWith("//")) continue;
    const match = /^(\S+)\s+(v\S+?)(\s*\/\/.*)?$/u.exec(body);
    if (match === null) continue;
    out.push({ ecosystem: "golang", name: match[1], version: match[2], purl: `pkg:golang/${encodePart(match[1])}@${encodeURIComponent(match[2])}`, scope: /\/\/\s*indirect/u.test(match[3] ?? "") ? "indirect" : "required" });
  }
  if (!sawModule) throw new Error(`${path}: not a go.mod`);
  return { components: out, issues: [] };
}

// file name -> reader. Adding an ecosystem is adding a row here (and a test), never a branch elsewhere.
export const SBOM_READERS = Object.freeze({
  "package-lock.json": parseNpmLock, "npm-shrinkwrap.json": parseNpmLock, "Cargo.lock": parseCargoLock, "poetry.lock": parsePoetryLock,
  "Pipfile.lock": parsePipfileLock, "requirements.txt": parseRequirements, "go.mod": parseGoMod,
  // Candidate 28d.
  "yarn.lock": parseYarnLock, "pnpm-lock.yaml": parsePnpmLock, "bun.lock": parseBunLock, "uv.lock": parseUvLock,
  "gradle.lockfile": parseGradleLockfile, "buildscript-gradle.lockfile": parseGradleLockfile, "packages.lock.json": parseNugetLock,
  "Gemfile.lock": parseGemfileLock, "gems.locked": parseGemfileLock, "composer.lock": parseComposerLock, "pubspec.lock": parsePubspecLock,
  "Package.resolved": parsePackageResolved, "mix.lock": parseMixLock, "conan.lock": parseConanLock, "pom.xml": parsePomXml, "bom.json": parseCycloneDx,
});
// Readers chosen by a path pattern instead of an exact file name (a pattern row, still not a branch elsewhere).
const SBOM_READER_PATTERNS = Object.freeze([[/\.cdx\.json$/u, parseCycloneDx, "CycloneDX"], [/(?:^|\/)gradle\/dependency-locks\/[^/]+\.lockfile$/u, parseGradleLockfile, "Gradle dependency-locks"]]);
function readerFor(path) {
  const name = baseName(path);
  if (SBOM_READERS[name] !== undefined) return { reader: SBOM_READERS[name], label: name };
  const pattern = SBOM_READER_PATTERNS.find(([test]) => test.test(path));
  return pattern === undefined ? null : { reader: pattern[1], label: pattern[2] };
}
const isCycloneDx = (reader) => reader === parseCycloneDx;

const hasKeys = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
const MANIFEST_NEEDS = Object.freeze({
  "package.json": ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock"], "Cargo.toml": ["Cargo.lock"],
  "pyproject.toml": ["poetry.lock", "Pipfile.lock", "requirements.txt", "uv.lock"], Pipfile: ["Pipfile.lock"],
  Gemfile: ["Gemfile.lock"], "gems.rb": ["gems.locked"], "composer.json": ["composer.lock"], "pubspec.yaml": ["pubspec.lock"], "mix.exs": ["mix.lock"],
  "Package.swift": ["Package.resolved"], "build.gradle": ["gradle.lockfile"], "build.gradle.kts": ["gradle.lockfile"],
  "conanfile.txt": ["conan.lock"], "conanfile.py": ["conan.lock"],
});
const PROJECT_FILE = /\.(?:csproj|fsproj|vbproj)$/u; // a .NET project: its lockfile is packages.lock.json next to it
const manifestNeeds = (name) => MANIFEST_NEEDS[name] ?? (PROJECT_FILE.test(name) ? ["packages.lock.json"] : undefined);
const LOCKFILE_NAMES = new Set([...Object.values(MANIFEST_NEEDS).flat(), "packages.lock.json"].filter((name) => name !== "requirements.txt"));
function manifestDeclaresDependencies(name, text) {
  if (name === "package.json") { try { const value = JSON.parse(text); return ["dependencies", "devDependencies", "optionalDependencies"].some((key) => hasKeys(value?.[key])); } catch { return false; } }
  if (name === "Cargo.toml") return /^\[(?:[A-Za-z0-9_.-]*\.)?(?:dependencies|dev-dependencies|build-dependencies)\]/mu.test(text);
  if (name === "pyproject.toml") return /^dependencies\s*=\s*\[\s*"/mu.test(text) || /^\[tool\.poetry\.dependencies\]/mu.test(text);
  if (name === "Gemfile" || name === "gems.rb") return /^\s*gem\s+["']/mu.test(text);
  if (name === "composer.json") { try { const value = JSON.parse(text); return ["require", "require-dev"].some((key) => Object.keys(value?.[key] ?? {}).some((dep) => dep.includes("/"))); } catch { return false; } }
  if (name === "pubspec.yaml") return /^(?:dev_)?dependencies:\s*\n(?:\s*#.*\n)*\s+[A-Za-z_]/mu.test(text);
  if (name === "mix.exs") return /\{:[a-z_]+,\s*(?:"|github:|git:|path:)/u.test(text);
  if (name === "Package.swift") return /\.package\s*\(/u.test(text);
  if (name === "build.gradle" || name === "build.gradle.kts") return /^\s*dependencies\s*\{[^}]*\b(?:implementation|api|compile|runtimeOnly|compileOnly|testImplementation|annotationProcessor|kapt)\b/mu.test(text);
  if (name === "conanfile.txt") return /^\[(?:requires|tool_requires|build_requires)\]\s*\n\s*[A-Za-z0-9_]/mu.test(text);
  if (name === "conanfile.py") return /\b(?:requires|tool_requires|build_requires)\s*=|self\.(?:requires|tool_requires)\s*\(/u.test(text);
  if (PROJECT_FILE.test(name)) return /<PackageReference\b/u.test(text);
  return /^\[(?:packages|dev-packages)\]\s*\n\s*[A-Za-z0-9"']/mu.test(text);
}

/** Observe the tracked dependency inputs. `read(path)` returns the file text, or null when it cannot be read. */
export function observeSbomInputs({ tracked, read }) {
  const paths = [...new Set(tracked)].filter((path) => typeof path === "string" && path !== "" && !path.split("/").some((part) => IGNORED_SEGMENTS.has(part))).sort();
  const inputs = []; const ecosystems = []; const findings = []; const components = []; const seen = new Set();
  const poms = []; const cyclone = []; // Maven poms wait until every CycloneDX file is read (mavenCoverage below)
  const lockDirs = new Map(); // lockfile name -> directories holding it
  for (const path of paths) { const name = baseName(path); if (LOCKFILE_NAMES.has(name)) { if (!lockDirs.has(name)) lockDirs.set(name, new Set()); lockDirs.get(name).add(dirOf(path)); } }
  const legacyGradleLocks = new Set(paths.filter((path) => /(?:^|\/)gradle\/dependency-locks\/[^/]+\.lockfile$/u.test(path)).map((path) => dirOf(dirOf(dirOf(path)))));
  // C28e: a Gradle or NuGet lockfile belongs to exactly one project (`--write-locks` on the root locks only the root project), so it covers
  // only the build or project file in its own directory; the workspace lockfiles of the other ecosystems also cover the directories below.
  const PER_PROJECT = new Set(["gradle.lockfile", "packages.lock.json"]);
  const lockCovers = (needs, dir) => needs.some((name) => (PER_PROJECT.has(name) ? [dir] : ancestors(dir)).some((candidate) => lockDirs.get(name)?.has(candidate)))
    || (needs.includes("gradle.lockfile") && legacyGradleLocks.has(dir));
  const unsupportedDirs = new Set(paths.filter((path) => UNSUPPORTED_NAMES.has(baseName(path))).map(dirOf));
  const record = (path, label, parsed) => {
    findings.push(...parsed.issues);
    ecosystems.push({ path, reader: label, components: parsed.components.length });
    for (const component of parsed.components) { if (!seen.has(component.purl)) { seen.add(component.purl); components.push({ ...component, provenance: path }); } }
  };
  for (const path of paths) {
    const name = baseName(path);
    if (UNSUPPORTED_NAMES.has(name)) { findings.push(finding("unsupported", SBOM_LIFECYCLE_CODES.unsupported, path, `no reader exists yet for ${name}`)); continue; }
    const chosen = readerFor(path);
    if (chosen !== null) {
      const raw = read(path);
      if (typeof raw !== "string") { findings.push(finding("invalid", SBOM_LIFECYCLE_CODES.invalidRecord, path, "the file could not be read")); continue; }
      const text = raw.replace(/^﻿/u, ""); // C28e: Windows tools write a UTF-8 byte-order mark; the digest below still binds the raw bytes
      // A file merely NAMED bom.json is an input only when it is a CycloneDX document; a *.cdx.json file must be one. C28e: a bom.json that
      // is not JSON at all is invalid, never skipped (skipping it made a pom report "no CycloneDX file covers" for a damaged one).
      if (name === "bom.json") {
        let probe; try { probe = JSON.parse(text); } catch (error) { findings.push(finding("invalid", SBOM_LIFECYCLE_CODES.invalidRecord, path, `the file is not readable as JSON: ${String(error.message).slice(0, 160)}`)); continue; }
        if (probe?.bomFormat !== "CycloneDX") continue;
      }
      inputs.push({ path, sha256: sha256(raw) });
      let parsed;
      try { parsed = chosen.reader(text, path); } catch (error) { findings.push(finding("invalid", SBOM_LIFECYCLE_CODES.invalidRecord, path, `the file is not readable as ${chosen.label}: ${String(error.message).slice(0, 160)}`)); continue; }
      if (parsed.maven !== undefined) { poms.push({ path, parsed }); continue; }
      if (isCycloneDx(chosen.reader)) cyclone.push({ dir: dirOf(path), components: parsed.components });
      record(path, chosen.label, parsed);
      continue;
    }
    const needs = manifestNeeds(name);
    if (needs === undefined) continue;
    const dir = dirOf(path);
    if (lockCovers(needs, dir) || ancestors(dir).some((candidate) => unsupportedDirs.has(candidate)) || (name === "pyproject.toml" && paths.some((other) => baseName(other) === "requirements.txt" && dirOf(other) === dir))) continue;
    const text = read(path);
    if (typeof text !== "string") { findings.push(finding("invalid", SBOM_LIFECYCLE_CODES.invalidRecord, path, "the file could not be read")); continue; }
    if (manifestDeclaresDependencies(name, text.replace(/^﻿/u, ""))) findings.push(finding("partial", SBOM_LIFECYCLE_CODES.partial, path, `${name} declares dependencies but no lockfile pins them (${needs.join(" or ")})`));
  }
  // Maven: a pom lists its direct dependencies only. It is complete when a CycloneDX file in its directory or an ancestor lists every one of
  // them (by version where the pom fixes one); otherwise it is partial and names what is missing, so a stale CycloneDX file does not pass.
  for (const { path, parsed } of poms) {
    record(path, "pom.xml", parsed);
    const direct = parsed.maven.direct;
    if (direct.length === 0) continue;
    const covering = cyclone.filter((entry) => ancestors(dirOf(path)).includes(entry.dir));
    const missing = covering.length === 0 ? null : mavenCoverage(direct, covering.flatMap((entry) => entry.components));
    if (missing !== null && missing.length === 0) continue;
    findings.push(finding("partial", SBOM_LIFECYCLE_CODES.partial, path, missing === null
      ? "Maven pins no transitive dependency and no CycloneDX file of the build covers this pom"
      : `the CycloneDX file of the build does not list ${missing.length} direct dependenc${missing.length === 1 ? "y" : "ies"} of this pom (${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""})`));
  }
  const byScope = (left, right) => (left.scope === right.scope ? 0 : left.scope === "required" ? -1 : right.scope === "required" ? 1 : 0);
  components.sort((left, right) => byScope(left, right) || (left.purl < right.purl ? -1 : left.purl > right.purl ? 1 : 0));
  return { inputs, ecosystems, components, findings };
}

/** What the person at the close is told for one finding: how to remove the cause, and how an adapter can be added. */
export function sbomFindingHelp(item) {
  if (item.state === "unsupported") return `Add a reader: one function from the file's text to { ecosystem, name, version, purl, scope } components, registered by file name in SBOM_READERS (plugins/pipeline-core/lib/sbom-close.mjs), with a test in sbom-close.test.mjs. Until it exists, generate the SBOM with your own tool and have the PO sign the override.`;
  if (item.state === "partial") {
    const name = baseName(String(item.path ?? ""));
    if (name === "pom.xml") return "Maven pins no transitive dependency. Generate a CycloneDX file with your build (the cyclonedx-maven-plugin, goal makeAggregateBom or makeBom, writes bom.json into target/ by default, which the close does not read: set outputDirectory to ${project.basedir}), commit it next to pom.xml or in a parent directory, make sure it lists every direct dependency of this pom outside the test scope, and run the close again. Otherwise the PO signs the override.";
    if (name === "build.gradle" || name === "build.gradle.kts") return "Enable Gradle dependency locking for every project (allprojects { dependencyLocking { lockAllConfigurations() } }), write the locks of each project (gradle dependencies --write-locks runs for the root project only; run it per subproject or with a task that resolves all configurations), commit each project's gradle.lockfile next to its build file, and run the close again.";
    if (PROJECT_FILE.test(name)) return "Enable the NuGet lockfile (<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>), restore once, commit packages.lock.json next to the project file, and run the close again.";
    return "Pin the dependencies in a lockfile a reader knows (package-lock.json, npm-shrinkwrap.json, yarn.lock, pnpm-lock.yaml, bun.lock, Cargo.lock, poetry.lock, Pipfile.lock, uv.lock, requirements.txt with ==, go.mod, gradle.lockfile, packages.lock.json, Gemfile.lock, composer.lock, pubspec.lock, Package.resolved, mix.lock, conan.lock), commit it, and run the close again. A dependency pinned to a git commit, a local path or a URL stays partial until it comes from a registry; otherwise the PO signs the override.";
  }
  if (item.state === "stale") return "The recorded SBOM no longer matches the lockfiles. Remove the sbom directory named in the finding (the close writes a fresh one from the current lockfiles) and run the close again.";
  return "Repair or remove the named file, then run the close again.";
}

const objectOf = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => objectOf(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
/** The closed shape of the record the close writes and the bundle verifier re-checks. */
export function sbomCloseRecordShape(value) {
  if (!exact(value, ["schema", "status", "code", "reason", "sourceInputs", "ecosystems", "componentCount", "edges", "documents", "override"])) return false;
  const codeFor = { complete: SBOM_CLOSE_CODES.complete, "not-applicable": SBOM_CLOSE_CODES.notApplicable, overridden: SBOM_CLOSE_CODES.overridden };
  if (value.schema !== SBOM_CLOSE_RECORD_SCHEMA || !SBOM_CLOSE_STATUSES.includes(value.status) || value.code !== codeFor[value.status] || typeof value.reason !== "string" || value.reason === "" || value.edges !== "not-recorded") return false;
  if (!Array.isArray(value.sourceInputs) || !value.sourceInputs.every((entry) => exact(entry, ["path", "sha256"]) && typeof entry.path === "string" && SHA.test(entry.sha256))) return false;
  if (!Array.isArray(value.ecosystems) || !value.ecosystems.every((entry) => exact(entry, ["path", "reader", "components"]) && typeof entry.path === "string" && typeof entry.reader === "string" && Number.isSafeInteger(entry.components) && entry.components >= 0)) return false;
  if (!Number.isSafeInteger(value.componentCount) || value.componentCount < 0) return false;
  if (!Array.isArray(value.documents) || !value.documents.every((entry) => exact(entry, ["format", "path", "sha256"]) && SBOM_DOCUMENT_FORMATS.includes(entry.format) && typeof entry.path === "string" && SHA.test(entry.sha256))) return false;
  if (value.documents.length !== 0 && value.documents.length !== SBOM_DOCUMENT_FORMATS.length) return false;
  if ((value.componentCount === 0) !== (value.documents.length === 0)) return false;
  if (value.status === "not-applicable" && (value.componentCount !== 0 || value.override !== null)) return false;
  if (value.status === "complete" && (value.componentCount === 0 || value.override !== null)) return false;
  if (value.status === "overridden") return exact(value.override, ["statement", "actor", "blocked", "authority"]) && typeof value.override.statement === "string" && value.override.statement !== "" && typeof value.override.actor === "string" && value.override.actor !== ""
    && Array.isArray(value.override.blocked) && value.override.blocked.length > 0 && value.override.blocked.every((entry) => exact(entry, ["state", "code", "path", "reason"]) && Object.values(entry).every((part) => typeof part === "string"))
    && exact(value.override.authority, ["kind", "keyReference", "intentSha256", "proofSha256", "candidateCommit"]) && value.override.authority.kind === "po-signature" && typeof value.override.authority.keyReference === "string" && value.override.authority.keyReference !== ""
    && SHA.test(value.override.authority.intentSha256) && SHA.test(value.override.authority.proofSha256) && /^[a-f0-9]{40,64}$/u.test(value.override.authority.candidateCommit);
  return true;
}

function documentsFor(observed, featureId, evidenceDir) {
  const graph = { schema: NODE_GRAPH_SCHEMA, components: observed.components.map((component) => ({ id: component.purl, scope: component.scope, provenance: component.provenance, name: component.name, version: component.version, dependencies: [] })) };
  const generated = generateNodeSbom(graph);
  if (generated.valid !== true) return { error: generated.code };
  const named = { "cyclonedx-json": { ...generated.cyclonedx, metadata: { component: { type: "application", name: featureId } } }, "spdx-json": { ...generated.spdx, name: featureId } };
  return {
    files: SBOM_DOCUMENT_FORMATS.map((format) => { const text = `${JSON.stringify(named[format], null, 2)}\n`; return { format, path: `${evidenceDir}/sbom/${DOCUMENT_FILES[format]}`, text, sha256: sha256(text) }; }),
  };
}

/**
 * The close's SBOM step. Returns { status: "ready", record, files, reused } or { status: "blocked", blocks }.
 * `existing` is the text of a record already on disk (or null). `override` (a statement) and `authority` (the verified PO signature, see sbom-override-authority.mjs) come together or not at all: the
 * caller verifies the signature against the blocked findings first, so this function never decides authority; it only records it, with the `actor` who ran the close.
 * An existing record whose inputs, shape or documents no longer match is `stale` or `invalid` and blocks like any other finding.
 */
export function closeSbom({ featureId, evidenceDir, tracked, read, existing = null, override = null, authority = null, actor = null }) {
  const observed = observeSbomInputs({ tracked, read });
  const blocks = [...observed.findings];
  const recordPath = `${evidenceDir}/sbom/record.json`;
  let reusable = null;
  if (existing !== null) {
    let record = null; try { record = JSON.parse(existing); } catch { record = null; }
    if (!sbomCloseRecordShape(record)) blocks.push(finding("invalid", SBOM_LIFECYCLE_CODES.invalidRecord, recordPath, "the recorded SBOM is not a valid close record"));
    else if (JSON.stringify(record.sourceInputs) !== JSON.stringify(observed.inputs)) blocks.push(finding("stale", SBOM_LIFECYCLE_CODES.sourceInputsStale, recordPath, "the lockfiles changed after the SBOM was recorded"));
    else if (!record.documents.every((entry) => { const text = read(entry.path); return typeof text === "string" && sha256(text) === entry.sha256; })) blocks.push(finding("invalid", SBOM_LIFECYCLE_CODES.invalidRecord, recordPath, "a recorded SBOM document is missing or changed"));
    else reusable = record;
  }
  // A record that already carries a human's override keeps covering exactly the findings it names, so a resumed close needs no second override.
  const coveredByRecord = reusable?.status === "overridden" && blocks.every((block) => reusable.override.blocked.some((named) => named.state === block.state && named.code === block.code && named.path === block.path));
  if (reusable !== null && (blocks.length === 0 || coveredByRecord)) return { status: "ready", record: reusable, recordPath, files: [], reused: true, blocks: [] };
  if (blocks.length > 0 && (override === null || authority === null)) return { status: "blocked", blocks, recordPath };
  const documents = observed.components.length === 0 ? { files: [] } : documentsFor(observed, featureId, evidenceDir);
  if (documents.error !== undefined) return { status: "blocked", blocks: [...blocks, finding("invalid", SBOM_LIFECYCLE_CODES.invalidFacts, recordPath, `the SBOM documents could not be generated (${documents.error})`)], recordPath };
  const overridden = blocks.length > 0;
  const record = {
    schema: SBOM_CLOSE_RECORD_SCHEMA,
    status: overridden ? "overridden" : observed.components.length === 0 ? "not-applicable" : "complete",
    code: overridden ? SBOM_CLOSE_CODES.overridden : observed.components.length === 0 ? SBOM_CLOSE_CODES.notApplicable : SBOM_CLOSE_CODES.complete,
    reason: overridden ? `${blocks.length} finding(s) blocked the SBOM; the PO's signed override is recorded` : observed.components.length === 0 ? (observed.inputs.length === 0 ? "no dependency manifest or lockfile is tracked in this repository" : "the tracked lockfiles list no component") : `${observed.components.length} component(s) read from ${observed.ecosystems.length} lockfile(s)`,
    sourceInputs: observed.inputs, ecosystems: observed.ecosystems, componentCount: observed.components.length, edges: "not-recorded",
    documents: documents.files.map(({ format, path, sha256: digest }) => ({ format, path, sha256: digest })),
    override: overridden ? { statement: override, actor, blocked: blocks.map(({ state, code, path, reason }) => ({ state, code, path, reason })), authority } : null,
  };
  if (!sbomCloseRecordShape(record)) return { status: "blocked", blocks: [...blocks, finding("invalid", SBOM_LIFECYCLE_CODES.invalidFacts, recordPath, "the SBOM close record could not be formed")], recordPath };
  return { status: "ready", record, recordPath, files: [...documents.files.map(({ path, text }) => ({ path, text })), { path: recordPath, text: `${JSON.stringify(record, null, 2)}\n` }], reused: false, blocks };
}
