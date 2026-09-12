// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { extname, posix } from "node:path";

export const REQUIREMENT_TRACEABILITY_SCHEMA = "pipeline.requirement-traceability.v1";
export const REQUIREMENT_TRACEABILITY_RESULT_SCHEMA = "pipeline.requirement-traceability-result.v1";
export const REQUIREMENT_MAP_MAX_BYTES = 64 * 1024;
export const REQUIREMENT_SOURCE_MAX_BYTES = 1024 * 1024;
export const REQUIREMENT_CRITERIA_MAX = 64;

const PATH_MAX = 240;
const ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,7}$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const PREDICATES = new Set(["file-contains-literal", "path-exists"]);

export class RequirementTraceabilityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RequirementTraceabilityError";
    this.code = code;
  }
}

function fail(code, message) { throw new RequirementTraceabilityError(code, message); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function exactKeys(value, expected) {
  return isObject(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function normalizedPath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > PATH_MAX
    || value.trim() !== value || value.includes("\\") || value.includes("\0")
    || value.startsWith("/") || value.startsWith("./") || value.endsWith("/")) {
    fail("RT-PATH", `${label} must be a bounded normalized repository-relative path.`);
  }
  if (value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail("RT-PATH", `${label} must be a bounded normalized repository-relative path.`);
  }
  return value;
}

export function requirementMapPath(specPath) {
  const spec = normalizedPath(specPath, "Spec path");
  const extension = extname(spec);
  const basename = extension.length > 0 ? posix.basename(spec, extension) : posix.basename(spec);
  const directory = posix.dirname(spec);
  return `${directory === "." ? "" : `${directory}/`}${basename}.requirements.json`;
}

function parseMap(bytes, specPath) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) fail("RT-MAP-FILE", "Requirement map bytes are required.");
  if (bytes.byteLength === 0 || bytes.byteLength > REQUIREMENT_MAP_MAX_BYTES) {
    fail("RT-MAP-SIZE", `Requirement map must be 1-${REQUIREMENT_MAP_MAX_BYTES} bytes.`);
  }
  let value;
  try { value = JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { fail("RT-MAP-JSON", "Requirement map must be valid JSON."); }
  if (!exactKeys(value, ["schema", "specPath", "specSha256", "criteria"]) || value.schema !== REQUIREMENT_TRACEABILITY_SCHEMA) {
    fail("RT-MAP-SCHEMA", "Requirement map must use the closed pipeline.requirement-traceability.v1 schema.");
  }
  if (value.specPath !== specPath) fail("RT-MAP-SPEC", "Requirement map does not name its adjacent Spec path exactly.");
  if (typeof value.specSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.specSha256)) {
    fail("RT-MAP-SPEC-DIGEST", "Requirement map must carry the exact candidate Spec SHA-256.");
  }
  if (!Array.isArray(value.criteria) || value.criteria.length === 0 || value.criteria.length > REQUIREMENT_CRITERIA_MAX) {
    fail("RT-CRITERIA", `Requirement map must declare 1-${REQUIREMENT_CRITERIA_MAX} criteria.`);
  }
  const seen = new Set();
  const criteria = value.criteria.map((criterion) => {
    if (!isObject(criterion) || typeof criterion.predicate !== "string" || !PREDICATES.has(criterion.predicate)) {
      fail("RT-PREDICATE", "Each criterion must use an allowlisted predicate.");
    }
    const expectedKeys = criterion.predicate === "file-contains-literal"
      ? ["id", "predicate", "path", "literal"]
      : ["id", "predicate", "path"];
    if (!exactKeys(criterion, expectedKeys)) fail("RT-CRITERION-SCHEMA", "Each criterion must use the exact keys for its predicate.");
    if (typeof criterion.id !== "string" || !ID.test(criterion.id) || criterion.id.length > 80 || seen.has(criterion.id)) {
      fail("RT-CRITERION-ID", "Criterion ids must be unique bounded uppercase names such as AC-KEYBOARD.");
    }
    seen.add(criterion.id);
    const path = normalizedPath(criterion.path, `Path for ${criterion.id}`);
    if (criterion.predicate === "file-contains-literal") {
      if (typeof criterion.literal !== "string" || criterion.literal.length === 0 || criterion.literal.includes("\0")
        || Buffer.byteLength(criterion.literal, "utf8") > 256) {
        fail("RT-LITERAL", `Literal for ${criterion.id} must be nonempty and at most 256 UTF-8 bytes.`);
      }
      return { id: criterion.id, predicate: criterion.predicate, path, literal: criterion.literal };
    }
    return { id: criterion.id, predicate: criterion.predicate, path };
  });
  return { criteria, specSha256: value.specSha256 };
}

/**
 * Evaluate an opt-in map read from the same frozen candidate tree as its Spec.
 * `candidateFiles` comes from `git ls-tree`; `readCandidateFile` reads blobs
 * from that exact candidate. No criterion can contain a command or prose rule.
 */
export function evaluateRequirementTraceability({
  specPath,
  candidate,
  candidateFiles,
  readCandidateFile,
}) {
  const spec = normalizedPath(specPath, "Spec path");
  if (!isObject(candidate) || !OID.test(candidate.commit) || !OID.test(candidate.tree) || candidate.commit === candidate.tree) {
    fail("RT-CANDIDATE", "Exact candidate commit and tree are required.");
  }
  if (!(candidateFiles instanceof Map) || typeof readCandidateFile !== "function") {
    fail("RT-INPUT", "Candidate inventory and reader are required.");
  }
  const mapPath = requirementMapPath(spec);
  const mapFile = candidateFiles.get(mapPath);
  if (mapFile === undefined) {
    return { schema: REQUIREMENT_TRACEABILITY_RESULT_SCHEMA, mode: "undeclared", candidate, specPath: spec, mapPath, criteria: [], missingCriteria: [] };
  }
  if (!mapFile.readable) fail("RT-MAP-FILE", `Requirement map must be a regular candidate file: ${mapPath}`);
  const specFile = candidateFiles.get(spec);
  if (!specFile?.readable) fail("RT-SPEC-FILE", `Spec must be a regular candidate file: ${spec}`);
  const specBytes = readCandidateFile(spec);
  const mapBytes = readCandidateFile(mapPath);
  const parsed = parseMap(mapBytes, spec);
  if (parsed.specSha256 !== sha256(specBytes)) {
    fail("RT-MAP-SPEC-DIGEST", "Requirement map is stale for the exact candidate Spec bytes.");
  }
  const criteria = parsed.criteria;
  const evaluations = criteria.map((criterion) => {
    const target = candidateFiles.get(criterion.path);
    if (target !== undefined && !target.readable) {
      fail("RT-TARGET-FILE", `Criterion ${criterion.id} targets a non-regular candidate file: ${criterion.path}`);
    }
    let present = target !== undefined;
    if (present && criterion.predicate === "file-contains-literal") {
      const bytes = readCandidateFile(criterion.path);
      if (bytes.byteLength > REQUIREMENT_SOURCE_MAX_BYTES) {
        fail("RT-TARGET-SIZE", `Criterion ${criterion.id} targets a file larger than ${REQUIREMENT_SOURCE_MAX_BYTES} bytes.`);
      }
      present = Buffer.from(bytes).toString("utf8").includes(criterion.literal);
    }
    return {
      id: criterion.id,
      predicate: criterion.predicate,
      path: criterion.path,
      status: present ? "present" : "absent",
      ...(criterion.predicate === "file-contains-literal" ? { literalSha256: sha256(criterion.literal) } : {}),
    };
  });
  return {
    schema: REQUIREMENT_TRACEABILITY_RESULT_SCHEMA,
    mode: "declared",
    candidate,
    specPath: spec,
    specSha256: parsed.specSha256,
    map: { path: mapPath, blobOid: mapFile.blobOid, sha256: sha256(mapBytes) },
    criteria: evaluations,
    missingCriteria: evaluations.filter(({ status }) => status === "absent").map(({ id, predicate, path }) => ({ id, predicate, path })),
  };
}
