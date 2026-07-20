// SPDX-License-Identifier: Apache-2.0

/**
 * Deterministic Critic-packet governance preflight.
 *
 * Callers supply a parsed candidate `.claude/pipeline.yaml`, a candidate-file
 * inventory (`path`, Git `blobOid`, `readable`), and candidate changed paths.
 * This pure module derives every required packet reference and binds it to the
 * candidate blob. It intentionally has no runner, model, filesystem, or Git
 * process dependency; the host adapter owns those observations.
 *
 * Input schema: `pipeline.critic-packet-governance-input.v1`
 * Output schema: `pipeline.critic-packet-governance.v1`
 */

export const CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA = "pipeline.critic-packet-governance-input.v1";
export const CRITIC_PACKET_GOVERNANCE_SCHEMA = "pipeline.critic-packet-governance.v1";
export const CRITIC_PACKET_MANIFEST_PATH = ".claude/pipeline.yaml";

const SAFE_BLOB_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const INPUT_KEYS = ["schema", "manifest", "candidateFiles", "changedPaths"];
const CANDIDATE_FILE_KEYS = ["path", "blobOid", "readable"];
const PACKET_KEYS = ["schema", "governance", "required"];
const REQUIRED_KEYS = ["path", "candidateBlobOid", "reasons"];
const FORBIDDEN_SEGMENTS = new Set(["handover", "scratchpad", "scratchpads", "memory", "state-archive"]);

export class CriticPacketGovernanceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CriticPacketGovernanceError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new CriticPacketGovernanceError(code, message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizePath(value, label, { forbid = false } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240 || value.trim() !== value) {
    fail("CPG-PATH", `${label} must be a bounded repository-relative path.`);
  }
  if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value) || value.startsWith("./") || value.endsWith("/")) {
    fail("CPG-PATH", `${label} is not a normalized repository-relative path.`);
  }
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    fail("CPG-PATH", `${label} is not a normalized repository-relative path.`);
  }
  if (forbid && isForbiddenPath(value)) fail("CPG-FORBIDDEN-PATH", `${label} is a handover, state, memory, or scratchpad path.`);
  return value;
}

function isForbiddenPath(path) {
  const lower = path.toLowerCase();
  const parts = lower.split("/");
  return parts.some((part) => FORBIDDEN_SEGMENTS.has(part))
    || parts.at(-1) === "state.md"
    || parts.at(-1) === "history.md"
    || parts.at(-1) === "handover.md";
}

function pathWithin(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

function reasonForChangedPath(path, governance) {
  const reasons = [];
  if (governance !== null && (pathWithin(path, governance.guidelinesPath) || pathWithin(path, governance.policiesPath))) {
    reasons.push("changed-governance");
  }
  if (path.startsWith("governance/") || path.startsWith("policies/") || path.startsWith("guardrails/")) reasons.push("changed-governance");
  if (path.startsWith("roles/") || path.startsWith("plugins/pipeline-core/agents/")) reasons.push("changed-role");
  if (path.startsWith("plugins/pipeline-core/skills/")) reasons.push("changed-skill");
  if (path.startsWith("plugins/pipeline-core/hooks/") || path.startsWith(".claude/hooks/")) reasons.push("changed-hook");
  if ([".claude/pipeline.yaml", ".claude/pipeline.json", ".claude/settings.json", ".claude/guard-config.json", "pipeline.user.yaml"].includes(path)) reasons.push("changed-manifest");
  if (path.endsWith(".schema.json") || path.includes("/schemas/")) reasons.push("changed-schema");
  if (path === "docs/operating-model.md" || path.startsWith("harness/") || path.startsWith("templates/prompts/")
    || path.startsWith("plugins/pipeline-core/lib/workflow-") || path.startsWith("plugins/pipeline-core/lib/continuity-")
    || path === "plugins/pipeline-core/lib/review-economy.mjs" || path === "plugins/pipeline-core/lib/routing-projection.mjs"
    || path.startsWith("plugins/pipeline-core/scripts/")) reasons.push("changed-flow");
  return [...new Set(reasons)].sort(compareText);
}

function normalizeCandidateFiles(value) {
  if (!Array.isArray(value)) fail("CPG-CANDIDATE-FILES", "candidateFiles must be an array.");
  const files = value.map((entry) => {
    if (!hasExactKeys(entry, CANDIDATE_FILE_KEYS)) fail("CPG-CANDIDATE-FILE-SHAPE", "Each candidate file must bind path, blobOid, and readability.");
    const path = normalizePath(entry.path, "candidate file");
    if (!SAFE_BLOB_OID.test(entry.blobOid) || typeof entry.readable !== "boolean") {
      fail("CPG-CANDIDATE-FILE-SHAPE", `Candidate file ${path} has an invalid blob binding.`);
    }
    return { path, blobOid: entry.blobOid, readable: entry.readable };
  }).sort((left, right) => compareText(left.path, right.path));
  if (new Set(files.map(({ path }) => path)).size !== files.length) fail("CPG-CANDIDATE-DUPLICATE", "candidateFiles contains duplicate paths.");
  return files;
}

function deriveGovernance(manifest, candidateFiles) {
  const manifestFile = candidateFiles.find(({ path }) => path === CRITIC_PACKET_MANIFEST_PATH);
  if (manifest === null) {
    if (manifestFile !== undefined) fail("CPG-MANIFEST-MISSING", "A candidate manifest exists but was not parsed for the Critic packet.");
    return null;
  }
  if (!isObject(manifest)) fail("CPG-MANIFEST-SHAPE", "manifest must be null or a parsed object.");
  if (manifestFile === undefined) fail("CPG-MANIFEST-BLOB-MISSING", "The parsed manifest has no candidate blob binding.");
  if (!manifestFile.readable) fail("CPG-CANDIDATE-UNREADABLE", "The candidate manifest is unreadable.");
  if (!Object.hasOwn(manifest, "governance")) return null;
  if (!isObject(manifest.governance)) fail("CPG-GOVERNANCE-SHAPE", "manifest.governance must be an object.");
  if (typeof manifest.governance.guidelines_path !== "string" || typeof manifest.governance.policies_path !== "string") {
    fail("CPG-GOVERNANCE-PATHS", "A governance block must declare both guidelines_path and policies_path for Critic review.");
  }
  const guidelinesPath = normalizePath(manifest.governance.guidelines_path, "governance.guidelines_path", { forbid: true });
  const policiesPath = normalizePath(manifest.governance.policies_path, "governance.policies_path", { forbid: true });
  return { manifestFile, guidelinesPath, policiesPath };
}

function buildPacket(input) {
  if (!hasExactKeys(input, INPUT_KEYS)) fail("CPG-INPUT-SHAPE", "Input must have exactly schema, manifest, candidateFiles, and changedPaths.");
  if (input.schema !== CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA) fail("CPG-INPUT-SCHEMA", "Unsupported Critic packet governance input schema.");
  const candidateFiles = normalizeCandidateFiles(input.candidateFiles);
  if (!Array.isArray(input.changedPaths)) fail("CPG-CHANGED-PATHS", "changedPaths must be an array.");
  const changedPaths = input.changedPaths.map((path) => normalizePath(path, "changed path")).sort(compareText);
  if (new Set(changedPaths).size !== changedPaths.length) fail("CPG-CHANGED-DUPLICATE", "changedPaths contains duplicate paths.");
  const byPath = new Map(candidateFiles.map((entry) => [entry.path, entry]));
  const governance = deriveGovernance(input.manifest, candidateFiles);
  const reasonsByPath = new Map();
  function require(path, reason) {
    const normalized = normalizePath(path, "required Critic path", { forbid: true });
    const candidate = byPath.get(normalized);
    if (candidate === undefined) fail("CPG-CANDIDATE-MISSING", `Required Critic path is absent from the candidate: ${normalized}`);
    if (!candidate.readable) fail("CPG-CANDIDATE-UNREADABLE", `Required Critic path is unreadable: ${normalized}`);
    const reasons = reasonsByPath.get(normalized) ?? new Set();
    reasons.add(reason);
    reasonsByPath.set(normalized, reasons);
  }

  if (governance !== null) {
    require(CRITIC_PACKET_MANIFEST_PATH, "manifest-governance-binding");
    const guidelineFiles = candidateFiles.filter(({ path }) => pathWithin(path, governance.guidelinesPath));
    if (guidelineFiles.length === 0) fail("CPG-GUIDELINES-MISSING", "governance.guidelines_path resolves to no candidate files.");
    for (const { path } of guidelineFiles) require(path, "governance-guidelines");
    const policyFiles = candidateFiles.filter(({ path }) => pathWithin(path, governance.policiesPath));
    if (policyFiles.length === 0) fail("CPG-POLICIES-MISSING", "governance.policies_path resolves to no candidate files.");
    const checklistPath = `${governance.policiesPath}/checklist.md`;
    if (!byPath.has(checklistPath)) fail("CPG-POLICY-CHECKLIST-MISSING", "governance.policies_path must contain checklist.md for Critic review.");
    for (const { path } of policyFiles) require(path, "governance-policies");
  }

  for (const path of changedPaths) {
    for (const reason of reasonForChangedPath(path, governance === null ? null : governance)) require(path, reason);
  }

  const required = [...reasonsByPath.entries()].map(([path, reasons]) => ({
    path,
    candidateBlobOid: byPath.get(path).blobOid,
    reasons: [...reasons].sort(compareText),
  })).sort((left, right) => compareText(left.path, right.path));
  return {
    schema: CRITIC_PACKET_GOVERNANCE_SCHEMA,
    governance: governance === null
      ? null
      : { manifestPath: CRITIC_PACKET_MANIFEST_PATH, guidelinesPath: governance.guidelinesPath, policiesPath: governance.policiesPath },
    required,
  };
}

/** Build the only valid candidate-blob-bound Critic governance packet section. */
export function deriveCriticPacketGovernance(input) {
  return buildPacket(input);
}

function packetHasForbiddenPath(packet) {
  return Array.isArray(packet?.required) && packet.required.some(({ path }) => typeof path === "string" && isForbiddenPath(path));
}

/**
 * Validate a caller-held packet section against candidate observations. Omitting a
 * required path or changing its candidate blob is a hard preflight rejection.
 */
export function validateCriticPacketGovernance(input, packet) {
  let expected;
  try {
    expected = buildPacket(input);
  } catch (error) {
    return { ok: false, code: error instanceof CriticPacketGovernanceError ? error.code : "CPG-INPUT-INVALID" };
  }
  if (!hasExactKeys(packet, PACKET_KEYS) || packet.schema !== CRITIC_PACKET_GOVERNANCE_SCHEMA || !Array.isArray(packet.required)) {
    return { ok: false, code: "CPG-PACKET-SHAPE" };
  }
  if (packetHasForbiddenPath(packet)) return { ok: false, code: "CPG-PACKET-FORBIDDEN" };
  const expectedByPath = new Map(expected.required.map((entry) => [entry.path, entry]));
  const actualByPath = new Map(packet.required.filter(isObject).map((entry) => [entry.path, entry]));
  for (const [path, entry] of expectedByPath) {
    const actual = actualByPath.get(path);
    if (actual === undefined) return { ok: false, code: "CPG-PACKET-OMITTED" };
    if (actual.candidateBlobOid !== entry.candidateBlobOid) return { ok: false, code: "CPG-PACKET-BLOB-MISMATCH" };
  }
  if (!packet.required.every((entry) => hasExactKeys(entry, REQUIRED_KEYS)) || canonicalJson(packet) !== canonicalJson(expected)) {
    return { ok: false, code: "CPG-PACKET-MISMATCH" };
  }
  return { ok: true, code: "CPG-PACKET-VALID" };
}
