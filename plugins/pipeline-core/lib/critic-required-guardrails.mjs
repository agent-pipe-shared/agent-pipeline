// SPDX-License-Identifier: SUL-1.0
/**
 * One derivation of the guardrail paths a Critic review requires, shared by the
 * dispatch preflight (and, in a later slice, the diagnostic evidence producer).
 *
 * The required set is the union of: the explicit guardrails the caller names,
 * the governance-derived paths (candidate manifest, governance guidelines and
 * policies, and every changed path that triggers a requirement such as
 * `changed-manifest`), and the declared requirement-map path. Every path is
 * read from the frozen candidate tree; nothing here writes.
 *
 * Failures throw CriticGuardrailDerivationError carrying the CDP-* code the
 * preflight has always used, so the caller can re-raise them unchanged.
 */
import { spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";

import { parseYaml } from "./yaml-lite.mjs";
import { isSuccessfulSpawn } from "./successful-spawn.mjs";
import {
  CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA,
  deriveCriticPacketGovernance,
} from "./critic-packet-governance.mjs";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const PATH_MAX = 240;
const CANDIDATE_SOURCE_MAX_BYTES = 16 * 1024 * 1024;
const MANIFEST_PATH = ".claude/pipeline.yaml";

export class CriticGuardrailDerivationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CriticGuardrailDerivationError";
    this.code = code;
  }
}

function fail(code, message) { throw new CriticGuardrailDerivationError(code, message); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function normalizePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > PATH_MAX || value.trim() !== value
    || value.includes("\\") || value.includes("\0") || isAbsolute(value) || value.startsWith("./") || value.endsWith("/")) {
    fail("CDP-PATH", `${label} must be a bounded normalized repository-relative path.`);
  }
  if (value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail("CDP-PATH", `${label} must be a bounded normalized repository-relative path.`);
  }
  return value;
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!isSuccessfulSpawn(result)) fail("CDP-GIT", `Git observation failed for ${args[0]}.`);
  return String(result.stdout).trim();
}

function candidateInventory(root, candidate) {
  const rows = git(root, ["ls-tree", "-r", "-z", candidate]);
  const files = [];
  for (const row of rows.split("\0")) {
    if (!row) continue;
    const match = row.match(/^(\d{6}) (blob) ([a-f0-9]+)\t(.+)$/s);
    if (!match || !OID.test(match[3])) fail("CDP-TREE", "Candidate tree inventory is malformed.");
    files.push({ path: normalizePath(match[4], "candidate path"), blobOid: match[3], readable: match[1] !== "120000" });
  }
  files.sort((left, right) => compare(left.path, right.path));
  if (new Set(files.map(({ path }) => path)).size !== files.length) fail("CDP-TREE", "Candidate tree contains duplicate paths.");
  return files;
}

function candidateText(root, candidate, path) {
  const result = spawnSync("git", ["-C", root, "show", `${candidate}:${path}`], {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 10_000,
    maxBuffer: CANDIDATE_SOURCE_MAX_BYTES,
  });
  if (!isSuccessfulSpawn(result)) fail("CDP-CANDIDATE-READ", `Cannot read candidate path: ${path}`);
  return String(result.stdout);
}

/**
 * @param {object} input
 * @param {string} input.root repository root
 * @param {string} input.candidate candidate commit
 * @param {string|null} input.base review base (commit or empty-tree oid); unused when changedPaths is given
 * @param {string[]|null} [input.changedPaths] explicit changed paths (current-artifact scope)
 * @param {string[]} input.explicitGuardrails already normalized explicit guardrail paths
 * @param {(ctx: {files: object[], byPath: Map<string, object>}) => string[]} [input.requirementPaths]
 *   invoked after governance derivation; returns the requirement-map paths
 * @param {(stage: string) => void} [input.onStage] receives "inventory", "manifest", "governance"
 * @returns {{files: object[], byPath: Map<string, object>, governance: object,
 *   required: {path: string, reasons: string[]}[], paths: string[]}}
 */
export function deriveRequiredCriticGuardrails({ root, candidate, base = null, changedPaths = null, explicitGuardrails = [], requirementPaths = () => [], onStage = () => {} }) {
  onStage("inventory");
  const files = candidateInventory(root, candidate);
  const byPath = new Map(files.map((file) => [file.path, file]));
  onStage("manifest");
  const manifestFile = byPath.get(MANIFEST_PATH);
  if (!manifestFile?.readable) fail("CDP-MANIFEST", "Candidate manifest is absent or unreadable.");
  let manifest;
  try { manifest = parseYaml(candidateText(root, candidate, MANIFEST_PATH)); }
  catch { fail("CDP-MANIFEST", "Candidate manifest cannot be parsed."); }
  onStage("governance");
  const changed = changedPaths !== null
    ? changedPaths
    : git(root, ["diff", "--name-only", "-z", base, candidate, "--"])
      .split("\0").filter(Boolean).map((path) => normalizePath(path, "changed path")).sort(compare);
  const governance = deriveCriticPacketGovernance({
    schema: CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA,
    manifest,
    candidateFiles: files,
    changedPaths: changed,
  });
  const reasons = new Map();
  const add = (path, reason) => {
    const set = reasons.get(path) ?? new Set();
    set.add(reason);
    reasons.set(path, set);
  };
  for (const path of explicitGuardrails) add(path, "explicit");
  for (const { path, reasons: why } of governance.required) for (const reason of why) add(path, reason);
  for (const path of requirementPaths({ files, byPath })) add(path, "requirement-map");
  const required = [...reasons.entries()]
    .map(([path, set]) => ({ path, reasons: [...set].sort(compare) }))
    .sort((left, right) => compare(left.path, right.path));
  return { files, byPath, governance, required, paths: required.map(({ path }) => path) };
}
