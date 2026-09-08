#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Read-only admission for a path-only Critic dispatch.
 *
 * This intentionally does less than critic-packet-preflight: it never creates
 * a checkout, packet, child, or receipt.  Its only job is to prove that the
 * Elephant's proposed request is internally coherent before an independent
 * Critic is asked to spend a turn on it.  It does not probe or select a
 * runner, so a packet-ready result is deliberately not a spawn authorization.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

import { parseYaml } from "../lib/yaml-lite.mjs";
import {
  CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA,
  deriveCriticPacketGovernance,
} from "../lib/critic-packet-governance.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const CRITIC_DISPATCH_PREFLIGHT_SCHEMA = "pipeline.critic-dispatch-preflight.v1";
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const PATH_MAX = 240;
const EVIDENCE_MAX_BYTES = 1024 * 1024;

export class CriticDispatchPreflightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CriticDispatchPreflightError";
    this.code = code;
  }
}

// Only failures created at this producer's own branches supply typed source codes.
// A foreign thrown value is rethrown unchanged and observed as CDP-UNEXPECTED;
// observing it must never inspect its properties or invoke a proxy/getter.
const sourceFailureCodes = new WeakMap();
function fail(code, message) {
  const error = new CriticDispatchPreflightError(code, message);
  sourceFailureCodes.set(error, code);
  throw error;
}

/**
 * Trusted synchronous callbacks only. Return values are ignored without reading
 * then/getters or assimilating Promises. Independently scheduled rejections or
 * arbitrary callback side effects are outside this contract; there is no sandbox.
 */
function observeSource(observer, stage, outcome, code, candidate, specSha256) {
  if (typeof observer !== "function") return;
  try {
    observer({
      schema: "pipeline.critic-preflight-observation.v1",
      producer: "critic-dispatch-preflight",
      observationRevision: 1,
      stage,
      outcome,
      code,
      candidate: candidate === null ? null : { commit: candidate.commit, tree: candidate.tree },
      specSha256,
    });
  } catch {
    // Observation cannot replace the already chosen producer result/exception.
  }
}
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

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

function uniquePaths(values, label) {
  if (!Array.isArray(values)) fail("CDP-PATHS", `${label} must be an array.`);
  const paths = values.map((path) => normalizePath(path, label)).sort(compare);
  if (new Set(paths).size !== paths.length) fail("CDP-DUPLICATE-PATH", `${label} contains a duplicate path.`);
  return paths;
}

function gitOrNull(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout).trim();
}

function git(root, args) {
  const value = gitOrNull(root, args);
  if (value === null) fail("CDP-GIT", `Git observation failed for ${args[0]}.`);
  return value;
}

/**
 * A root commit has no parent, so the base a caller offers it is the empty
 * tree -- and `^{commit}` peeling of the empty tree fails, because the empty
 * tree is not a commit. Diffing a commit against the empty tree is ordinary,
 * well-defined git; only the commit-peel of that one sentinel value is not.
 * Every other base ref still resolves exactly as before: this is one more
 * chance given only to a base that already failed commit-peeling, not a
 * relaxation of what counts as a valid base.
 */
function emptyTreeOid(root) {
  const result = spawnSync("git", ["-C", root, "hash-object", "-t", "tree", "--stdin"], {
    input: "",
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) fail("CDP-GIT", "Git observation failed for hash-object.");
  return String(result.stdout).trim();
}

function resolveBase(root, base) {
  const baseCommit = gitOrNull(root, ["rev-parse", "--verify", `${base}^{commit}`]);
  if (baseCommit !== null) return { commit: baseCommit, tree: git(root, ["rev-parse", `${baseCommit}^{tree}`]) };
  const baseTree = gitOrNull(root, ["rev-parse", "--verify", `${base}^{tree}`]);
  if (baseTree !== null && baseTree === emptyTreeOid(root)) return { commit: null, tree: baseTree };
  fail("CDP-GIT", "Git observation failed for rev-parse.");
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
    maxBuffer: EVIDENCE_MAX_BYTES,
  });
  if (result.error || result.status !== 0) fail("CDP-CANDIDATE-READ", `Cannot read candidate path: ${path}`);
  return String(result.stdout);
}

function localEvidence(root, path) {
  const realRoot = realpathSync(root);
  const absolute = resolve(realRoot, path);
  const rel = relative(realRoot, absolute);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("CDP-EVIDENCE-PATH", "Evidence path escapes the repository root.");
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > EVIDENCE_MAX_BYTES) fail("CDP-EVIDENCE-FILE", `Evidence is not a bounded regular file: ${path}`);
  return readFileSync(absolute);
}

function matchingCandidateEvidence(bytes, candidateCommit, candidateTree, path) {
  let value;
  try { value = JSON.parse(bytes); } catch { fail("CDP-EVIDENCE-JSON", `Evidence is not JSON: ${path}`); }
  // Verify evidence uses the candidate at its root, whereas Security and gate
  // evidence nest it below `candidate` with additional observation metadata.
  // Both forms are valid only when they bind this exact frozen commit/tree.
  const nested = value?.candidate;
  const binding = isObject(nested) && typeof nested.commit === "string" && typeof nested.tree === "string"
    ? nested
    : value;
  if (!isObject(binding) || binding.commit !== candidateCommit || binding.tree !== candidateTree) {
    fail("CDP-EVIDENCE-BINDING", `Evidence is missing or stale for the exact candidate: ${path}`);
  }
  return { path, sha256: sha256(bytes), candidate: { commit: candidateCommit, tree: candidateTree } };
}

function requiredCandidateReadback(root, candidate, byPath, paths, label) {
  return paths.map((path) => {
    const file = byPath.get(path);
    if (!file || !file.readable) fail("CDP-CANDIDATE-PATH", `${label} is absent or unreadable in the candidate: ${path}`);
    const text = candidateText(root, candidate, path);
    return { path, blobOid: file.blobOid, sha256: sha256(text) };
  });
}

/**
 * Validate a complete Critic request without creating any durable or external
 * state. Evidence is a local, bounded JSON observation that binds the frozen
 * candidate; Spec and guardrails are always read from that candidate tree.
 */
export function preflightCriticDispatch({ root, base, candidate, specPath, guardrailPaths, evidencePaths, priorCriticEvidencePath = null }, observer = null) {
  let stage = "request", sourceCandidate = null, sourceSpecSha256 = null;
  try {
    if (typeof root !== "string" || root.length === 0 || typeof base !== "string" || typeof candidate !== "string") {
      fail("CDP-INPUT", "root, base, and candidate are required.");
    }
    const realRoot = realpathSync(root);
    stage = "candidate";
    const { commit: baseCommit, tree: baseTree } = resolveBase(realRoot, base);
    const candidateCommit = git(realRoot, ["rev-parse", "--verify", `${candidate}^{commit}`]);
    const candidateTree = git(realRoot, ["rev-parse", `${candidateCommit}^{tree}`]);
    if (![baseTree, candidateCommit, candidateTree].every((value) => OID.test(value))) fail("CDP-REF", "Git returned an invalid candidate binding.");
    if (baseCommit !== null && !OID.test(baseCommit)) fail("CDP-REF", "Git returned an invalid candidate binding.");
    sourceCandidate = { commit: candidateCommit, tree: candidateTree };
    if (baseCommit === candidateCommit) fail("CDP-RANGE", "Critic base and candidate must be different commits.");

    stage = "paths";
    const spec = normalizePath(specPath, "spec path");
    const guardrails = uniquePaths(guardrailPaths, "guardrail path");
    const evidence = uniquePaths(evidencePaths, "evidence path");
    if (evidence.length === 0) fail("CDP-EVIDENCE-REQUIRED", "At least one fresh candidate-evidence artifact is required.");
    const prior = priorCriticEvidencePath === null ? null : normalizePath(priorCriticEvidencePath, "prior Critic evidence path");
    if (prior !== null && evidence.includes(prior)) fail("CDP-PRIOR-ALIASED", "Prior Critic evidence cannot satisfy fresh candidate evidence.");

    stage = "inventory";
    const files = candidateInventory(realRoot, candidateCommit);
    const byPath = new Map(files.map((file) => [file.path, file]));
    stage = "manifest";
    const manifestFile = byPath.get(".claude/pipeline.yaml");
    if (!manifestFile?.readable) fail("CDP-MANIFEST", "Candidate manifest is absent or unreadable.");
    let manifest;
    try { manifest = parseYaml(candidateText(realRoot, candidateCommit, ".claude/pipeline.yaml")); }
    catch { fail("CDP-MANIFEST", "Candidate manifest cannot be parsed."); }
    stage = "governance";
    const changedPaths = git(realRoot, ["diff", "--name-only", "-z", baseCommit ?? baseTree, candidateCommit, "--"])
      .split("\0").filter(Boolean).map((path) => normalizePath(path, "changed path")).sort(compare);
    const governance = deriveCriticPacketGovernance({
      schema: CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA,
      manifest,
      candidateFiles: files,
      changedPaths,
    });
    const governancePaths = governance.required.map(({ path }) => path);
    const allGuardrails = [...new Set([...guardrails, ...governancePaths])].sort(compare);
    stage = "candidate-files";
    const specReadback = requiredCandidateReadback(realRoot, candidateCommit, byPath, [spec], "Spec")[0];
    sourceSpecSha256 = specReadback.sha256;
    const guardrailReadback = requiredCandidateReadback(realRoot, candidateCommit, byPath, allGuardrails, "guardrail");
    stage = "evidence";
    const evidenceReadback = evidence.map((path) => matchingCandidateEvidence(localEvidence(realRoot, path), candidateCommit, candidateTree, path));
    stage = "prior-evidence";
    const priorReadback = prior === null ? null : { path: prior, sha256: sha256(localEvidence(realRoot, prior)) };

    const result = {
      schema: CRITIC_DISPATCH_PREFLIGHT_SCHEMA,
      // The selected Codex transport is a separate, mandatory no-child
      // preflight.  Calling this result "ready" caused coordinators to mistake
      // packet integrity for a runnable Critic lane and to start an unbounded
      // generic child when that lane was unavailable.
      status: "packet-ready",
      base: { commit: baseCommit, tree: baseTree },
      candidate: { commit: candidateCommit, tree: candidateTree },
      spec: specReadback,
      guardrails: guardrailReadback,
      governance,
      evidence: evidenceReadback,
      priorCriticEvidence: priorReadback,
      dispatch: {
        mode: "path-only", childCreated: false, packetCreated: false, stateMutated: false,
        spawnAuthorized: false, requiredNextGate: "selected-runner-transport",
      },
    };
    observeSource(observer, "complete", "packet-ready", null, sourceCandidate, sourceSpecSha256);
    return result;
  } catch (error) {
    observeSource(observer, stage, "rejected", sourceFailureCodes.get(error) ?? "CDP-UNEXPECTED", sourceCandidate, sourceSpecSha256);
    throw error;
  }
}

export function parseCriticDispatchPreflightArgs(argv) {
  const values = { guardrailPaths: [], evidencePaths: [], priorCriticEvidencePath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (["--root", "--base", "--candidate", "--spec", "--guardrail", "--evidence", "--prior-critic"].includes(flag) && value === undefined) fail("CDP-ARGUMENT", `${flag} requires a value.`);
    if (flag === "--root") values.root = value;
    else if (flag === "--base") values.base = value;
    else if (flag === "--candidate") values.candidate = value;
    else if (flag === "--spec") values.specPath = value;
    else if (flag === "--guardrail") values.guardrailPaths.push(value);
    else if (flag === "--evidence") values.evidencePaths.push(value);
    else if (flag === "--prior-critic") values.priorCriticEvidencePath = value;
    else fail("CDP-ARGUMENT", `Unknown argument: ${flag}`);
    index += 1;
  }
  return values;
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const result = preflightCriticDispatch(parseCriticDispatchPreflightArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof CriticDispatchPreflightError ? error.code : "CDP-UNEXPECTED";
    process.stderr.write(`${JSON.stringify({ schema: CRITIC_DISPATCH_PREFLIGHT_SCHEMA, status: "rejected", code })}\n`);
    process.exitCode = 1;
  }
}
