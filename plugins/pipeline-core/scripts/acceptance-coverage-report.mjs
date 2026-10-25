#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openReportCandidate } from "../lib/report-source-readers.mjs";
import { reportCandidateImplementationCoverage } from "../lib/candidate-implementation-coverage-report.mjs";
import { reportDeclaredCriteriaEvidence } from "../lib/declared-criteria-evidence-report.mjs";

export function runAcceptanceCoverageReport(argv = process.argv.slice(2)) {
  const options = {}, receiptPaths = [], evidencePaths = [];
  const allowed = new Set(["--kind", "--root", "--candidate", "--base", "--spec", "--verify", "--receipt", "--evidence"]);
  try {
    // 14 single-valued option slots + up to 64 receipts + up to 64 behavioral-output evidence artifacts, as flag/value pairs.
    if (!Array.isArray(argv) || argv.length > 270 || argv.some(value => typeof value !== "string" || value.length > 4096)) throw Error("REPORT-ARGUMENTS");
    for (let index = 0; index < argv.length; index += 2) {
      const key = argv[index], value = argv[index + 1];
      if (!allowed.has(key) || typeof value !== "string" || !value || value.startsWith("--")
        || (key !== "--receipt" && key !== "--evidence" && Object.hasOwn(options, key))) throw Error("REPORT-ARGUMENTS");
      if (key === "--receipt") receiptPaths.push(value); else if (key === "--evidence") evidencePaths.push(value); else options[key] = value;
    }
    if (!["candidate", "criteria", "both"].includes(options["--kind"]) || !options["--candidate"]
      || (options["--kind"] === "candidate" && (options["--spec"] || options["--verify"] || receiptPaths.length || evidencePaths.length))) throw Error("REPORT-ARGUMENTS");
    const handle = openReportCandidate({ repoRoot: resolve(options["--root"] ?? process.cwd()), candidateCommit: options["--candidate"] });
    const result = { schema: "pipeline.acceptance-coverage-report.v1", reportOnly: true, completionEffect: "none" };
    if (options["--kind"] !== "criteria") result.candidateCoverage = reportCandidateImplementationCoverage(handle, { baseCommit: options["--base"] });
    if (options["--kind"] !== "candidate") result.criteriaEvidence = reportDeclaredCriteriaEvidence(handle, { specPath: options["--spec"], verifyPath: options["--verify"], receiptPaths, evidencePaths });
    return { exitCode: 0, report: result };
  } catch (error) {
    return { exitCode: error.message === "REPORT-ARGUMENTS" ? 2 : 0,
      report: { schema: "pipeline.acceptance-coverage-report.v1", reportOnly: true, completionEffect: "none", state: "unavailable", code: error.code ?? "REPORT-ARGUMENTS-OR-SOURCE-UNAVAILABLE" } };
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runAcceptanceCoverageReport();
  process.stdout.write(`${JSON.stringify(result.report)}\n`); process.exitCode = result.exitCode;
}
