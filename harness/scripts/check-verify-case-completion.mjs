#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgainstSchema } from "../../plugins/pipeline-core/lib/schema-lite.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..");
export const DEFAULT_REGISTRY = "harness/config/verify-case-completion.v1.json";
export const DEFAULT_SCHEMA = "harness/config/verify-case-completion.v1.schema.json";
export const DEFAULT_VERIFY = "harness/scripts/verify.mjs";
export const REGISTRY_SCHEMA = "pipeline.verify-case-completion-registry.v1";
const DISPOSITIONS = new Set(["required", "legacy-process-only"]);
const LEGACY_REASON_RE = /^backlog\/items\/[^/]+\.md$/u;

function toPosix(value) { return value.split(sep).join("/"); }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}
function safeRepoPath(value) {
  if (typeof value !== "string" || value === "" || value.includes("\\")) return false;
  if (posix.isAbsolute(value) || posix.normalize(value) !== value) return false;
  return !value.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function runGit(root, args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024 });
}

function makeReader(root, candidate) {
  if (candidate === null) {
    const physicalRoot = realpathSync(root);
    function regularPath(relPath) {
      const physical = realpathSync(join(root, relPath));
      if (physical !== physicalRoot && !physical.startsWith(`${physicalRoot}${sep}`)) throw new Error(`${relPath} resolves outside the repository`);
      if (!statSync(physical).isFile()) throw new Error(`${relPath} is not a regular file`);
      return physical;
    }
    return {
      read(relPath) { return readFileSync(regularPath(relPath), "utf8"); },
      exists(relPath) {
        if (!existsSync(join(root, relPath))) return false;
        try { regularPath(relPath); return true; } catch { return false; }
      },
    };
  }
  function isRegularBlob(relPath) {
    const result = runGit(root, ["ls-tree", candidate, "--", relPath]);
    return result.status === 0 && /^100(?:644|755) blob [a-f0-9]{40}\t/u.test(result.stdout);
  }
  return {
    read(relPath) {
      if (!isRegularBlob(relPath)) throw new Error(`${candidate}:${relPath} is not a regular Git blob`);
      const result = runGit(root, ["show", `${candidate}:${relPath}`]);
      if (result.status !== 0) throw new Error(`git show ${candidate}:${relPath} failed`);
      return result.stdout;
    },
    exists(relPath) { return isRegularBlob(relPath); },
  };
}

const JOIN_ENTRY_RE = /\{\s*name:\s*"([^"]+)"\s*,\s*file:\s*join\(\s*(repoRoot|pluginScriptsDir|libDir|hooksDir|scriptDir)\s*,\s*((?:"(?:[^"\\]|\\.)*"\s*,?\s*)+)\)/u;
const LITERAL_ENTRY_RE = /Object\.freeze\(\{\s*name:\s*"([^"]+)"\s*,\s*file:\s*"([^"]+)"\s*,?\s*\}\)/u;
const ARRAY_SPECS = Object.freeze([
  ["TEST_SUITES", /const TEST_SUITES = \[([\s\S]*?)\n\];/u, "join"],
  ["SCOPED_VERIFY_SUITES", /const SCOPED_VERIFY_SUITES = Object\.freeze\(\[([\s\S]*?)\n\]\);/u, "literal"],
  ["WINDOWS_ASSURANCE_VERIFY_SUITES", /const WINDOWS_ASSURANCE_VERIFY_SUITES = Object\.freeze\(\[([\s\S]*?)\n\]\);/u, "literal"],
]);
const BASES = Object.freeze({
  repoRoot: "",
  scriptDir: "harness/scripts",
  libDir: "plugins/pipeline-core/lib",
  hooksDir: "plugins/pipeline-core/hooks",
  pluginScriptsDir: "plugins/pipeline-core/scripts",
});

function maskNonCode(source) {
  let output = "";
  let state = "code";
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (state === "code") {
      if (char === "/" && next === "/") { output += "  "; index += 1; state = "line"; continue; }
      if (char === "/" && next === "*") { output += "  "; index += 1; state = "block"; continue; }
      if (char === '"' || char === "'" || char === "`") { quote = char; output += " "; state = "string"; continue; }
      output += char;
      continue;
    }
    if (state === "line") {
      output += char === "\n" ? "\n" : " ";
      if (char === "\n") state = "code";
      continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") { output += "  "; index += 1; state = "code"; }
      else output += char === "\n" ? "\n" : " ";
      continue;
    }
    if (char === "\\") { output += " "; if (index + 1 < source.length) { output += source[index + 1] === "\n" ? "\n" : " "; index += 1; } continue; }
    output += char === "\n" ? "\n" : " ";
    if (char === quote) state = "code";
  }
  return output;
}

function braceDepthAt(source, position) {
  let depth = 0;
  for (let index = 0; index < position; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") depth = Math.max(0, depth - 1);
  }
  return depth;
}

function topLevelMatches(source, pattern) {
  return [...source.matchAll(pattern)].filter((match) => braceDepthAt(source, match.index) === 0);
}

function topLevelElements(source) {
  const masked = maskNonCode(source);
  const elements = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let index = 0; index <= masked.length; index += 1) {
    const char = masked[index];
    if (index === masked.length || char === "," && round === 0 && square === 0 && curly === 0) {
      const raw = source.slice(start, index);
      const code = masked.slice(start, index);
      const first = code.search(/\S/u);
      if (first !== -1) {
        let last = code.length - 1;
        while (last >= first && /\s/u.test(code[last])) last -= 1;
        elements.push(raw.slice(first, last + 1));
      }
      start = index + 1;
      continue;
    }
    if (char === "(") round += 1;
    else if (char === ")") round -= 1;
    else if (char === "[") square += 1;
    else if (char === "]") square -= 1;
    else if (char === "{") curly += 1;
    else if (char === "}") curly -= 1;
    if (round < 0 || square < 0 || curly < 0) throw new Error("Verify registration array has unbalanced delimiters");
  }
  if (round !== 0 || square !== 0 || curly !== 0) throw new Error("Verify registration array has unbalanced delimiters");
  return elements;
}

function matchingClose(source, openIndex, openChar, closeChar) {
  const masked = maskNonCode(source);
  let depth = 0;
  for (let index = openIndex; index < masked.length; index += 1) {
    if (masked[index] === openChar) depth += 1;
    else if (masked[index] === closeChar && --depth === 0) return index;
  }
  return -1;
}

function hasRequiredProtocol(source, suitePath) {
  const helperImports = [...source.matchAll(/^\s*import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']\s*;?/gmu)]
    .filter((match) => match[2].endsWith("test-case-completion.mjs"));
  if (helperImports.length !== 1 || !helperImports[0][2].startsWith(".")) return false;
  const resolvedHelper = posix.normalize(posix.join(posix.dirname(suitePath), helperImports[0][2]));
  if (resolvedHelper !== "plugins/pipeline-core/lib/test-case-completion.mjs") return false;
  const bindings = helperImports.flatMap((match) => match[1].split(",").map((part) => part.trim()).filter(Boolean));
  if (bindings.filter((binding) => binding === "registerTestCaseCompletion").length !== 1
    || bindings.some((binding) => /\bas\s+registerTestCaseCompletion$/u.test(binding))) return false;
  const masked = maskNonCode(source);
  const calls = topLevelMatches(masked, /^\s*registerTestCaseCompletion\s*\(/gmu);
  if (calls.length !== 1) return false;
  const prefix = masked.slice(0, calls[0].index);
  // A direct top-level registration is the narrow normal-startup shape. Obvious
  // unconditional termination before it makes even that expression unreachable.
  if (topLevelMatches(prefix, /^\s*(?:throw\b|process\.exit\s*\()/gmu).length) return false;
  const previousLine = prefix.trimEnd().split("\n").at(-1)?.trim() ?? "";
  if (/^(?:(?:if|for|while|with)\s*\([^)]*\)|else)\s*$/u.test(previousLine)) return false;
  const callTail = source.slice(calls[0].index);
  const open = callTail.indexOf("(");
  if (open === -1) return false;
  const close = matchingClose(callTail, open, "(", ")");
  if (close === -1) return false;
  const argument = callTail.slice(open + 1, close).trim();
  if (!argument.startsWith("{") || !argument.endsWith("}") || maskNonCode(argument).includes("...")) return false;
  let properties;
  try { properties = topLevelElements(argument.slice(1, -1)); } catch { return false; }
  const keys = properties.map((property) => /^\s*([A-Za-z_$][\w$]*)\s*:/u.exec(maskNonCode(property))?.[1] ?? null);
  return keys.length === 3 && [...keys].sort().join("\0") === ["cases", "fd", "maxBytes"].sort().join("\0");
}

function hasVerifyCaseCompletionPolicy(element) {
  const masked = maskNonCode(element);
  const open = masked.indexOf("{");
  if (open === -1) return false;
  const close = matchingClose(element, open, "{", "}");
  if (close === -1) return false;
  let properties;
  try { properties = topLevelElements(element.slice(open + 1, close)); }
  catch { return false; }
  const matches = properties.filter((property) => /^\s*caseCompletion\s*:/u.test(maskNonCode(property)));
  if (matches.length !== 1) return false;
  const value = maskNonCode(matches[0]).replace(/^\s*caseCompletion\s*:/u, "").trim();
  if (!value.startsWith("{")) return false;
  const closeValue = matchingClose(value, 0, "{", "}");
  return closeValue === value.length - 1;
}

function parseVerifyRegistrations(source, findings) {
  const entries = [];
  function accept(entry) {
    if (typeof entry.name !== "string" || entry.name === "" || !safeRepoPath(entry.path) || !entry.path.endsWith(".mjs")) {
      findings.push(`VERIFY-PATH ${entry.arrayName} ${JSON.stringify(entry.name)} has unsafe or malformed ${JSON.stringify(entry.path)}`);
      return;
    }
    entries.push(entry);
  }
  for (const [arrayName, pattern, kind] of ARRAY_SPECS) {
    const block = pattern.exec(source)?.[1];
    if (block === undefined) { findings.push(`VERIFY-PARSE ${arrayName} was not found`); continue; }
    const parsed = [];
    let elements;
    try { elements = topLevelElements(block); }
    catch (error) { findings.push(`VERIFY-PARSE ${arrayName} ${error.message}`); continue; }
    for (const [index, element] of elements.entries()) {
      const match = (kind === "join" ? JOIN_ENTRY_RE : LITERAL_ENTRY_RE).exec(element);
      if (match === null || match.index !== 0) {
        findings.push(`VERIFY-PARSE ${arrayName} entry ${index} is outside the closed literal registration grammar`);
        continue;
      }
      if (kind === "join") {
        const segments = [...match[3].matchAll(/"(?:[^"\\]|\\.)*"/gu)].map((item) => JSON.parse(item[0]));
        parsed.push({ name: match[1], path: posix.join(BASES[match[2]], ...segments), arrayName, caseCompletion: hasVerifyCaseCompletionPolicy(element) });
      } else parsed.push({ name: match[1], path: match[2], arrayName, caseCompletion: hasVerifyCaseCompletionPolicy(element) });
    }
    if (parsed.length !== elements.length) findings.push(`VERIFY-PARSE ${arrayName} declared ${elements.length} entries, parsed ${parsed.length}`);
    for (const entry of parsed) accept(entry);
  }
  return entries;
}

/**
 * Deliberately mirrors the reproducible conservative inventory recorded on
 * 2026-09-11. That first inventory parsed only TEST_SUITES and reported 166.
 * Applying the corrected classifier to every composed registration array also
 * sees mixed node:test/throwing-wrapper files and single node:test envelopes.
 * The registry is the closed, mechanically reproduced baseline; entries remain
 * process-only until they adopt the standard descriptor protocol.
 */
export function classifyVulnerableSuite(source) {
  const masked = maskNonCode(source);
  const assertions = (source.match(/\bassert(?:\.\w+)?\s*\(/gu) ?? []).length;
  const wrapperDefinition = /(?:async\s+)?function\s+(check|run)\s*\([^)]*(?:fn|callback)[^)]*\)\s*\{|(?:const|let|var)\s+(check|run)\s*=\s*\([^)]*(?:fn|callback)[^)]*\)\s*=>\s*\{/gu;
  const definition = topLevelMatches(masked, wrapperDefinition)[0] ?? null;
  if (definition !== null) {
    const name = definition[1] ?? definition[2];
    const callPattern = new RegExp(`(?<![\\w$.])${name}\\s*\\(`, "gu");
    const calls = Math.max(0, topLevelMatches(masked, callPattern).length - (definition[1] === undefined ? 0 : 1));
    const wrapper = masked.slice(definition.index, definition.index + 1_200);
    const executes = /\b(?:fn|callback)\s*\(\s*\)/u.test(wrapper);
    const catches = /\bcatch\s*\(/u.test(wrapper);
    const rethrows = /\bthrow\s+(?:error|e)\b/u.test(wrapper);
    return executes && calls >= 2 && (!catches || rethrows)
      ? { classification: "throwing-check-wrapper", sites: calls }
      : null;
  }
  const usesNodeTest = /^\s*import\s+.*node:test/mu.test(source);
  if (usesNodeTest) {
    const aliases = new Set();
    for (const match of source.matchAll(/^\s*import\s+([^;\n]+?)\s+from\s+["']node:test["']/gmu)) {
      const clause = match[1].trim();
      const defaultName = /^(\w+)/u.exec(clause)?.[1];
      if (defaultName !== undefined && defaultName !== "{" && defaultName !== "*") aliases.add(defaultName);
      for (const named of clause.matchAll(/\btest\s*(?:as\s+(\w+))?/gu)) aliases.add(named[1] ?? "test");
    }
    let tests = 0;
    for (const alias of aliases) {
      const callPattern = new RegExp(`(?<![\\w$.])${alias}\\s*\\(`, "gu");
      // Counting all bare imported-binding calls is conservative in the safe
      // direction: nested node:test registration still creates a separately
      // reported case, while `.test(...)` methods cannot inflate this count.
      tests += [...masked.matchAll(callPattern)].length;
    }
    return tests === 1 && assertions >= 2 ? { classification: "node-test-single", sites: assertions } : null;
  }
  return assertions >= 2 ? { classification: "top-level-assertions", sites: assertions } : null;
}

const SUPPORTED_SCHEMA_KEYS = new Set(["$schema", "$id", "title", "description", "type", "required", "properties", "items", "enum", "additionalProperties"]);

function parseValidationSchema(source, findings) {
  let schema;
  try { schema = JSON.parse(source); }
  catch (error) { findings.push(`REGISTRY-SCHEMA-JSON ${error.message}`); return null; }
  function inspect(node, path) {
    if (!isPlainObject(node)) { findings.push(`REGISTRY-SCHEMA-SHAPE ${path} must be an object`); return; }
    for (const key of Object.keys(node)) {
      if (!SUPPORTED_SCHEMA_KEYS.has(key)) findings.push(`REGISTRY-SCHEMA-KEY ${path}.${key} is not enforced by schema-lite`);
    }
    if (node.properties !== undefined) {
      if (!isPlainObject(node.properties)) findings.push(`REGISTRY-SCHEMA-SHAPE ${path}.properties must be an object`);
      else for (const [key, child] of Object.entries(node.properties)) inspect(child, `${path}.properties.${key}`);
    }
    if (node.items !== undefined) inspect(node.items, `${path}.items`);
    if (isPlainObject(node.additionalProperties)) inspect(node.additionalProperties, `${path}.additionalProperties`);
  }
  if (!isPlainObject(schema)) { findings.push("REGISTRY-SCHEMA-SHAPE root must be an object"); return null; }
  inspect(schema, "$schema");
  if (schema.$id !== REGISTRY_SCHEMA) findings.push(`REGISTRY-SCHEMA-ID expected ${REGISTRY_SCHEMA}`);
  if (schema.type !== "object") findings.push("REGISTRY-SCHEMA-SHAPE root type must be object");
  const identity = schema.properties?.schema;
  if (!isPlainObject(identity) || !Array.isArray(identity.enum) || identity.enum.length !== 1 || identity.enum[0] !== REGISTRY_SCHEMA) {
    findings.push(`REGISTRY-SCHEMA-IDENTITY schema property must use the closed ${REGISTRY_SCHEMA} enum`);
  }
  return schema;
}

function parseRegistry(source, schema, reader, findings) {
  let registry;
  try { registry = JSON.parse(source); }
  catch (error) { findings.push(`REGISTRY-JSON ${error.message}`); return []; }
  if (schema !== null) {
    try {
      const validation = validateAgainstSchema(registry, schema);
      for (const error of validation.errors) findings.push(`REGISTRY-SCHEMA-VALIDATION ${error}`);
    } catch (error) {
      findings.push(`REGISTRY-SCHEMA-INVALID ${error.message}`);
    }
  }
  if (!isPlainObject(registry) || !exactKeys(registry, ["schema", "entries"])) {
    findings.push("REGISTRY-SHAPE root must have exactly schema and entries"); return [];
  }
  if (registry.schema !== REGISTRY_SCHEMA) findings.push(`REGISTRY-SCHEMA expected ${REGISTRY_SCHEMA}`);
  if (!Array.isArray(registry.entries)) { findings.push("REGISTRY-SHAPE entries must be an array"); return []; }
  const entries = [];
  for (const [index, entry] of registry.entries.entries()) {
    const label = `registry entry ${index}`;
    if (!isPlainObject(entry)) { findings.push(`REGISTRY-SHAPE ${label} must be an object`); continue; }
    const disposition = entry.disposition;
    const expected = disposition === "legacy-process-only" ? ["name", "path", "disposition", "reason"] : ["name", "path", "disposition"];
    if (!exactKeys(entry, expected)) findings.push(`REGISTRY-SHAPE ${label} has unsupported or missing fields`);
    if (typeof entry.name !== "string" || entry.name === "") findings.push(`REGISTRY-NAME ${label} requires a non-empty name`);
    if (!safeRepoPath(entry.path) || !entry.path.endsWith(".test.mjs")) findings.push(`REGISTRY-PATH ${label} has unsafe or non-test path`);
    if (!DISPOSITIONS.has(disposition)) findings.push(`REGISTRY-DISPOSITION ${label} has unsupported disposition`);
    if (disposition === "legacy-process-only") {
      if (typeof entry.reason !== "string" || !LEGACY_REASON_RE.test(entry.reason)) findings.push(`REGISTRY-REASON ${label} requires a backlog/items/*.md reason`);
      else if (!reader.exists(entry.reason)) findings.push(`REGISTRY-REASON ${label} names missing ${entry.reason}`);
    }
    entries.push(entry);
  }
  return entries;
}

function changedPathsBetween(root, base, candidate, findings) {
  const result = runGit(root, ["diff", "--name-only", "--diff-filter=ACMRTUXB", base, candidate, "--"]);
  if (result.status !== 0) { findings.push(`GIT-DIFF ${base}..${candidate} could not be read`); return new Set(); }
  return new Set(result.stdout.split(/\r?\n/u).filter(Boolean));
}

export function checkVerifyCaseCompletion({
  root = DEFAULT_ROOT,
  registryPath = DEFAULT_REGISTRY,
  schemaPath = DEFAULT_SCHEMA,
  verifyPath = DEFAULT_VERIFY,
  base = null,
  candidate = null,
  changedPaths = null,
} = {}) {
  root = resolve(root);
  const findings = [];
  let baseOid = base;
  let candidateOid = candidate;
  if (!safeRepoPath(toPosix(registryPath))) findings.push("REGISTRY-PATH registry path must be repository-relative");
  if (!safeRepoPath(toPosix(schemaPath))) findings.push("REGISTRY-SCHEMA-PATH schema path must be repository-relative");
  if (!safeRepoPath(toPosix(verifyPath))) findings.push("VERIFY-PATH verify path must be repository-relative");
  if ((base === null) !== (candidate === null)) findings.push("REF-PAIR --base and --candidate must be provided together");
  if (candidate !== null) {
    for (const [label, ref] of [["base", base], ["candidate", candidate]]) {
      const resolvedRef = typeof ref === "string" && ref !== ""
        ? runGit(root, ["rev-parse", "--verify", `${ref}^{commit}`])
        : { status: 1, stdout: "" };
      if (resolvedRef.status !== 0 || !/^[a-f0-9]{40}$/u.test(resolvedRef.stdout.trim())) findings.push(`REF ${label} is not a commit`);
      else if (label === "base") baseOid = resolvedRef.stdout.trim();
      else candidateOid = resolvedRef.stdout.trim();
    }
  }
  if (findings.length > 0) return { ok: false, findings, registeredCount: 0, vulnerableCount: 0, registryCount: 0 };
  const reader = makeReader(root, candidateOid);
  let registrySource, schemaSource, verifySource;
  try { registrySource = reader.read(toPosix(registryPath)); } catch (error) { findings.push(`REGISTRY-READ ${error.message}`); }
  try { schemaSource = reader.read(toPosix(schemaPath)); } catch (error) { findings.push(`REGISTRY-SCHEMA-READ ${error.message}`); }
  try { verifySource = reader.read(toPosix(verifyPath)); } catch (error) { findings.push(`VERIFY-READ ${error.message}`); }
  if (registrySource === undefined || schemaSource === undefined || verifySource === undefined) return { ok: false, findings, registeredCount: 0, vulnerableCount: 0, registryCount: 0 };

  const registrations = parseVerifyRegistrations(verifySource, findings).filter((entry) => entry.path.endsWith(".test.mjs"));
  const schema = parseValidationSchema(schemaSource, findings);
  const registry = parseRegistry(registrySource, schema, reader, findings);
  const registrationByName = new Map();
  for (const entry of registrations) {
    if (registrationByName.has(entry.name)) findings.push(`VERIFY-DUPLICATE ${entry.name}`);
    registrationByName.set(entry.name, entry);
  }
  const registryByName = new Map();
  const registryKeys = new Set();
  for (const entry of registry) {
    const key = `${entry.name}\0${entry.path}`;
    if (registryKeys.has(key)) findings.push(`REGISTRY-DUPLICATE ${entry.name} ${entry.path}`);
    registryKeys.add(key);
    if (registryByName.has(entry.name)) findings.push(`REGISTRY-DUPLICATE-NAME ${entry.name}`);
    registryByName.set(entry.name, entry);
    const registered = registrationByName.get(entry.name);
    if (registered === undefined) findings.push(`REGISTRY-STALE ${entry.name} is not a Verify registration`);
    else if (registered.path !== entry.path) findings.push(`REGISTRY-STALE ${entry.name} path is ${entry.path}, Verify uses ${registered.path}`);
    else if (entry.disposition === "required" && !registered.caseCompletion) findings.push(`REQUIRED-VERIFY-POLICY ${entry.name} has no Verify caseCompletion policy`);
  }
  const names = registry.map((entry) => entry.name);
  const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
  if (names.some((name, index) => name !== sortedNames[index])) findings.push("REGISTRY-ORDER entries must be sorted by name");

  const vulnerable = [];
  for (const registration of registrations) {
    if (!reader.exists(registration.path)) { findings.push(`VERIFY-MISSING ${registration.name} names missing ${registration.path}`); continue; }
    const suiteSource = reader.read(registration.path);
    const registryEntry = registryByName.get(registration.name);
    if (registryEntry?.disposition === "required" && !hasRequiredProtocol(suiteSource, registration.path)) {
      findings.push(`REQUIRED-PROTOCOL ${registration.name} does not import and invoke registerTestCaseCompletion`);
    }
    const classification = classifyVulnerableSuite(suiteSource);
    if (classification === null) continue;
    vulnerable.push({ ...registration, ...classification });
    if (!registryByName.has(registration.name)) findings.push(`VULNERABLE-UNREGISTERED ${registration.name} ${registration.path}`);
  }
  const changed = changedPaths === null
    ? (baseOid === null ? new Set() : changedPathsBetween(root, baseOid, candidateOid, findings))
    : new Set(changedPaths);
  let baseRegistrationKeys = null;
  if (baseOid !== null) {
    const baseReader = makeReader(root, baseOid);
    try {
      const baseFindings = [];
      const baseEntries = parseVerifyRegistrations(baseReader.read(toPosix(verifyPath)), baseFindings)
        .filter((entry) => entry.path.endsWith(".test.mjs"));
      if (baseFindings.length > 0) findings.push(...baseFindings.map((finding) => `BASE-${finding}`));
      else baseRegistrationKeys = new Set(baseEntries.map((entry) => `${entry.name}\0${entry.path}`));
    } catch (error) { findings.push(`BASE-VERIFY-READ ${error.message}`); }
  }
  for (const entry of registry) {
    if (entry.disposition === "legacy-process-only" && changed.has(entry.path)) findings.push(`LEGACY-TOUCHED ${entry.name} must migrate to required in the same candidate`);
    if (entry.disposition === "legacy-process-only" && baseRegistrationKeys !== null
      && !baseRegistrationKeys.has(`${entry.name}\0${entry.path}`)) {
      findings.push(`LEGACY-NEW ${entry.name} is a new Verify registration and must start as required`);
    }
  }
  return { ok: findings.length === 0, findings, registeredCount: registrations.length, vulnerableCount: vulnerable.length, registryCount: registry.length };
}

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, registryPath: DEFAULT_REGISTRY, schemaPath: DEFAULT_SCHEMA, verifyPath: DEFAULT_VERIFY, base: null, candidate: null };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!["--root", "--registry", "--schema", "--verify", "--base", "--candidate"].includes(key)) throw new Error(`unknown argument ${key}`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`${key} requires a value`);
    if (key === "--root") options.root = value;
    else if (key === "--registry") options.registryPath = value;
    else if (key === "--schema") options.schemaPath = value;
    else if (key === "--verify") options.verifyPath = value;
    else if (key === "--base") options.base = value;
    else options.candidate = value;
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  let result;
  try { result = checkVerifyCaseCompletion(parseArgs(process.argv.slice(2))); }
  catch (error) { console.error(`VERIFY-CASE-COMPLETION-ARGS ${error.message}`); process.exit(2); }
  if (!result.ok) {
    for (const finding of result.findings) console.error(finding);
    console.error(`Verify case-completion registry invalid: ${result.findings.length} finding(s).`);
    process.exit(2);
  }
  console.log(`Verify case-completion registry valid: ${result.registryCount} entries, ${result.vulnerableCount} conservatively classified suites.`);
}
