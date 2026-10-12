// SPDX-License-Identifier: SUL-1.0
import { DISPATCH_RECORD_SCHEMA, PREVIOUS_DISPATCH_RECORD_SCHEMA, LEGACY_DISPATCH_RECORD_SCHEMA,
  validateDispatchRecord, validatePreviousDispatchRecord, validateLegacyDispatchRecord,
  isTerminalOutcome, isNoDeliveryOutcome } from "./dispatch-record.mjs";
import { parseIntegrationTrailerBlock, parseCommitTrailerBlock } from "./commit-message-policy.mjs";
import { criticDecisionPathFinding, criticDisposition, classifyCriticChangedPaths } from "./critic-skip-decision.mjs";
import { inspectReportRange, readReportCandidateFile, reportBytesSha256, reportCandidateIdentity,
  reportCandidateInventory, readReportCommitPaths, readReportCommitMessage } from "./report-source-readers.mjs";

export const CANDIDATE_COVERAGE_REPORT_SCHEMA = "pipeline.candidate-implementation-coverage-report.v1";
function unavailable(code) { return { state: "unavailable", code }; }

/** Reverse inventory is diagnostic only; never an enrollment/completion decision. */
export function reportCandidateImplementationCoverage(handle, { baseCommit } = {}) {
  const candidate = reportCandidateIdentity(handle);
  const report = { schema: CANDIDATE_COVERAGE_REPORT_SCHEMA, reportOnly: true, candidate,
    completionEffect: "none", baseline: unavailable("REPORT-BASE-NOT-SUPPLIED"), comparison: null,
    records: [], commits: [], pathMappings: [], findings: [] };
  if (baseCommit === undefined) return { ...report, state: "unknown" };
  let range;
  try { range = inspectReportRange(handle, { baseCommit }); }
  catch (error) { return { ...report, state: "unknown", baseline: unavailable(error.code ?? "REPORT-RANGE-UNAVAILABLE") }; }
  report.baseline = range.baselineAuthority;
  report.comparison = { baseCommit, source: range.comparisonSource, changedPaths: range.changedPaths,
    commitCount: range.commits.length, trueEmptyRange: range.commits.length === 0 && range.changedPaths.length === 0,
    netEmptyChanges: range.changedPaths.length === 0,
    zeroApplicableRowsIsCoverage: false };
  const inventory = reportCandidateInventory(handle);
  const paths = [...inventory.keys()].filter(path => /^evidence\/dispatch-record-[A-Za-z0-9._:-]+\.json$/u.test(path)).sort();
  if (paths.length > 512) return { ...report, state: "unknown", findings: [{ code: "REPORT-DISPATCH-BOUND" }] };
  for (const path of paths) {
    let record, bytes;
    try {
      bytes = readReportCandidateFile(handle, path); record = JSON.parse(bytes.toString("utf8"));
      if (record.schema === DISPATCH_RECORD_SCHEMA) validateDispatchRecord(record);
      else if (record.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA) validatePreviousDispatchRecord(record);
      else if (record.schema === LEGACY_DISPATCH_RECORD_SCHEMA) validateLegacyDispatchRecord(record);
      else throw Error("unsupported");
    } catch {
      report.records.push({ path, state: "unknown", code: "REPORT-DISPATCH-INVALID" }); continue;
    }
    const commits = Array.isArray(record.commits) ? record.commits : [];
    const mapped = commits.filter(commit => range.commits.includes(commit));
    const delivery = record.schema === DISPATCH_RECORD_SCHEMA ? record.outcomeClassification?.kind
      : isTerminalOutcome(record.outcome) && !isNoDeliveryOutcome(record.outcome) && commits.length > 0 ? "legacy-authored-unverified" : "non-authoring";
    const applicable = mapped.length > 0 && commits.length === mapped.length
      && mapped.includes(record.candidateCommit)
      && ["authored-commit", "legacy-authored-unverified"].includes(delivery)
      && isTerminalOutcome(record.outcome) && !isNoDeliveryOutcome(record.outcome);
    const row = { path, sha256: reportBytesSha256(bytes), taskId: record.taskId,
      sourceCandidateCommit: record.candidateCommit ?? null, delivery: delivery ?? "unknown",
      commits: mapped, mapping: applicable ? "candidate-range-structural-match" : "not-applicable",
      admission: unavailable("REPORT-AUTHENTIC-ADMISSION-NOT-PROVED"), review: unavailable("REPORT-BOUND-REVIEW-NOT-PROVED") };
    // Import/integration commits can be mapped, but never labelled worker authorship.
    row.authorship = delivery === "authored-commit" ? "declared-native-authorship-unverified"
      : "unknown";
    if (applicable && criticDisposition(record) === "skipped") {
      try {
        const actual = [...new Set(commits.flatMap(commit => readReportCommitPaths(handle, commit)))].sort();
        const finding = criticDecisionPathFinding(record.criticSkip, actual);
        row.review = finding ? { state: "invalid", code: finding.code }
          : { state: "existing-exemption-path-checked", appliedRow: record.criticSkip.appliedRow,
            authority: "existing-validated-dispatch-decision", actualChangedPaths: actual };
      } catch { row.review = unavailable("REPORT-EXEMPTION-PATHS-UNAVAILABLE"); }
    }
    report.records.push(row);
  }
  report.commits = range.perCommit.map(unit => {
    const matches = report.records.filter(row => row.mapping === "candidate-range-structural-match" && row.commits.includes(unit.commit));
    const message = readReportCommitMessage(handle, unit.commit);
    const integration = parseIntegrationTrailerBlock(message);
    const stageZero = parseCommitTrailerBlock(message).some(entry => entry.key === "Dispatch" && entry.value === "stage-0 (elephant)");
    return { ...unit, changedPathClassification: classifyCriticChangedPaths(unit.changedPaths),
      role: integration.ok ? "signed-artifact-integration-not-worker-authorship" : stageZero ? "declared-stage-zero-not-exemption-proof" : "unclassified",
      roleAuthority: unavailable(integration.ok ? "REPORT-SIGNED-INTEGRATION-VERIFIER-NOT-SUPPLIED" : "REPORT-COMMIT-ROLE-OWNER-NOT-PROVED"),
      editorialPathHint: unit.changedPaths.length > 0 && unit.changedPaths.every(path => /\.(?:md|txt)$/iu.test(path)),
      mapping: matches.length === 0 ? "missing" : matches.length > 1 ? "ambiguous" : "structural-match",
      records: matches.map(row => ({ path: row.path, sha256: row.sha256 })),
      review: matches.length === 1 ? matches[0].review : unavailable("REPORT-COMMIT-REVIEW-UNMAPPED") };
  });
  report.pathMappings = range.changedPaths.map(path => ({ path,
    commits: range.perCommit.filter(unit => unit.changedPaths.includes(path)).map(unit => unit.commit) }));
  const unmapped = report.commits.filter(unit => unit.mapping !== "structural-match");
  report.findings = unmapped.map(unit => ({ code: unit.mapping === "missing" ? "REPORT-IMPLEMENTATION-WITHOUT-DISPATCH-MAPPING" : "REPORT-AMBIGUOUS-DISPATCH-MAPPING", commit: unit.commit }));
  report.state = report.findings.length ? "gaps" : "unknown";
  // Empty comparison is explicit, but an unproved baseline cannot certify no work.
  return report;
}
