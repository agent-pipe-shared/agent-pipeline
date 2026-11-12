// SPDX-License-Identifier: SUL-1.0
/**
 * C28c (PO decision 2026-11-11): the SBOM is a standard part of the feature close and of the audit bundle.
 *
 * Pure and offline: the caller hands in the list of tracked paths and a reader for their text, so this module opens no file, runs no process
 * and uses no network or package manager. It reads LOCKFILES (what is pinned), never resolves anything itself:
 *   npm (package-lock.json, npm-shrinkwrap.json), Python (poetry.lock, Pipfile.lock, pinned requirements.txt), Go (go.mod), Rust (Cargo.lock).
 * A manifest without a lockfile, an unpinned requirement or a lockfile format this module has no reader for is NAMED as a finding of a typed
 * state (`partial`, `unsupported`, `invalid`, `stale`); every such finding BLOCKS the close, unless a human's literal override is recorded.
 * No component at all is an explicit `not-applicable` record with its reason, never an absent file.
 * The component inventory is flat: dependency edges are not recorded (`edges: "not-recorded"`), so a document never claims a graph it did not read.
 */
import { createHash } from "node:crypto";
import { generateNodeSbom, NODE_GRAPH_SCHEMA } from "./sbom-node-adapter.mjs";
import { SBOM_LIFECYCLE_CODES } from "./sbom-manifest.mjs";

export const SBOM_CLOSE_RECORD_SCHEMA = "pipeline.sbom-close-record.v1";
export const SBOM_CLOSE_STATUSES = Object.freeze(["complete", "not-applicable", "overridden"]);
export const SBOM_CLOSE_CODES = Object.freeze({ complete: "SBOM-COMPLETE", notApplicable: "SBOM-NOT-APPLICABLE", overridden: "SBOM-OVERRIDDEN" });
export const SBOM_DOCUMENT_FORMATS = Object.freeze(["cyclonedx-json", "spdx-json"]);
const DOCUMENT_FILES = Object.freeze({ "cyclonedx-json": "cyclonedx.json", "spdx-json": "spdx.json" });
const SHA = /^[a-f0-9]{64}$/u;
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

// Paths holding fixtures, vendored code, generated output or the pipeline's own working files are not the project's dependencies.
const IGNORED_SEGMENTS = new Set(["node_modules", "vendor", "third_party", "fixtures", "fixture", "__fixtures__", "testdata", "scratch", "specs", "docs", "examples", ".claude", ".git", "dist", "build", "target", ".venv", "venv"]);
const UNSUPPORTED_NAMES = new Set(["yarn.lock", "pnpm-lock.yaml", "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "Gemfile.lock", "composer.json", "composer.lock", "pubspec.yaml", "mix.exs", "Package.swift", "uv.lock", "bun.lock", "bun.lockb", "packages.lock.json"]);
const UNSUPPORTED_EXTENSIONS = /\.(?:csproj|fsproj|vbproj)$/u;

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

// Cargo.lock and poetry.lock share the `[[package]]` block form; only the lines before the block's first sub-table are read.
function tomlPackages(text, { skipWithoutSource }) {
  const out = [];
  for (const block of text.split(/^\[\[package\]\]\s*$/mu).slice(1)) {
    const head = block.split(/^\[/mu)[0];
    const name = /^name\s*=\s*"([^"\n]+)"\s*$/mu.exec(head)?.[1];
    const version = /^version\s*=\s*"([^"\n]+)"\s*$/mu.exec(head)?.[1];
    if (name === undefined || version === undefined) throw new Error("package block without a name and a version");
    if (skipWithoutSource && !/^source\s*=/mu.test(head)) continue; // a path or workspace crate: the project itself
    out.push({ name, version, category: /^category\s*=\s*"([^"\n]+)"/mu.exec(head)?.[1] ?? null });
  }
  return out;
}
function parseCargoLock(text) { return { components: tomlPackages(text, { skipWithoutSource: true }).map(({ name, version }) => ({ ecosystem: "cargo", name, version, purl: `pkg:cargo/${encodePart(name)}@${encodeURIComponent(version)}`, scope: "required" })), issues: [] }; }
function parsePoetryLock(text) { return { components: tomlPackages(text, { skipWithoutSource: false }).map(({ name, version, category }) => ({ ecosystem: "pypi", name: name.toLowerCase().replace(/_/gu, "-"), version, purl: `pkg:pypi/${encodePart(name.toLowerCase().replace(/_/gu, "-"))}@${encodeURIComponent(version)}`, scope: category === "dev" ? "dev" : "required" })), issues: [] }; }

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
});

const hasKeys = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
const MANIFEST_NEEDS = Object.freeze({ "package.json": ["package-lock.json", "npm-shrinkwrap.json"], "Cargo.toml": ["Cargo.lock"], "pyproject.toml": ["poetry.lock", "Pipfile.lock", "requirements.txt"], Pipfile: ["Pipfile.lock"] });
function manifestDeclaresDependencies(name, text) {
  if (name === "package.json") { try { const value = JSON.parse(text); return ["dependencies", "devDependencies", "optionalDependencies"].some((key) => hasKeys(value?.[key])); } catch { return false; } }
  if (name === "Cargo.toml") return /^\[(?:[A-Za-z0-9_.-]*\.)?(?:dependencies|dev-dependencies|build-dependencies)\]/mu.test(text);
  if (name === "pyproject.toml") return /^dependencies\s*=\s*\[\s*"/mu.test(text) || /^\[tool\.poetry\.dependencies\]/mu.test(text);
  return /^\[(?:packages|dev-packages)\]\s*\n\s*[A-Za-z0-9"']/mu.test(text);
}

/** Observe the tracked dependency inputs. `read(path)` returns the file text, or null when it cannot be read. */
export function observeSbomInputs({ tracked, read }) {
  const paths = [...new Set(tracked)].filter((path) => typeof path === "string" && path !== "" && !path.split("/").some((part) => IGNORED_SEGMENTS.has(part))).sort();
  const inputs = []; const ecosystems = []; const findings = []; const components = []; const seen = new Set();
  const lockDirs = new Map(); // lockfile name -> directories holding it
  for (const path of paths) { const name = baseName(path); if (SBOM_READERS[name] !== undefined && name !== "requirements.txt" && name !== "go.mod") { if (!lockDirs.has(name)) lockDirs.set(name, new Set()); lockDirs.get(name).add(dirOf(path)); } }
  const lockCovers = (needs, dir) => needs.some((name) => ancestors(dir).some((candidate) => lockDirs.get(name)?.has(candidate)));
  const unsupportedDirs = new Set(paths.filter((path) => UNSUPPORTED_NAMES.has(baseName(path)) || UNSUPPORTED_EXTENSIONS.test(path)).map(dirOf));
  for (const path of paths) {
    const name = baseName(path);
    if (UNSUPPORTED_NAMES.has(name) || UNSUPPORTED_EXTENSIONS.test(name)) { findings.push(finding("unsupported", SBOM_LIFECYCLE_CODES.unsupported, path, `no reader exists yet for ${name}`)); continue; }
    const reader = SBOM_READERS[name];
    if (reader !== undefined) {
      const text = read(path);
      if (typeof text !== "string") { findings.push(finding("invalid", SBOM_LIFECYCLE_CODES.invalidRecord, path, "the file could not be read")); continue; }
      inputs.push({ path, sha256: sha256(text) });
      let parsed;
      try { parsed = reader(text, path); } catch (error) { findings.push(finding("invalid", SBOM_LIFECYCLE_CODES.invalidRecord, path, `the file is not readable as ${name}: ${String(error.message).slice(0, 160)}`)); continue; }
      findings.push(...parsed.issues);
      ecosystems.push({ path, reader: name, components: parsed.components.length });
      for (const component of parsed.components) { if (!seen.has(component.purl)) { seen.add(component.purl); components.push({ ...component, provenance: path }); } }
      continue;
    }
    const needs = MANIFEST_NEEDS[name];
    if (needs === undefined) continue;
    const dir = dirOf(path);
    if (lockCovers(needs, dir) || ancestors(dir).some((candidate) => unsupportedDirs.has(candidate)) || (name === "pyproject.toml" && paths.some((other) => baseName(other) === "requirements.txt" && dirOf(other) === dir))) continue;
    const text = read(path);
    if (typeof text !== "string") { findings.push(finding("invalid", SBOM_LIFECYCLE_CODES.invalidRecord, path, "the file could not be read")); continue; }
    if (manifestDeclaresDependencies(name, text)) findings.push(finding("partial", SBOM_LIFECYCLE_CODES.partial, path, `${name} declares dependencies but no lockfile pins them (${needs.join(" or ")})`));
  }
  const byScope = (left, right) => (left.scope === right.scope ? 0 : left.scope === "required" ? -1 : right.scope === "required" ? 1 : 0);
  components.sort((left, right) => byScope(left, right) || (left.purl < right.purl ? -1 : left.purl > right.purl ? 1 : 0));
  return { inputs, ecosystems, components, findings };
}

/** What the person at the close is told for one finding: how to remove the cause, and how an adapter can be added. */
export function sbomFindingHelp(item) {
  if (item.state === "unsupported") return `Add a reader: one function from the file's text to { ecosystem, name, version, purl, scope } components, registered by file name in SBOM_READERS (plugins/pipeline-core/lib/sbom-close.mjs), with a test in sbom-close.test.mjs. Until it exists, generate the SBOM with your own tool and have a human record the override.`;
  if (item.state === "partial") return "Pin the dependencies in a lockfile this reader knows (package-lock.json, Cargo.lock, poetry.lock, Pipfile.lock, requirements.txt with ==, go.mod), commit it, and run the close again.";
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
  if (value.status === "overridden") return exact(value.override, ["statement", "actor", "blocked"]) && typeof value.override.statement === "string" && value.override.statement !== "" && typeof value.override.actor === "string" && value.override.actor !== ""
    && Array.isArray(value.override.blocked) && value.override.blocked.length > 0 && value.override.blocked.every((entry) => exact(entry, ["state", "code", "path", "reason"]) && Object.values(entry).every((part) => typeof part === "string"));
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
 * `existing` is the text of a record already on disk (or null), `override` the human's literal words (or null) with `actor`.
 * An existing record whose inputs, shape or documents no longer match is `stale` or `invalid` and blocks like any other finding.
 */
export function closeSbom({ featureId, evidenceDir, tracked, read, existing = null, override = null, actor = null }) {
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
  if (blocks.length > 0 && override === null) return { status: "blocked", blocks, recordPath };
  const documents = observed.components.length === 0 ? { files: [] } : documentsFor(observed, featureId, evidenceDir);
  if (documents.error !== undefined) return { status: "blocked", blocks: [...blocks, finding("invalid", SBOM_LIFECYCLE_CODES.invalidFacts, recordPath, `the SBOM documents could not be generated (${documents.error})`)], recordPath };
  const overridden = blocks.length > 0;
  const record = {
    schema: SBOM_CLOSE_RECORD_SCHEMA,
    status: overridden ? "overridden" : observed.components.length === 0 ? "not-applicable" : "complete",
    code: overridden ? SBOM_CLOSE_CODES.overridden : observed.components.length === 0 ? SBOM_CLOSE_CODES.notApplicable : SBOM_CLOSE_CODES.complete,
    reason: overridden ? `${blocks.length} finding(s) blocked the SBOM; a human's override is recorded` : observed.components.length === 0 ? (observed.inputs.length === 0 ? "no dependency manifest or lockfile is tracked in this repository" : "the tracked lockfiles list no component") : `${observed.components.length} component(s) read from ${observed.ecosystems.length} lockfile(s)`,
    sourceInputs: observed.inputs, ecosystems: observed.ecosystems, componentCount: observed.components.length, edges: "not-recorded",
    documents: documents.files.map(({ format, path, sha256: digest }) => ({ format, path, sha256: digest })),
    override: overridden ? { statement: override, actor, blocked: blocks.map(({ state, code, path, reason }) => ({ state, code, path, reason })) } : null,
  };
  if (!sbomCloseRecordShape(record)) return { status: "blocked", blocks: [...blocks, finding("invalid", SBOM_LIFECYCLE_CODES.invalidFacts, recordPath, "the SBOM close record could not be formed")], recordPath };
  return { status: "ready", record, recordPath, files: [...documents.files.map(({ path, text }) => ({ path, text })), { path: recordPath, text: `${JSON.stringify(record, null, 2)}\n` }], reused: false, blocks };
}
