#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Per-dispatch Critic disposition enforcement for dispatch-record v3. */
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CRITIC_SKIP_SCHEMA, criticDisposition } from "../lib/critic-skip-decision.mjs";
import { DISPATCH_RECORD_SCHEMA, LEGACY_DISPATCH_RECORD_SCHEMA, validateDispatchRecord, validateLegacyDispatchRecord } from "../lib/dispatch-record.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");
const EVIDENCE_DIR = "evidence";
const DISPATCH_RECORD_PATTERN = /^dispatch-record-.+\.json$/u;

export function walkDispatchRecords(root) {
  const findings = [];
  const records = [];
  let entries;
  try { entries = readdirSync(resolve(root, EVIDENCE_DIR), { withFileTypes: true }); }
  catch (error) { return { records, findings: [`${EVIDENCE_DIR} is missing or unreadable: ${error.message}`], filesScanned: 0 }; }
  const names = entries.filter((entry) => entry.isFile() && DISPATCH_RECORD_PATTERN.test(entry.name)).map((entry) => entry.name).sort();
  for (const name of names) {
    const path = `${EVIDENCE_DIR}/${name}`;
    try { records.push({ path, record: JSON.parse(readFileSync(resolve(root, path), "utf8")) }); }
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

export function evaluateRepositoryCriticSkipCoverage(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const scan = walkDispatchRecords(root);
  const findings = [...scan.findings];
  let applicableRecordCount = 0;
  let legacyRecordCount = 0;
  let skipRecordCount = 0;
  let requiredRecordCount = 0;
  let criticEvidenceRecordCount = 0;
  for (const entry of scan.records) {
    const { path, record } = entry;
    if (legacySchema(record)) {
      legacyRecordCount += 1;
      if (record?.schema === LEGACY_DISPATCH_RECORD_SCHEMA) {
        try { validateLegacyDispatchRecord(record); } catch (error) { findings.push(`${path}: invalid legacy v2 record (${error.message})`); }
      }
      continue;
    }
    if (record?.schema !== DISPATCH_RECORD_SCHEMA) {
      findings.push(`${path}: unsupported dispatch record schema ${JSON.stringify(record?.schema)}`);
      continue;
    }
    applicableRecordCount += 1;
    try { validateDispatchRecord(record); }
    catch (error) { findings.push(`${path}: invalid v3 dispatch record (${error.message})`); continue; }
    const disposition = criticDisposition(record);
    if (disposition === "skipped") { skipRecordCount += 1; continue; }
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
      ? `${skipRecordCount} skipped and ${criticEvidenceRecordCount} evidenced v3 dispatch record(s); ${legacyRecordCount} pre-cutover record(s) preserved as legacy`
      : findings.length > 0
        ? `${findings.length} dispatch/evidence validation finding(s); ${uncoveredRecordCount} applicable v3 record(s) remain uncovered`
        : `${uncoveredRecordCount} of ${applicableRecordCount} applicable v3 dispatch record(s) lack a valid per-record Critic disposition`,
    dispatchedWorkCount: applicableRecordCount,
    applicableRecordCount,
    legacyRecordCount,
    criticArtifactCount: criticEvidenceRecordCount,
    criticEvidenceRecordCount,
    requiredRecordCount,
    skipRecordCount,
    readFindings: findings,
  };
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
  process.stdout.write(`Critic-skip coverage: ${result.applicableRecordCount} applicable v3, ${result.skipRecordCount} skipped, ${result.requiredRecordCount} required-pending, ${result.criticEvidenceRecordCount} evidenced, ${result.legacyRecordCount} legacy (schema ${CRITIC_SKIP_SCHEMA}) -- ${result.reason}\n`);
  if (!result.ok) process.exitCode = result.readFindings.some((finding) => /unreadable|invalid JSON/u.test(finding)) ? 2 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
