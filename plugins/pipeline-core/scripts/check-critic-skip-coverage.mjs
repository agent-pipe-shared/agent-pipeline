#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Per-dispatch Critic disposition enforcement for dispatch-record v3. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CRITIC_SKIP_SCHEMA, criticDecisionPathFinding, criticDisposition } from "../lib/critic-skip-decision.mjs";
import { DISPATCH_RECORD_SCHEMA, PREVIOUS_DISPATCH_RECORD_SCHEMA, LEGACY_DISPATCH_RECORD_SCHEMA, isTerminalOutcome, normalizeDispatchRecordPath, validateDispatchRecord, validatePreviousDispatchRecord, validateLegacyDispatchRecord } from "../lib/dispatch-record.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");
const EVIDENCE_DIR = "evidence";
const DISPATCH_RECORD_PATTERN = /^dispatch-record-.+\.json$/u;
export const LEGACY_RECONCILE_SCHEMA = "pipeline.legacy-dispatch-reconcile-index.v1";
export const DEFAULT_LEGACY_RECONCILE_INDEX_PATH = "evidence/legacy-dispatch-reconcile-index.json";
const SHA256 = /^[a-f0-9]{64}$/u;

function physicalRegularFile(root, path, label) {
  let absolute;
  try { absolute = resolve(root, path); } catch (error) { return { finding: `${label}: path could not be resolved (${error.message})` }; }
  try { normalizeDispatchRecordPath(path, label); }
  catch (error) { return { finding: `${label}: ${error.message}` }; }
  const physicalRoot = realpathSync(resolve(root));
  const rel = relative(physicalRoot, absolute);
  if (rel === "" || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) return { finding: `${label}: path escapes repository root` };
  try {
    const info = lstatSync(absolute);
    if (!info.isFile() || info.isSymbolicLink()) return { finding: `${label}: path is not a physical file` };
    const physical = realpathSync(absolute);
    const physicalRel = relative(physicalRoot, physical);
    if (physicalRel === "" || physicalRel === ".." || physicalRel.startsWith("../") || physicalRel.startsWith("..\\")) return { finding: `${label}: physical path escapes repository root` };
    return { bytes: readFileSync(absolute) };
  } catch (error) { return { finding: `${label}: file is missing or unreadable (${error.message})` }; }
}

function exactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) throw new Error(`${label} is not closed (unknown=${unknown.join(",") || "none"}; missing=${missing.join(",") || "none"})`);
}

function digestMatches(bytes, expected, label) {
  if (typeof expected !== "string" || !SHA256.test(expected)) return `${label}: sha256 must be a lowercase SHA-256 digest`;
  const actual = createHash("sha256").update(bytes).digest("hex");
  return actual === expected ? null : `${label}: SHA-256 digest mismatch`;
}

/**
 * Load the append-only reconciliation index for old terminal records which
 * truthfully produced no commit. The index is intentionally a byte binding:
 * editing either the historical record or its named successor/evidence makes
 * the corpus fail again rather than silently grandfathering new content.
 */
export function readLegacyDispatchReconcileIndex(root, { indexPath = DEFAULT_LEGACY_RECONCILE_INDEX_PATH } = {}) {
  const findings = [];
  const entriesByPath = new Map();
  const absolute = resolve(root, indexPath);
  if (!existsSync(absolute)) return { findings, entriesByPath, indexPresent: false };
  let index;
  try { index = JSON.parse(readFileSync(absolute, "utf8")); }
  catch (error) { return { findings: [`${indexPath}: could not be read as valid JSON (${error.message})`], entriesByPath, indexPresent: true }; }
  try {
    exactObject(index, ["schema", "entries"], "legacy reconcile index");
    if (index.schema !== LEGACY_RECONCILE_SCHEMA) throw new Error(`legacy reconcile index schema must be ${LEGACY_RECONCILE_SCHEMA}`);
    if (!Array.isArray(index.entries) || index.entries.length === 0 || index.entries.length > 512) throw new Error("legacy reconcile index entries must be a non-empty bounded array");
  } catch (error) { return { findings: [`${indexPath}: invalid legacy reconcile index (${error.message})`], entriesByPath, indexPresent: true }; }
  for (const [position, entry] of index.entries.entries()) {
    const label = `${indexPath}: entries[${position}]`;
    try {
      exactObject(entry, ["recordPath", "recordSha256", "terminalKind", "disposition"], label);
      normalizeDispatchRecordPath(entry.recordPath, `${label}.recordPath`);
      if (!/^evidence\/dispatch-record-.+\.json$/u.test(entry.recordPath)) throw new Error(`${label}.recordPath must name an evidence dispatch record`);
      if (entriesByPath.has(entry.recordPath)) throw new Error(`${label}.recordPath duplicates an earlier reconciliation entry`);
      if (!["read-only", "stopped-without-commit"].includes(entry.terminalKind)) throw new Error(`${label}.terminalKind is invalid`);
      exactObject(entry.disposition, ["kind", "path", "sha256"], `${label}.disposition`);
      if (!["successor", "evidence"].includes(entry.disposition.kind)) throw new Error(`${label}.disposition.kind is invalid`);
      normalizeDispatchRecordPath(entry.disposition.path, `${label}.disposition.path`);
      if (!/^(?:evidence|backlog\/evidence)\//u.test(entry.disposition.path)) throw new Error(`${label}.disposition.path must be under evidence/ or backlog/evidence/`);
      if (entry.disposition.kind === "successor" && !/^evidence\/dispatch-record-.+\.json$/u.test(entry.disposition.path)) throw new Error(`${label}.disposition successor must name an evidence dispatch record`);
      if (!existsSync(resolve(root, entry.recordPath))) {
        continue;
      }
      if (!existsSync(resolve(root, entry.recordPath))) {
        continue;
      }
      const source = physicalRegularFile(root, entry.recordPath, `${label}.recordPath`);
      if (source.finding) throw new Error(source.finding);
      const sourceDigestFinding = digestMatches(source.bytes, entry.recordSha256, `${label}.recordSha256`);
      if (sourceDigestFinding) throw new Error(sourceDigestFinding);
      const target = physicalRegularFile(root, entry.disposition.path, `${label}.disposition.path`);
      if (target.finding) throw new Error(target.finding);
      const targetDigestFinding = digestMatches(target.bytes, entry.disposition.sha256, `${label}.disposition.sha256`);
      if (targetDigestFinding) throw new Error(targetDigestFinding);
      entriesByPath.set(entry.recordPath, entry);
    } catch (error) { findings.push(`${label}: invalid legacy reconciliation (${error.message})`); }
  }
  return { findings, entriesByPath, indexPresent: true };
}

function reconciledNoCommitFinding(record, entry) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "reconciled historical record must be an object";
  if (!Array.isArray(record.commits) || record.commits.length !== 0) return "reconciled historical record must declare exactly zero commits";
  if (!isTerminalOutcome(record.outcome)) return "reconciled historical record must declare a terminal outcome";
  if (entry.terminalKind === "read-only" && !["completed", "completed-analysis-only", "analysis-complete", "partial-analysis-only"].includes(record.outcome) && !/(?:read-only|analysis-only)/u.test(record.outcome)) return "read-only reconciliation requires a completed, read-only, or analysis-only historical outcome";
  return null;
}

export function walkDispatchRecords(root) {
  const findings = [];
  const records = [];
  let entries;
  try { entries = readdirSync(resolve(root, EVIDENCE_DIR), { withFileTypes: true }); }
  catch (error) { return { records, findings: [`${EVIDENCE_DIR} is missing or unreadable: ${error.message}`], filesScanned: 0 }; }
  const names = entries.filter((entry) => entry.isFile() && DISPATCH_RECORD_PATTERN.test(entry.name)).map((entry) => entry.name).sort();
  for (const name of names) {
    const path = `${EVIDENCE_DIR}/${name}`;
    try {
      const bytes = readFileSync(resolve(root, path));
      records.push({ path, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), record: JSON.parse(bytes.toString("utf8")) });
    }
    catch (error) { findings.push(`${path}: could not be read as valid JSON (${error.message})`); }
  }
  return { records, findings, filesScanned: names.length };
}


function legacySchema(record) {
  return record?.schema === undefined || record?.schema === "pipeline.dispatch-record.v1" || record?.schema === "pipeline.dispatch-evidence.v1" || record?.schema === LEGACY_DISPATCH_RECORD_SCHEMA;
}

function verifyCriticEvidence(root, sourcePath, reference) {
  const absolute = resolve(root, reference.path);
  const physicalRoot = realpathSync(resolve(root));
  const rel = relative(physicalRoot, absolute);
  if (rel === "" || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) return `${sourcePath}: criticEvidence path escapes repository root`;
  let info;
  let bytes;
  try {
    info = lstatSync(absolute);
    if (!info.isFile() || info.isSymbolicLink()) return `${sourcePath}: criticEvidence path is not a physical file: ${reference.path}`;
    const physicalEvidence = realpathSync(absolute);
    const physicalRel = relative(physicalRoot, physicalEvidence);
    if (physicalRel === "" || physicalRel === ".." || physicalRel.startsWith("../") || physicalRel.startsWith("..\\")) return `${sourcePath}: criticEvidence physical path escapes repository root`;
    bytes = readFileSync(absolute);
  } catch (error) { return `${sourcePath}: criticEvidence is missing or unreadable at ${reference.path} (${error.message})`; }
  const actual = createHash("sha256").update(bytes).digest("hex");
  return actual === reference.sha256 ? null : `${sourcePath}: criticEvidence digest mismatch for ${reference.path}`;
}

export function readCommitChangedPaths(root, commits, { execFile = execFileSync } = {}) {
  if (!Array.isArray(commits)) throw new Error("criticSkip commits must be an array for path verification");
  const paths = new Set();
  for (const sha of commits) {
    const output = execFile("git", ["diff-tree", "--root", "--no-commit-id", "--no-renames", "--name-only", "-r", "-z", sha], {
      cwd: root, encoding: "buffer", maxBuffer: 32 * 1024 * 1024,
    });
    for (const path of Buffer.from(output).toString("utf8").split("\0").filter(Boolean)) paths.add(path);
  }
  return [...paths].sort();
}

export function evaluateRepositoryCriticSkipCoverage(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const readChangedPaths = options.readChangedPaths ?? ((record) => readCommitChangedPaths(root, record.commits));
  const scan = walkDispatchRecords(root);
  const reconciliations = readLegacyDispatchReconcileIndex(root, options);
  const findings = [...scan.findings, ...reconciliations.findings];
  let applicableRecordCount = 0;
  let legacyRecordCount = 0;
  let skipRecordCount = 0;
  let requiredRecordCount = 0;
  let criticEvidenceRecordCount = 0;
  let reconciledLegacyRecordCount = 0;
  for (const entry of scan.records) {
    const { path, record } = entry;
    const reconciliation = reconciliations.entriesByPath.get(path);
    if (reconciliation) {
      const reconciliationFinding = reconciledNoCommitFinding(record, reconciliation);
      if (reconciliationFinding) findings.push(`${path}: ${reconciliationFinding}`);
      else { legacyRecordCount += 1; reconciledLegacyRecordCount += 1; }
      continue;
    }
    if (legacySchema(record)) {
      legacyRecordCount += 1;
      if (record?.schema === LEGACY_DISPATCH_RECORD_SCHEMA) {
        try { validateLegacyDispatchRecord(record); } catch (error) { findings.push(`${path}: invalid legacy v2 record (${error.message})`); }
      }
      continue;
    }
    const isV4 = record?.schema === DISPATCH_RECORD_SCHEMA;
    const isV3 = record?.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA;
    if (!isV3 && !isV4) {
      findings.push(`${path}: unsupported dispatch record schema ${JSON.stringify(record?.schema)}`);
      continue;
    }
    applicableRecordCount += 1;
    try { isV4 ? validateDispatchRecord(record) : validatePreviousDispatchRecord(record); }
    catch (error) { findings.push(`${path}: invalid ${isV4 ? "v4" : "v3"} dispatch record (${error.message})`); continue; }
    const disposition = criticDisposition(record);
    if (disposition === "skipped") {
      try {
        const pathFinding = criticDecisionPathFinding(record.criticSkip, readChangedPaths(record));
        if (pathFinding) findings.push(`${path}: ${pathFinding.reason}`);
        else skipRecordCount += 1;
      } catch (error) {
        findings.push(`${path}: actual changed paths could not be derived (${error.message})`);
      }
      continue;
    }
    if (disposition === "required") {
      requiredRecordCount += 1;
      findings.push(`${path}: Critic is required by ${record.criticRequired.appliedRow}; task/candidate/digest-bound criticEvidence is missing`);
      continue;
    }
    if (disposition === "evidenced") {
      const evidenceFinding = verifyCriticEvidence(root, path, record.criticEvidence);
      if (evidenceFinding) findings.push(evidenceFinding);
      else criticEvidenceRecordCount += 1;
      continue;
    }
    findings.push(`${path}: requires exactly one Critic disposition`);
  }
  const uncoveredRecordCount = applicableRecordCount - skipRecordCount - criticEvidenceRecordCount;
  const ok = findings.length === 0 && uncoveredRecordCount === 0;
  return {
    ok,
    finding: !ok,
    reason: ok
      ? `${skipRecordCount} skipped and ${criticEvidenceRecordCount} evidenced v3/v4 dispatch record(s); ${legacyRecordCount} pre-cutover record(s) preserved as legacy (${reconciledLegacyRecordCount} byte-bound no-commit reconciliation(s))`
      : findings.length > 0
        ? `${findings.length} dispatch/evidence validation finding(s); ${uncoveredRecordCount} applicable v3/v4 record(s) remain uncovered`
        : `${uncoveredRecordCount} of ${applicableRecordCount} applicable v3/v4 dispatch record(s) lack a valid per-record Critic disposition`,
    dispatchedWorkCount: applicableRecordCount,
    applicableRecordCount,
    legacyRecordCount,
    criticArtifactCount: criticEvidenceRecordCount,
    criticEvidenceRecordCount,
    requiredRecordCount,
    skipRecordCount,
    reconciledLegacyRecordCount,
    readFindings: findings,
  };
}

/**
 * Admit exactly one current dispatch record to independent review without
 * treating the pending Critic disposition as completion. This is deliberately
 * separate from coverage: every other v3/v4 record still has to be skipped or
 * evidenced, and malformed or stale corpus entries remain blocking.
 */
export function evaluateReviewAdmission(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const taskId = options.taskId;
  const candidateCommit = options.candidateCommit;
  const readChangedPaths = options.readChangedPaths ?? ((record) => readCommitChangedPaths(root, record.commits));
  const scan = walkDispatchRecords(root);
  const reconciliations = readLegacyDispatchReconcileIndex(root, options);
  const findings = [...scan.findings, ...reconciliations.findings];
  let admittedCount = 0;
  let applicableRecordCount = 0;
  let coveredRecordCount = 0;
  if (typeof taskId !== "string" || taskId.trim() === "") findings.push("review admission taskId is required");
  if (typeof candidateCommit !== "string" || !/^[a-f0-9]{40}$/u.test(candidateCommit)) findings.push("review admission candidateCommit must be a full lowercase Git SHA");

  for (const { path, record } of scan.records) {
    const reconciliation = reconciliations.entriesByPath.get(path);
    if (reconciliation) {
      const reconciliationFinding = reconciledNoCommitFinding(record, reconciliation);
      if (reconciliationFinding) findings.push(`${path}: ${reconciliationFinding}`);
      continue;
    }
    if (legacySchema(record)) {
      if (record?.schema === LEGACY_DISPATCH_RECORD_SCHEMA) {
        try { validateLegacyDispatchRecord(record); } catch (error) { findings.push(`${path}: invalid legacy v2 record (${error.message})`); }
      }
      continue;
    }
    const isV4 = record?.schema === DISPATCH_RECORD_SCHEMA;
    const isV3 = record?.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA;
    if (!isV3 && !isV4) {
      findings.push(`${path}: unsupported dispatch record schema ${JSON.stringify(record?.schema)}`);
      continue;
    }
    applicableRecordCount += 1;
    try { isV4 ? validateDispatchRecord(record) : validatePreviousDispatchRecord(record); }
    catch (error) { findings.push(`${path}: invalid ${isV4 ? "v4" : "v3"} dispatch record (${error.message})`); continue; }
    const disposition = criticDisposition(record);
    if (disposition === "required") {
      if (record.taskId === taskId && record.candidateCommit === candidateCommit) {
        admittedCount += 1;
      } else {
        findings.push(`${path}: Critic is required by ${record.criticRequired.appliedRow}; only the exact review target may remain pending`);
      }
      continue;
    }
    if (disposition === "skipped") {
      try {
        const pathFinding = criticDecisionPathFinding(record.criticSkip, readChangedPaths(record));
        if (pathFinding) findings.push(`${path}: ${pathFinding.reason}`);
        else coveredRecordCount += 1;
      } catch (error) { findings.push(`${path}: actual changed paths could not be derived (${error.message})`); }
      continue;
    }
    if (disposition === "evidenced") {
      const evidenceFinding = verifyCriticEvidence(root, path, record.criticEvidence);
      if (evidenceFinding) findings.push(evidenceFinding);
      else coveredRecordCount += 1;
      continue;
    }
    findings.push(`${path}: requires exactly one Critic disposition`);
  }
  if (admittedCount !== 1) findings.push(`review admission requires exactly one pending record for ${taskId}@${candidateCommit}; found ${admittedCount}`);
  const ok = findings.length === 0 && admittedCount === 1 && coveredRecordCount + admittedCount === applicableRecordCount;
  return { ok, finding: !ok, taskId, candidateCommit, admittedCount, applicableRecordCount, coveredRecordCount, readFindings: findings };
}

function runCli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  if (args.length && (rootIndex !== 0 || args.length !== 2)) {
    process.stderr.write("usage: check-critic-skip-coverage.mjs [--root <repository>]\n");
    process.exitCode = 2; return;
  }
  const result = evaluateRepositoryCriticSkipCoverage({ root: rootIndex === 0 ? args[1] : DEFAULT_ROOT });
  for (const finding of result.readFindings) process.stderr.write(`CRITIC-SKIP-COVERAGE ${finding}\n`);
  process.stdout.write(`Critic-skip coverage: ${result.applicableRecordCount} applicable v3/v4, ${result.skipRecordCount} skipped, ${result.requiredRecordCount} required-pending, ${result.criticEvidenceRecordCount} evidenced, ${result.legacyRecordCount} legacy (schema ${CRITIC_SKIP_SCHEMA}) -- ${result.reason}\n`);
  if (!result.ok) process.exitCode = result.readFindings.some((finding) => /unreadable|invalid JSON/u.test(finding)) ? 2 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
