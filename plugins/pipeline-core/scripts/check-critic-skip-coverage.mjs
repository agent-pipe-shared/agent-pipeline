#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Critic-skip coverage scan: repository-scanning wiring for the pure
 * coverage rule `../lib/critic-skip-decision.mjs` already defines and tests.
 *
 * WHY THIS EXISTS. `critic-skip-decision.mjs`'s own module doc states plainly
 * what it defers: "it does not itself scan evidence/ for dispatch records or
 * for Critic artifacts, and it is not wired into any Verify suite... Building
 * that repository-scanning wiring... is real, disclosed, smaller follow-up
 * work". This script is that follow-up: it walks `evidence/dispatch-record-
 * *.json`, counts logged skip decisions and Critic evidence artifacts, and
 * calls the library's own pure functions to answer one question from
 * repository state alone: is a repository with zero Critic artifacts that way
 * because none were ever required, or despite N being required and never
 * produced (backlog/items/2026-08-29-critic-skip-not-an-explicit-logged-
 * decision.md, Acceptance bullet 2)?
 *
 * DELIBERATELY NOT USING `evaluateCriticSkipCoverageFromRecords`. That
 * wrapper derives `dispatchedWorkCount` from `skipRecordCount` itself
 * (`dispatchedWorkCount = skipRecordCount` in the library source) -- every
 * record with no `criticSkip` field is invisible to BOTH counts, so the two
 * numbers can never separate ("skipped >= total" holds by construction,
 * every time). That circularity is real and already on record (an earlier
 * dispatch attempted to fix `dispatchedWorkCount = records.length` inside the
 * library itself and broke two tests protecting the module's own forward-
 * looking-only guarantee -- see this script's own test file for the same
 * lesson applied correctly at the wiring layer instead). This script never
 * imports or calls that wrapper; it computes `dispatchedWorkCount` itself
 * (below) and calls `evaluateCriticSkipCoverage` -- the three-number pure
 * rule -- directly.
 *
 * SCOPE, STATED PLAINLY. `dispatchedWorkCount` here is every dispatch record
 * the walk finds (via `walkDispatchRecords`), full stop -- there is no
 * timestamp or ruleset-SHA cutoff separating "before this mechanism existed"
 * from "after", because dispatch records carry no such marker (the same
 * constraint the library's own module doc names for why its counting
 * functions cannot use one either). A repository whose real dispatch history
 * predates the `criticSkip` field will therefore see every pre-mechanism
 * record counted as in scope, and REPORT a finding once real Critic-required
 * work exists among them with neither `criticSkip` nor Critic evidence --
 * this is the exact remaining gap the review-protocol.md §2.1 marker's own
 * "forward-looking only" language already anticipates as needing an actual
 * cutoff decision. Deriving and applying that cutoff (a specific commit,
 * ruleset SHA, or dispatch-record convention marking "on or after this point,
 * a missing `criticSkip` is a real finding") is left to whoever registers
 * this script into a Verify suite -- disclosed here, not silently assumed.
 * Until that wiring lands, treat any finding this script reports on the REAL
 * repository as a lead to investigate, not an automatic gate failure.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CRITIC_SKIP_SCHEMA, countCriticSkipDecisions, evaluateCriticSkipCoverage, hasCriticSkipDecision } from "../lib/critic-skip-decision.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");
const EVIDENCE_DIR = "evidence";
const DISPATCH_RECORD_PATTERN = /^dispatch-record-.+\.json$/u;

/**
 * First-cut heuristic for "this evidence/ file is a Critic artifact": the
 * filename contains "critic" (case-insensitive), and it is not itself a
 * dispatch-record file (a dispatch record can legitimately carry a
 * `criticSkip` field and the substring "critic" without being Critic
 * evidence). Real Critic evidence in this repository is filed under several
 * shapes (`critic-report-*.json`, `critic-review-*.diff`/`.patch`,
 * `*-critic-*.md`, `msg-critic.txt`) with no single stricter convention
 * enforced anywhere today -- narrowing this further is exactly the kind of
 * "what counts as a Critic artifact" decision the library module's own doc
 * defers to this follow-up, and is left for whoever tightens the wiring.
 */
export function isCriticArtifactFile(fileName) {
  return !DISPATCH_RECORD_PATTERN.test(fileName) && /critic/iu.test(fileName);
}

/**
 * Read every `evidence/dispatch-record-*.json` file. A file that fails to
 * parse as JSON is reported as its own finding and excluded from the counts
 * below -- never silently treated as either "has a skip decision" or "in
 * scope with neither".
 *
 * @param {string} root
 * @returns {{records: object[], findings: string[], filesScanned: number}}
 */
export function walkDispatchRecords(root) {
  const findings = [];
  const records = [];
  let entries = [];
  try {
    entries = readdirSync(resolve(root, EVIDENCE_DIR), { withFileTypes: true });
  } catch (error) {
    return { records: [], findings: [`${EVIDENCE_DIR} is missing or unreadable: ${error.message}`], filesScanned: 0 };
  }
  const fileNames = entries.filter((entry) => entry.isFile() && DISPATCH_RECORD_PATTERN.test(entry.name)).map((entry) => entry.name).sort();
  for (const fileName of fileNames) {
    const repoPath = `${EVIDENCE_DIR}/${fileName}`;
    try {
      records.push(JSON.parse(readFileSync(resolve(root, repoPath), "utf8")));
    } catch (error) {
      findings.push(`${repoPath}: could not be read as valid JSON (${error.message}) -- excluded from the coverage count, not silently counted either way`);
    }
  }
  return { records, findings, filesScanned: fileNames.length };
}

/**
 * Count `evidence/` files (top-level only, matching `isCriticArtifactFile`)
 * that count as Critic evidence for the coverage rule's `criticArtifactCount`
 * input.
 *
 * @param {string} root
 * @returns {number}
 */
export function countCriticArtifactFiles(root) {
  let entries = [];
  try {
    entries = readdirSync(resolve(root, EVIDENCE_DIR), { withFileTypes: true });
  } catch {
    return 0;
  }
  return entries.filter((entry) => entry.isFile() && isCriticArtifactFile(entry.name)).length;
}

/**
 * The full wiring: walk dispatch records, count Critic artifacts, and call
 * the library's pure `evaluateCriticSkipCoverage` directly (never the
 * circular `evaluateCriticSkipCoverageFromRecords` wrapper -- see the module
 * doc comment above). `dispatchedWorkCount` is simply how many dispatch
 * records were found, not how many of them carry a skip decision -- this is
 * the one change that actually lets `skipped >= total` fail when it should.
 *
 * @param {object} [options]
 * @param {string} [options.root]
 * @returns {{ok: boolean, finding: boolean, reason: string, dispatchedWorkCount: number,
 *   criticArtifactCount: number, skipRecordCount: number, readFindings: string[]}}
 */
export function evaluateRepositoryCriticSkipCoverage(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const { records, findings: readFindings } = walkDispatchRecords(root);
  const criticArtifactCount = countCriticArtifactFiles(root);
  const dispatchedWorkCount = records.length;
  const skipRecordCount = countCriticSkipDecisions(records);
  const evaluation = evaluateCriticSkipCoverage({ dispatchedWorkCount, criticArtifactCount, skipRecordCount });
  return {
    ok: readFindings.length === 0 && !evaluation.finding,
    finding: evaluation.finding,
    reason: evaluation.reason,
    dispatchedWorkCount,
    criticArtifactCount,
    skipRecordCount,
    readFindings,
  };
}

function runCli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  if (args.length && (rootIndex < 0 || rootIndex !== 0 || args.length !== 2)) {
    process.stderr.write("usage: check-critic-skip-coverage.mjs [--root <repository>]\n");
    process.exit(2);
  }
  const root = rootIndex === 0 ? args[1] : DEFAULT_ROOT;
  const result = evaluateRepositoryCriticSkipCoverage({ root });
  for (const finding of result.readFindings) process.stderr.write(`CRITIC-SKIP-COVERAGE ${finding}\n`);
  process.stdout.write(
    `Critic-skip coverage: ${result.dispatchedWorkCount} dispatch record(s), ${result.skipRecordCount} skip decision(s) ` +
      `(schema ${CRITIC_SKIP_SCHEMA}), ${result.criticArtifactCount} Critic artifact(s) -- ${result.reason}\n`,
  );
  if (result.readFindings.length > 0) {
    process.stderr.write(`Critic-skip coverage: ${result.readFindings.length} unreadable dispatch record(s).\n`);
    process.exit(2);
  }
  if (result.finding) {
    process.stderr.write("Critic-skip coverage: finding -- Critic evidence expected but missing.\n");
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();

// Re-exported for callers that only need the schema tag or the presence
// predicate without re-importing the library module directly.
export { CRITIC_SKIP_SCHEMA, hasCriticSkipDecision };
