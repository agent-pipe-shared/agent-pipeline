// SPDX-License-Identifier: SUL-1.0
import { evaluateRequirementTraceability, requirementMapPath } from "./requirement-traceability.mjs";
import { validateVerifySuiteReceipt } from "./verify-resume.mjs";
import { readReportCandidateFile, readReportPublicArtifact, reportBytesSha256,
  reportCandidateIdentity, reportCandidateInventory } from "./report-source-readers.mjs";

export const DECLARED_CRITERIA_REPORT_SCHEMA = "pipeline.declared-criteria-evidence-report.v1";
const unavailable = code => ({ state: "unavailable", code });
const sameCandidate = (a, b) => a?.commit === b.commit && a?.tree === b.tree;

/** Existing evidence is observed and bounded; no criterion is satisfied by name. */
export function reportDeclaredCriteriaEvidence(handle, { specPath, verifyPath, receiptPaths = [] } = {}) {
  const candidate = reportCandidateIdentity(handle);
  const report = { schema: DECLARED_CRITERIA_REPORT_SCHEMA, reportOnly: true, completionEffect: "none", candidate,
    sources: [], criteria: [], receipts: [], verify: unavailable("REPORT-VERIFY-NOT-SUPPLIED"),
    conservation: unavailable("REPORT-AUTHORIZED-ORIGINAL-CUSTODY-READER-UNAVAILABLE"),
    readinessSources: ["original-input", "prd", "spec", "revised-design", "traceability"],
    browserPolicy: "required-only-if-declared; core-or-structural-evidence-is-not-browser-proof" };
  if (typeof specPath !== "string" || !/^specs\/.+\.md$/u.test(specPath)) return { ...report, state: "unknown", source: unavailable("REPORT-SPEC-PATH") };
  let spec, trace;
  try {
    spec = readReportCandidateFile(handle, specPath);
    trace = evaluateRequirementTraceability({ specPath, candidate, candidateFiles: reportCandidateInventory(handle),
      readCandidateFile: path => readReportCandidateFile(handle, path) });
  } catch (error) { return { ...report, state: "unknown", source: unavailable(error.code ?? "REPORT-SPEC-UNAVAILABLE") }; }
  report.sources.push({ kind: "spec", path: specPath, sha256: reportBytesSha256(spec) });
  report.traceability = { mode: trace.mode, mapPath: requirementMapPath(specPath), map: trace.map ?? null };
  // Mention inventory is not a normative parser: absence of the opt-in map
  // cannot erase criteria, and prose identity alone cannot establish disposition.
  const mentions = [...new Set(spec.toString("utf8").match(/\bAC-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/gu) ?? [])].sort();
  if (mentions.length > 256 || mentions.some(id => id.length > 80)) return { ...report, state: "unknown", source: unavailable("REPORT-CRITERION-BOUND") };
  const mapped = new Map(trace.criteria.map(row => [row.id, row]));
  report.criteria = [...new Set([...mentions, ...mapped.keys()])].sort().map(id => ({ id,
    identitySource: mapped.has(id) ? "candidate-adjacent-traceability-map" : "spec-text-mention-not-normative-classification",
    structural: mapped.has(id) ? mapped.get(id) : { status: "unmapped" },
    executedProductEvidence: unavailable("REPORT-CRITERION-EXECUTION-BINDING-UNAVAILABLE"),
    acceptedDisposition: unavailable("REPORT-CRITERION-DISPOSITION-OWNER-UNAVAILABLE") }));
  if (verifyPath !== undefined) {
    try {
      const artifact = readReportPublicArtifact(handle, verifyPath), value = JSON.parse(artifact.bytes.toString("utf8"));
      const identity = value.candidate?.start ?? value.candidate;
      const candidateBound = sameCandidate(identity, candidate) && (value.candidate?.start === undefined
        || (sameCandidate(value.candidate.finish, candidate) && value.candidate.binding === "exact"));
      if (value.schema !== "pipeline.verify-evidence.v0" || !Array.isArray(value.steps) || value.steps.length > 2048
        || !Number.isInteger(value.exitCode) || value.exitCode < 0 || !value.steps.every(step => typeof step.name === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(step.name) && Number.isInteger(step.exitCode))) throw Error("shape");
      report.verify = { state: !candidateBound ? "stale" : value.exitCode === 0 ? "published-success-not-product-acceptance" : "published-failed",
        reference: artifact.reference, candidateBound, exitCode: value.exitCode,
        steps: value.steps.map(step => ({ name: step.name, exitCode: step.exitCode, reused: step.reused === true })),
        executionAuthenticity: unavailable("REPORT-VERIFY-JOURNAL-READER-NOT-SUPPLIED") };
    } catch (error) { report.verify = unavailable(error.code ?? "REPORT-VERIFY-INVALID"); }
  }
  if (!Array.isArray(receiptPaths) || receiptPaths.length > 64 || new Set(receiptPaths).size !== receiptPaths.length) return { ...report, state: "unknown", source: unavailable("REPORT-RECEIPT-BOUND") };
  for (const path of receiptPaths) {
    try {
      const artifact = readReportPublicArtifact(handle, path), receipt = JSON.parse(artifact.bytes.toString("utf8"));
      const checked = validateVerifySuiteReceipt(receipt);
      if (!checked.ok) { report.receipts.push({ reference: artifact.reference, state: "invalid", code: checked.code }); continue; }
      const drift = receipt.inputs.files.filter(ref => {
        try { return reportBytesSha256(readReportCandidateFile(handle, ref.path)) !== ref.fileSha256; }
        catch { return true; }
      }).map(ref => ref.path);
      report.receipts.push({ reference: artifact.reference, suite: receipt.suite,
        state: !sameCandidate(receipt.candidate, candidate) ? "stale" : drift.length ? "input-drift" : receipt.exitCode === 0 ? "recorded-completed-success" : "recorded-completed-failed",
        candidateBound: sameCandidate(receipt.candidate, candidate), inputDrift: drift, exitCode: receipt.exitCode,
        inputPaths: receipt.inputs.files.map(ref => ref.path),
        completionCounts: receipt.caseCompletion?.counts ?? null,
        executionAuthenticity: unavailable("REPORT-EXECUTION-PRODUCER-READER-UNAVAILABLE"),
        productClass: unavailable("REPORT-PRODUCT-CLASS-OWNER-UNAVAILABLE") });
    } catch (error) { report.receipts.push(unavailable(error.code ?? "REPORT-RECEIPT-INVALID")); }
  }
  for (const criterion of report.criteria) {
    const path = criterion.structural.path;
    const associated = report.receipts.filter(receipt => path && receipt.inputPaths?.includes(path));
    criterion.receiptAssociations = associated.map(receipt => ({ reference: receipt.reference, suite: receipt.suite,
      state: receipt.state, candidateBound: receipt.candidateBound, exitCode: receipt.exitCode,
      relation: "actual-declared-input-association-not-criterion-satisfaction" }));
  }
  report.state = report.criteria.some(row => row.structural.status === "absent" || row.structural.status === "unmapped") ? "gaps" : "unknown";
  return report;
}
