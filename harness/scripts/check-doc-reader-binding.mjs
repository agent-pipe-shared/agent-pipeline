#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Checks whether a committed reader-review closure round binds the current
 * public documentation state. This is deliberately a Git-object checker: a
 * worktree file, a live report, or a boolean claim never satisfies it.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../plugins/pipeline-core/scripts/release-preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..");
export const READER_REVIEW_PATHS = Object.freeze([
  "PIPELINE_FLOW.md",
  "README.md",
  "SETUP.md",
  "docs/README.md",
  "docs/audit-and-evidence.md",
  "docs/cost-and-measurement.md",
  "docs/enforcement.md",
  "docs/overview.md",
  "docs/parallel-work.md",
  "docs/security-controls.md",
  "docs/usage.md",
]);
export const READER_REVIEW_INPUT_PATHS = Object.freeze([
  "docs/product-capability-inventory.json",
  "governance/observation-doc-governance.json",
  "harness/reader-review-protocol.md",
]);

const CHECK_SCHEMA = "pipeline.doc-reader-binding-check.v1";
const SNAPSHOT_SCHEMA = "pipeline.doc-reader-docset-snapshot.v1";
const RECORD_SCHEMA = "pipeline.doc-reader-binding-record.v1";
const DISPOSITION_SCHEMA = "pipeline.doc-reader-disposition.v1";
const SHA = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const FEATURE_ID = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const ROUND_ID = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const FINDING_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const MAX_DOCUMENT_BYTES = 512 * 1024;
const MAX_DOCUMENT_SET_BYTES = 4 * 1024 * 1024;
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_RECORD_BYTES = 256 * 1024;
const MAX_REPORT_BYTES = 1024 * 1024;
const MAX_DISPOSITION_BYTES = 256 * 1024;
const GIT_TIMEOUT_MS = 10_000;
const decoder = new TextDecoder("utf-8", { fatal: true });

class ReaderBindingError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function exactObject(value, keys, label) {
  if (!plainObject(value)) throw new ReaderBindingError("binding", `${label} must be an object`);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new ReaderBindingError("binding", `${label} has an unexpected field set`);
}
function failUsage(message) { throw new ReaderBindingError("usage", message); }
function git(root, args, encoding = "buffer") {
  const result = spawnSync("git", args, { cwd: root, encoding, shell: false, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_DOCUMENT_SET_BYTES + MAX_REPORT_BYTES + MAX_INPUT_BYTES });
  if (result.error) throw new ReaderBindingError("environment", `could not run git: ${result.error.message}`);
  return result;
}
function gitCommit(root, candidate) {
  if (typeof candidate !== "string" || !SHA.test(candidate)) failUsage("--candidate must be a full lower-case 40-hex commit ID");
  const result = git(root, ["rev-parse", "--verify", `${candidate}^{commit}`], "utf8");
  if (result.status !== 0) throw new ReaderBindingError("environment", `candidate ${candidate} does not resolve to a commit`);
  const commit = result.stdout.trim();
  if (!SHA.test(commit)) throw new ReaderBindingError("environment", `candidate ${candidate} resolved to an invalid commit ID`);
  return commit;
}
function gitTree(root, commit) {
  const result = git(root, ["rev-parse", "--verify", `${commit}^{tree}`], "utf8");
  if (result.status !== 0 || !SHA.test(result.stdout.trim())) throw new ReaderBindingError("environment", `could not resolve tree for ${commit}`);
  return result.stdout.trim();
}
function parseTreeEntry(output, path, limit) {
  const match = /^(\d+)\s+(blob)\s+([a-f0-9]{40})\s+(\d+)\t(.+)\n?$/u.exec(output);
  if (!match || match[5] !== path) throw new ReaderBindingError("binding", `${path} is missing or not a regular blob`);
  if (match[1] !== "100644") throw new ReaderBindingError("binding", `${path} must have mode 100644`);
  const size = Number(match[4]);
  if (!Number.isSafeInteger(size) || size < 0 || size > limit) throw new ReaderBindingError("binding", `${path} exceeds its byte limit`);
  return { oid: match[3], size };
}
function readBlob(root, commit, path, limit) {
  const entry = git(root, ["ls-tree", "-l", commit, "--", path], "utf8");
  if (entry.status !== 0) throw new ReaderBindingError("environment", `could not read tree entry for ${path}`);
  const { oid, size } = parseTreeEntry(entry.stdout, path, limit);
  const blob = git(root, ["cat-file", "blob", oid]);
  if (blob.status !== 0 || !Buffer.isBuffer(blob.stdout) || blob.stdout.length !== size) throw new ReaderBindingError("environment", `could not read committed blob for ${path}`);
  return blob.stdout;
}
function readUtf8Json(root, commit, path, limit, label) {
  const bytes = readBlob(root, commit, path, limit);
  let text;
  try { text = decoder.decode(bytes); } catch { throw new ReaderBindingError("binding", `${label} is not valid UTF-8`); }
  try { return { bytes, value: JSON.parse(text) }; } catch { throw new ReaderBindingError("binding", `${label} is not valid JSON`); }
}
function validateFeatureId(featureId) {
  if (typeof featureId !== "string" || !FEATURE_ID.test(featureId)) failUsage("--feature-id must be a safe lower-case identifier");
  return featureId;
}
function coverageForCommit(root, commit) {
  const coverage = [];
  let total = 0;
  for (const path of READER_REVIEW_PATHS) {
    const bytes = readBlob(root, commit, path, MAX_DOCUMENT_BYTES);
    total += bytes.length;
    if (total > MAX_DOCUMENT_SET_BYTES) throw new ReaderBindingError("binding", "covered documentation exceeds its total byte limit");
    coverage.push({ path, sha256: sha256(bytes) });
  }
  return coverage;
}
function inputsForCommit(root, commit) {
  const digests = {};
  for (const path of READER_REVIEW_INPUT_PATHS) digests[path] = sha256(readBlob(root, commit, path, MAX_INPUT_BYTES));
  return {
    capabilityInventorySha256: digests["docs/product-capability-inventory.json"],
    governanceSha256: digests["governance/observation-doc-governance.json"],
    readerProtocolSha256: digests["harness/reader-review-protocol.md"],
  };
}
function docsetSha256(coverage, inputs) {
  const payload = canonicalJson({ coverage: [...coverage].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)), ...inputs });
  return sha256(Buffer.concat([Buffer.from("pipeline.doc-reader-docset.v1\0", "utf8"), Buffer.from(payload, "utf8")]));
}
function sameJson(a, b) { return canonicalJson(a) === canonicalJson(b); }

/** Returns a committed documentation snapshot; it never reads the worktree. */
export function snapshotReaderDocumentation({ root = DEFAULT_ROOT, candidate, featureId } = {}) {
  const safeFeatureId = validateFeatureId(featureId);
  const candidateCommit = gitCommit(resolve(root), candidate);
  const coverage = coverageForCommit(resolve(root), candidateCommit);
  const inputs = inputsForCommit(resolve(root), candidateCommit);
  return Object.freeze({
    schema: SNAPSHOT_SCHEMA,
    candidateCommit,
    featureId: safeFeatureId,
    coverage,
    inputs,
    docsetSha256: docsetSha256(coverage, inputs),
    assurance: "committed-state-and-evidence-presence-only",
  });
}

function recordPath(featureId) { return `specs/${featureId}/evidence/reader-review/record.json`; }
function reportPath(featureId, phase, round, extension) { return `specs/${featureId}/evidence/reader-review/${phase}/${round}.${extension}`; }
function validateDigest(value, label) { if (typeof value !== "string" || !SHA256.test(value)) throw new ReaderBindingError("binding", `${label} must be a sha256 digest`); }
function validateCoverage(value) {
  if (!Array.isArray(value) || value.length !== READER_REVIEW_PATHS.length) throw new ReaderBindingError("binding", "record.coverage must contain every covered path exactly once");
  const expected = READER_REVIEW_PATHS.map((path) => path).sort();
  const actual = [];
  for (const item of value) {
    exactObject(item, ["path", "sha256"], "record.coverage item");
    if (typeof item.path !== "string") throw new ReaderBindingError("binding", "record.coverage path must be a string");
    validateDigest(item.sha256, "record.coverage sha256"); actual.push(item.path);
  }
  if (!sameJson(actual.sort(), expected)) throw new ReaderBindingError("binding", "record.coverage paths differ from the fixed reader scope");
}
function validateReportRef(value, label, featureId, phase, extension) {
  exactObject(value, ["path", "sha256"], `record.${label}`);
  if (typeof value.path !== "string") throw new ReaderBindingError("binding", `record.${label}.path must be a string`);
  validateDigest(value.sha256, `record.${label}.sha256`);
  const prefix = `specs/${featureId}/evidence/reader-review/${phase}/`;
  if (!value.path.startsWith(prefix) || !value.path.endsWith(`.${extension}`)) throw new ReaderBindingError("binding", `record.${label}.path must be under ${phase}`);
  const round = value.path.slice(prefix.length, -(`.${extension}`.length));
  if (!ROUND_ID.test(round)) throw new ReaderBindingError("binding", `record.${label}.path has an unsafe round identifier`);
  return round;
}
function validateDisposition(root, reviewedCommit, value, round) {
  exactObject(value, ["findings", "round", "schema", "status"], "disposition");
  if (value.schema !== DISPOSITION_SCHEMA || value.round !== round || !Array.isArray(value.findings) || !["no-findings", "resolved"].includes(value.status)) throw new ReaderBindingError("binding", "disposition has an invalid schema, round, status, or findings array");
  if (value.status === "no-findings" && value.findings.length !== 0) throw new ReaderBindingError("binding", "no-findings disposition must have an empty findings array");
  if (value.status === "resolved" && value.findings.length === 0) throw new ReaderBindingError("binding", "empty findings require explicit no-findings disposition status");
  const ids = new Set();
  for (const finding of value.findings) {
    exactObject(finding, ["class", "id", "resolutionCommit", "status"], "disposition finding");
    if (typeof finding.id !== "string" || !FINDING_ID.test(finding.id) || ids.has(finding.id)) throw new ReaderBindingError("binding", "disposition finding IDs must be unique safe identifiers");
    ids.add(finding.id);
    if (!["cut", "fileline", "reordering"].includes(finding.class)) throw new ReaderBindingError("binding", "disposition finding class is unknown");
    if (!["resolved", "no-change"].includes(finding.status)) throw new ReaderBindingError("binding", "disposition finding status is unresolved or unknown");
    if (finding.status === "resolved" && (typeof finding.resolutionCommit !== "string" || !SHA.test(finding.resolutionCommit))) throw new ReaderBindingError("binding", "resolved disposition findings require a full resolution commit");
    if (finding.status === "resolved") {
      const resolved = git(root, ["rev-parse", "--verify", `${finding.resolutionCommit}^{commit}`], "utf8");
      if (resolved.status !== 0 || !SHA.test(resolved.stdout.trim())) throw new ReaderBindingError("binding", "resolved disposition commit does not resolve to a real commit");
      const resolution = resolved.stdout.trim();
      const ancestor = git(root, ["merge-base", "--is-ancestor", resolution, reviewedCommit], "utf8");
      if (ancestor.status !== 0) throw new ReaderBindingError("binding", "resolved disposition commit is not an ancestor of reviewedCommit");
    }
    if (finding.status === "no-change" && finding.resolutionCommit !== null) throw new ReaderBindingError("binding", "no-change disposition findings must have null resolutionCommit");
  }
}
function readAndValidateRecord(root, candidateCommit, featureId) {
  const { value: record } = readUtf8Json(root, candidateCommit, recordPath(featureId), MAX_RECORD_BYTES, "reader binding record");
  exactObject(record, ["coverage", "disposition", "docsetSha256", "inputs", "phaseOne", "phaseTwo", "reviewedCommit", "reviewedTree", "schema"], "reader binding record");
  if (record.schema !== RECORD_SCHEMA || typeof record.reviewedCommit !== "string" || !SHA.test(record.reviewedCommit) || typeof record.reviewedTree !== "string" || !SHA.test(record.reviewedTree)) throw new ReaderBindingError("binding", "reader binding record has invalid identity fields");
  validateDigest(record.docsetSha256, "record.docsetSha256"); validateCoverage(record.coverage);
  exactObject(record.inputs, ["capabilityInventorySha256", "governanceSha256", "readerProtocolSha256"], "record.inputs");
  for (const [key, value] of Object.entries(record.inputs)) validateDigest(value, `record.inputs.${key}`);
  const phaseOneRound = validateReportRef(record.phaseOne, "phaseOne", featureId, "phase-one", "md");
  const phaseTwoRound = validateReportRef(record.phaseTwo, "phaseTwo", featureId, "phase-two", "md");
  const dispositionRound = validateReportRef(record.disposition, "disposition", featureId, "disposition", "json");
  if (phaseOneRound !== phaseTwoRound || phaseOneRound !== dispositionRound) throw new ReaderBindingError("binding", "phase-one, phase-two, and disposition must use one round identifier");
  return { record, round: phaseOneRound };
}
function validateEvidence(root, candidateCommit, featureId, record, round) {
  const phaseOne = readBlob(root, candidateCommit, record.phaseOne.path, MAX_REPORT_BYTES);
  const phaseTwo = readBlob(root, candidateCommit, record.phaseTwo.path, MAX_REPORT_BYTES);
  let phaseOneText; let phaseTwoText;
  try { phaseOneText = decoder.decode(phaseOne); phaseTwoText = decoder.decode(phaseTwo); } catch { throw new ReaderBindingError("binding", "reader phase reports must be valid UTF-8"); }
  if (phaseOneText.trim().length === 0 || phaseTwoText.trim().length === 0) throw new ReaderBindingError("binding", "reader phase reports must be nonempty");
  if (sha256(phaseOne) !== record.phaseOne.sha256 || sha256(phaseTwo) !== record.phaseTwo.sha256) throw new ReaderBindingError("binding", "reader phase report digest mismatch");
  const disposition = readUtf8Json(root, candidateCommit, record.disposition.path, MAX_DISPOSITION_BYTES, "reader disposition");
  if (sha256(disposition.bytes) !== record.disposition.sha256) throw new ReaderBindingError("binding", "reader disposition digest mismatch");
  validateDisposition(root, record.reviewedCommit, disposition.value, round);
}

/**
 * Validates a committed closure record. Passing proves only committed-state
 * equality and evidence presence; it cannot establish reader identity,
 * freshness, truthful provenance, or reader judgment quality.
 */
export function checkReaderBinding({ root = DEFAULT_ROOT, candidate, featureId } = {}) {
  let candidateCommit = null; let safeFeatureId = null; let reviewedCommit = null; let docset = null;
  const findings = [];
  try {
    safeFeatureId = validateFeatureId(featureId);
    const resolvedRoot = resolve(root);
    candidateCommit = gitCommit(resolvedRoot, candidate);
    const { record, round } = readAndValidateRecord(resolvedRoot, candidateCommit, safeFeatureId);
    reviewedCommit = record.reviewedCommit;
    const ancestor = git(resolvedRoot, ["merge-base", "--is-ancestor", reviewedCommit, candidateCommit], "utf8");
    if (ancestor.status !== 0) throw new ReaderBindingError("binding", "reviewedCommit is not an ancestor of candidateCommit");
    if (gitTree(resolvedRoot, reviewedCommit) !== record.reviewedTree) throw new ReaderBindingError("binding", "reviewedTree does not match reviewedCommit");
    const reviewed = snapshotReaderDocumentation({ root: resolvedRoot, candidate: reviewedCommit, featureId: safeFeatureId });
    const current = snapshotReaderDocumentation({ root: resolvedRoot, candidate: candidateCommit, featureId: safeFeatureId });
    docset = current.docsetSha256;
    if (record.docsetSha256 !== reviewed.docsetSha256 || record.docsetSha256 !== current.docsetSha256 || !sameJson(record.coverage, reviewed.coverage) || !sameJson(record.coverage, current.coverage) || !sameJson(record.inputs, reviewed.inputs) || !sameJson(record.inputs, current.inputs)) throw new ReaderBindingError("binding", "record does not bind identical reviewed and candidate documentation inputs");
    validateEvidence(resolvedRoot, candidateCommit, safeFeatureId, record, round);
  } catch (error) {
    const kind = error instanceof ReaderBindingError ? error.kind : "environment";
    findings.push(`${kind.toUpperCase()} ${error.message}`);
  }
  return Object.freeze({ schema: CHECK_SCHEMA, status: findings.length === 0 ? "passed" : "failed", candidateCommit, featureId: safeFeatureId, reviewedCommit, docsetSha256: docset, findings, assurance: "committed-state-and-evidence-presence-only" });
}

function parseCli(argv) {
  const values = { snapshot: false };
  const options = new Set(["--root", "--candidate", "--feature-id", "--snapshot"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!options.has(arg) || (arg === "--snapshot" && values.snapshot) || (arg !== "--snapshot" && values[arg.slice(2)] !== undefined)) failUsage("usage: --root <root> --candidate <full40hex> --feature-id <safe-id> [--snapshot]");
    if (arg === "--snapshot") { values.snapshot = true; continue; }
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) failUsage(`missing value for ${arg}`);
    values[arg.slice(2)] = value;
  }
  if (typeof values.root !== "string" || typeof values.candidate !== "string" || typeof values["feature-id"] !== "string") failUsage("usage: --root <root> --candidate <full40hex> --feature-id <safe-id> [--snapshot]");
  return { root: values.root, candidate: values.candidate, featureId: values["feature-id"], snapshot: values.snapshot };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const args = parseCli(process.argv.slice(2));
    const result = args.snapshot ? snapshotReaderDocumentation(args) : checkReaderBinding(args);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = args.snapshot || result.status === "passed" ? 0 : (result.findings.some((finding) => /^(?:ENVIRONMENT|USAGE)\b/u.test(finding)) ? 2 : 1);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
