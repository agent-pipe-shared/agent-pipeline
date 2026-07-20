// SPDX-License-Identifier: Apache-2.0

/**
 * Read-only public boundary for Hawkeye regulated-document Policy.
 *
 * This slice deliberately does not activate a capability, resolve private
 * bindings, inspect Git, invoke an adapter, or render a document. It discovers
 * one fixed repository Policy, validates its closed public vocabulary, and
 * derives the deterministic public runtime projection from its exact bytes.
 */

import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgainstSchema } from "./schema-lite.mjs";
import { parseYaml } from "./yaml-lite.mjs";

export const DOCUMENT_HOOKS_POLICY_SCHEMA = "pipeline.document-hooks-policy.v1";
export const DOCUMENT_HOOKS_RUNTIME_SCHEMA = "pipeline.document-hooks-runtime.v1";
export const DOCUMENT_HOOKS_POLICY_FILENAME = "document-hooks.yaml";

export const DOCUMENT_CLASS_IDS = Object.freeze(["authorization", "operations", "emergency", "privacy"]);
export const DOCUMENT_HOOK_MODES = Object.freeze(["advisory", "mandatory"]);
export const DOCUMENT_HOOK_EVENTS = Object.freeze(["design-impact", "verify", "close"]);

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DOCUMENT_HOOKS_POLICY_SCHEMA_PATH = resolve(HERE, "../scripts/document-hooks-policy.schema.json");
export const DEFAULT_DOCUMENT_HOOKS_RUNTIME_SCHEMA_PATH = resolve(HERE, "../scripts/document-hooks-runtime.schema.json");

const CLASS_KEYS = ["classId", "bindingId", "mode", "events"];
const POLICY_KEYS = ["schema", "classes"];
const RUNTIME_KEYS = ["schema", "sourceSha256", "classes"];
const BINDING_ID = /^dh_[a-z2-7]{25}[aeimquy4]$/;
const SHA256 = /^[0-9a-f]{64}$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const EVENT_ORDER = new Map(DOCUMENT_HOOK_EVENTS.map((event, index) => [event, index]));

export class DocumentHooksError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = "DocumentHooksError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new DocumentHooksError(code, message, details);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  return isObject(value)
    && Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readSchema(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("DH-SCHEMA-UNAVAILABLE", "A required document-hooks schema is unreadable or malformed.");
  }
}

function validateSchemaShape(value, schemaPath, label) {
  const result = validateAgainstSchema(value, readSchema(schemaPath));
  if (!result.valid) fail("DH-SCHEMA", `${label} does not match its closed schema.`);
}

function validateClass(entry, index, label) {
  if (!hasExactKeys(entry, CLASS_KEYS)) fail("DH-SCHEMA", `${label}.classes[${index}] is not closed.`);
  if (!DOCUMENT_CLASS_IDS.includes(entry.classId)) fail("DH-CLASS-ID", `${label}.classes[${index}].classId is invalid.`);
  if (typeof entry.bindingId !== "string" || !BINDING_ID.test(entry.bindingId)) {
    fail("DH-BINDING-ID", `${label}.classes[${index}].bindingId is not a canonical dh_ identifier.`);
  }
  if (!DOCUMENT_HOOK_MODES.includes(entry.mode)) fail("DH-MODE", `${label}.classes[${index}].mode is invalid.`);
  if (!Array.isArray(entry.events) || entry.events.length < 1 || entry.events.length > 3) {
    fail("DH-EVENTS", `${label}.classes[${index}].events must contain one to three events.`);
  }
  if (entry.events.some((event) => !DOCUMENT_HOOK_EVENTS.includes(event))) {
    fail("DH-EVENTS", `${label}.classes[${index}].events contains an unsupported event.`);
  }
  if (new Set(entry.events).size !== entry.events.length) {
    fail("DH-EVENTS-DUPLICATE", `${label}.classes[${index}].events contains a duplicate.`);
  }
}

function validateClasses(classes, label) {
  if (!Array.isArray(classes) || classes.length < 1 || classes.length > 32) {
    fail("DH-CLASSES", `${label}.classes must contain one to 32 records.`);
  }
  classes.forEach((entry, index) => validateClass(entry, index, label));
  const bindingIds = classes.map(({ bindingId }) => bindingId);
  if (new Set(bindingIds).size !== bindingIds.length) {
    fail("DH-BINDING-DUPLICATE", `${label}.classes must be unique by bindingId.`);
  }
}

/** Validate one parsed public repository Policy without normalizing its input order. */
export function validateDocumentHooksPolicy(value, {
  schemaPath = DEFAULT_DOCUMENT_HOOKS_POLICY_SCHEMA_PATH,
} = {}) {
  validateSchemaShape(value, schemaPath, "document-hooks Policy");
  if (!hasExactKeys(value, POLICY_KEYS) || value.schema !== DOCUMENT_HOOKS_POLICY_SCHEMA) {
    fail("DH-POLICY-SCHEMA", "Document-hooks Policy has an invalid schema or root shape.");
  }
  validateClasses(value.classes, "document-hooks Policy");
  return value;
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function compareClass(left, right) {
  const byClass = compareUtf8(left.classId, right.classId);
  return byClass === 0 ? compareUtf8(left.bindingId, right.bindingId) : byClass;
}

function normalizedClasses(classes) {
  return classes.map((entry) => ({
    classId: entry.classId,
    bindingId: entry.bindingId,
    mode: entry.mode,
    events: [...entry.events].sort((left, right) => EVENT_ORDER.get(left) - EVENT_ORDER.get(right)),
  })).sort(compareClass);
}

/** Return the canonical public Policy value (schema plus deterministically ordered classes). */
export function normalizeDocumentHooksPolicy(value) {
  validateDocumentHooksPolicy(value);
  return { schema: DOCUMENT_HOOKS_POLICY_SCHEMA, classes: normalizedClasses(value.classes) };
}

/** Build the only public runtime projection for a validated Policy-byte digest. */
export function buildDocumentHooksRuntime(policy, sourceSha256) {
  validateDocumentHooksPolicy(policy);
  if (typeof sourceSha256 !== "string" || !SHA256.test(sourceSha256)) {
    fail("DH-SOURCE-DIGEST", "Document-hooks sourceSha256 must be 64 lowercase hexadecimal characters.");
  }
  const runtime = {
    schema: DOCUMENT_HOOKS_RUNTIME_SCHEMA,
    sourceSha256,
    classes: normalizedClasses(policy.classes),
  };
  validateDocumentHooksRuntime(runtime);
  return runtime;
}

function sameClassSequence(actual, expected) {
  return actual.length === expected.length && actual.every((entry, index) => {
    const normalized = expected[index];
    return entry.classId === normalized.classId
      && entry.bindingId === normalized.bindingId
      && entry.mode === normalized.mode
      && entry.events.length === normalized.events.length
      && entry.events.every((event, eventIndex) => event === normalized.events[eventIndex]);
  });
}

/** Validate a generated projection, including its mandated bytewise/event order. */
export function validateDocumentHooksRuntime(value, {
  schemaPath = DEFAULT_DOCUMENT_HOOKS_RUNTIME_SCHEMA_PATH,
} = {}) {
  validateSchemaShape(value, schemaPath, "document-hooks runtime");
  if (!hasExactKeys(value, RUNTIME_KEYS) || value.schema !== DOCUMENT_HOOKS_RUNTIME_SCHEMA) {
    fail("DH-RUNTIME-SCHEMA", "Document-hooks runtime has an invalid schema or root shape.");
  }
  if (typeof value.sourceSha256 !== "string" || !SHA256.test(value.sourceSha256)) {
    fail("DH-SOURCE-DIGEST", "Document-hooks runtime sourceSha256 is invalid.");
  }
  validateClasses(value.classes, "document-hooks runtime");
  if (!sameClassSequence(value.classes, normalizedClasses(value.classes))) {
    fail("DH-RUNTIME-ORDER", "Document-hooks runtime classes or events are not in canonical order.");
  }
  return value;
}

function sourceBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  fail("DH-SOURCE", "Document-hooks Policy source must be UTF-8 bytes or a string.");
}

/** Parse exact Policy bytes and return their validated public projection. */
export function compileDocumentHooksPolicy(value) {
  const bytes = sourceBytes(value);
  let text;
  try {
    text = UTF8.decode(bytes);
  } catch {
    fail("DH-SOURCE-UTF8", "Document-hooks Policy is not valid UTF-8.");
  }
  let policy;
  try {
    policy = parseYaml(text);
  } catch (error) {
    const line = Number.isSafeInteger(error?.line) ? ` at line ${error.line}` : "";
    fail("DH-SOURCE-YAML", `Document-hooks Policy YAML is invalid${line}.`);
  }
  validateDocumentHooksPolicy(policy);
  const sourceSha256 = sha256(bytes);
  return { policy, sourceSha256, runtime: buildDocumentHooksRuntime(policy, sourceSha256) };
}

/** Validate that an existing runtime is the exact projection of current Policy bytes. */
export function validateDocumentHooksProjection(source, runtime) {
  const compiled = compileDocumentHooksPolicy(source);
  return validateDocumentHooksRuntimeReadback(runtime, compiled.runtime);
}

/** Compare two already-materialized public projections without filesystem access. */
export function validateDocumentHooksRuntimeReadback(runtime, expectedRuntime) {
  validateDocumentHooksRuntime(runtime);
  validateDocumentHooksRuntime(expectedRuntime);
  if (runtime.schema !== expectedRuntime.schema
    || runtime.sourceSha256 !== expectedRuntime.sourceSha256
    || !sameClassSequence(runtime.classes, expectedRuntime.classes)) {
    fail("DH-RUNTIME-DRIFT", "Document-hooks runtime is not the exact projection of the current Policy bytes.");
  }
  return runtime;
}

function validUnicodeScalarString(value) {
  return typeof value === "string" && Buffer.from(value, "utf8").toString("utf8") === value;
}

function validateImpactContext(value) {
  const keys = ["baseCommit", "baseTree", "candidateCommit", "candidateTree", "diffSha256"];
  if (!hasExactKeys(value, keys)
    || !OID.test(value.baseCommit ?? "") || !OID.test(value.baseTree ?? "")
    || !OID.test(value.candidateCommit ?? "") || !OID.test(value.candidateTree ?? "")
    || !SHA256.test(value.diffSha256 ?? "")) {
    fail("DH-IMPACT-CONTEXT", "Document impact requires one exact frozen base/candidate identity.");
  }
  return value;
}

/** Validate the closed, NFC POSIX trigger-pattern contract used for impact. */
export function validateDocumentTriggerPattern(pattern) {
  if (!validUnicodeScalarString(pattern) || pattern.length === 0 || pattern.normalize("NFC") !== pattern
    || Buffer.byteLength(pattern, "utf8") > 256 || pattern.startsWith("/") || pattern.includes("\\")
    || pattern.includes("\0") || /[\[\]{}!()]/u.test(pattern)) {
    fail("DH-IMPACT-PATTERN", "Document impact trigger pattern is not a canonical restricted POSIX glob.");
  }
  const segments = pattern.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".."
    || (segment.includes("**") && segment !== "**"))) {
    fail("DH-IMPACT-PATTERN", "Document impact trigger pattern contains an invalid segment.");
  }
  return pattern;
}

function validateImpactBindings(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    fail("DH-IMPACT-BINDINGS", "Document impact requires one to 32 closed binding inputs.");
  }
  const ids = new Set();
  return value.map((binding) => {
    if (!hasExactKeys(binding, ["bindingId", "triggerPatterns"])
      || !BINDING_ID.test(binding.bindingId ?? "") || !Array.isArray(binding.triggerPatterns)
      || binding.triggerPatterns.length < 1 || binding.triggerPatterns.length > 128
      || new Set(binding.triggerPatterns).size !== binding.triggerPatterns.length) {
      fail("DH-IMPACT-BINDING", "Document impact binding is malformed or not canonical.");
    }
    if (ids.has(binding.bindingId)) fail("DH-IMPACT-BINDING", "Document impact binding identifiers must be unique.");
    ids.add(binding.bindingId);
    binding.triggerPatterns.forEach(validateDocumentTriggerPattern);
    return { bindingId: binding.bindingId, triggerPatterns: [...binding.triggerPatterns] };
  }).sort((left, right) => compareUtf8(left.bindingId, right.bindingId));
}

function validateGitPath(path) {
  if (!validUnicodeScalarString(path) || path.length === 0 || path.normalize("NFC") !== path
    || path.startsWith("/") || path.includes("\\") || path.includes("\0")) {
    fail("DH-IMPACT-PATH", "Document impact diff contains a non-canonical repository path.");
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail("DH-IMPACT-PATH", "Document impact diff contains a non-canonical repository path.");
  }
  return path;
}

function decodeNulToken(bytes) {
  try {
    return UTF8.decode(bytes);
  } catch {
    fail("DH-IMPACT-DIFF", "Document impact diff is not valid UTF-8 NUL-delimited Git output.");
  }
}

function parseNameStatus(raw) {
  if (!(Buffer.isBuffer(raw) || raw instanceof Uint8Array)) {
    fail("DH-IMPACT-DIFF", "Document impact requires raw NUL-delimited Git name-status bytes.");
  }
  const bytes = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  if (bytes.length === 0) return [];
  if (bytes[bytes.length - 1] !== 0) fail("DH-IMPACT-DIFF", "Document impact diff must end at a NUL record boundary.");
  const tokens = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0) {
      tokens.push(decodeNulToken(bytes.subarray(start, index)));
      start = index + 1;
    }
  }
  const paths = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    const renamedOrCopied = /^(?:R|C)(?:0[0-9]{2}|100|[1-9][0-9]?)$/u.test(status);
    const ordinary = /^(?:A|D|M)$/u.test(status);
    if (!ordinary && !renamedOrCopied) fail("DH-IMPACT-DIFF", "Document impact diff contains an unsupported name-status record.");
    const needed = renamedOrCopied ? 2 : 1;
    if (index + needed > tokens.length) fail("DH-IMPACT-DIFF", "Document impact diff has a truncated name-status record.");
    const sides = tokens.slice(index, index + needed).map(validateGitPath);
    index += needed;
    paths.push(...sides);
  }
  return paths;
}

function segmentMatches(pattern, path) {
  let source = "^";
  for (const scalar of pattern) {
    if (scalar === "*") source += "[^/]*";
    else if (scalar === "?") source += "[^/]";
    else source += scalar.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
  }
  return new RegExp(`${source}$`, "u").test(path);
}

function triggerMatches(pattern, path) {
  const patternSegments = pattern.split("/");
  const pathSegments = path.split("/");
  const visit = (patternIndex, pathIndex) => {
    if (patternIndex === patternSegments.length) return pathIndex === pathSegments.length;
    if (patternSegments[patternIndex] === "**") {
      for (let next = pathIndex; next <= pathSegments.length; next += 1) {
        if (visit(patternIndex + 1, next)) return true;
      }
      return false;
    }
    return pathIndex < pathSegments.length
      && segmentMatches(patternSegments[patternIndex], pathSegments[pathIndex])
      && visit(patternIndex + 1, pathIndex + 1);
  };
  return visit(0, 0);
}

/**
 * Evaluate a frozen base-to-candidate name-status byte stream without Git or
 * filesystem access. Inputs are closed and identity/diff-bound; the returned
 * projection deliberately exposes only opaque binding IDs and booleans.
 */
export function evaluateDocumentImpact(input) {
  if (!hasExactKeys(input, ["context", "bindings", "rawNameStatus"])) {
    fail("DH-IMPACT-INPUT", "Document impact input must have one closed shape.");
  }
  const context = validateImpactContext(input.context);
  const raw = input.rawNameStatus;
  if (!(Buffer.isBuffer(raw) || raw instanceof Uint8Array)) {
    fail("DH-IMPACT-DIFF", "Document impact requires raw NUL-delimited Git name-status bytes.");
  }
  const bytes = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  if (sha256(bytes) !== context.diffSha256) fail("DH-IMPACT-DIFF", "Document impact diff does not match the frozen candidate identity.");
  const bindings = validateImpactBindings(input.bindings);
  const changedPaths = parseNameStatus(bytes);
  return bindings.map(({ bindingId, triggerPatterns }) => ({
    bindingId,
    affected: changedPaths.some((path) => triggerPatterns.some((pattern) => triggerMatches(pattern, path))),
  }));
}

function normalizedPoliciesPath(manifest) {
  const value = manifest?.governance?.policies_path;
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length === 0 || value.length > 240 || value.trim() !== value
    || isAbsolute(value) || value.includes("\\") || value.startsWith("./") || value.endsWith("/")) {
    fail("DH-POLICY-PATH", "governance.policies_path must be a normalized repository-relative path.");
  }
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    fail("DH-POLICY-PATH", "governance.policies_path must be a normalized repository-relative path.");
  }
  return value;
}

function assertPhysicalPolicyInsideRoot(rootDir, policyPath) {
  const physicalRoot = realpathSync(rootDir);
  const physicalPolicy = realpathSync(policyPath);
  const fromRoot = relative(physicalRoot, physicalPolicy);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRoot)) {
    fail("DH-POLICY-PATH", "document-hooks.yaml resolves outside the repository root.");
  }
}

/**
 * Discover the fixed repo Policy below governance.policies_path without writing.
 * Missing governance/path/file is a typed no-op; every present malformed source
 * is a typed invalid result suitable for setup's pre-mutation failure path.
 */
export function loadDocumentHooksPolicy(rootDir, manifest) {
  let policiesPath;
  try {
    policiesPath = normalizedPoliciesPath(manifest);
  } catch (error) {
    return { status: "invalid", code: error.code ?? "DH-POLICY-PATH", detail: error.message };
  }
  if (policiesPath === null) return { status: "absent" };

  const policyRelativePath = `${policiesPath}/${DOCUMENT_HOOKS_POLICY_FILENAME}`;
  const policyPath = resolve(rootDir, ...policyRelativePath.split("/"));
  let bytes;
  try {
    assertPhysicalPolicyInsideRoot(rootDir, policyPath);
    bytes = readFileSync(policyPath);
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "absent", policyPath: policyRelativePath };
    return {
      status: "invalid",
      code: error instanceof DocumentHooksError ? error.code : "DH-SOURCE-READ",
      detail: error instanceof DocumentHooksError ? error.message : "document-hooks.yaml is unreadable.",
      policyPath: policyRelativePath,
    };
  }

  try {
    return { status: "ok", policyPath: policyRelativePath, ...compileDocumentHooksPolicy(bytes) };
  } catch (error) {
    return {
      status: "invalid",
      code: error instanceof DocumentHooksError ? error.code : "DH-SOURCE-INVALID",
      detail: error instanceof Error ? error.message : String(error),
      policyPath: policyRelativePath,
    };
  }
}
