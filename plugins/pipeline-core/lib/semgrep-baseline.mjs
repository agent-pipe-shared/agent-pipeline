// SPDX-License-Identifier: SUL-1.0
/**
 * C28e (PO tile 2026-11-12, register D242, ADR-0093): a Semgrep finding blocks only when the feature introduced it.
 *
 * The baseline is never an input a caller can pass. It is read from the candidate tree the scan already bound:
 *   - the feature: the State file's active feature, else its last closed feature (the same rule the publication review
 *     duty uses), read from the scan snapshot, so its bytes are the committed candidate's;
 *   - the base commit: the start of that feature's range, the one definition in close-commit-split.mjs (the parent of the
 *     first first-parent commit that touched specs/<feature>/);
 *   - the base must be a commit and an ancestor of the candidate.
 * Anything missing, unreadable or not an ancestor makes the baseline `unavailable`, and then every finding at a blocking
 * severity blocks, as before. Unavailable is never an error and never "nothing is new".
 *
 * Which findings are new is Semgrep's own answer (`--baseline-commit`, matched by code, not by line), run by the adapter in
 * its own throwaway worktree. Both passes see the same candidate tree, so a finding is new exactly when the baseline pass
 * reports the same rule at the same path and line.
 *
 * `blockingFindings` is the one verdict function: the scan's exit decision uses it, and every gate that reads the scan's
 * exitCode (close, push, release) inherits it. The finding envelope stays closed (security-evidence-evaluator.mjs); the
 * judgement lives in the evidence's `semgrepBaseline` record, never in a finding.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { featureRangeBase } from "./close-commit-split.mjs";
import { LEGACY_STATE, NEUTRAL_STATE } from "./project-authority-read.mjs";

export const SEMGREP_BASELINE_SCHEMA = "pipeline.semgrep-baseline.v1";
export const SEMGREP_BASELINE_SOURCE = "feature-range-start";
const FEATURE = /^[a-z][a-z0-9-]{2,63}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

const unavailable = (code, reason, featureId = null) => Object.freeze({ schema: SEMGREP_BASELINE_SCHEMA, status: "unavailable", code, reason: String(reason).slice(0, 300), featureId, commit: null, source: SEMGREP_BASELINE_SOURCE });

function stateRelativePath(rootDir, authority) {
  if (authority?.status === "ready" && typeof authority.state === "string") return authority.state;
  if (existsSync(join(rootDir, NEUTRAL_STATE)) || !existsSync(join(rootDir, LEGACY_STATE))) return NEUTRAL_STATE;
  return LEGACY_STATE;
}

/** The feature whose start is the baseline: the active feature, else the last closed one; null when none can be named. */
export function baselineFeatureId(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null;
  const id = state.activeFeature?.id ?? (Array.isArray(state.closedFeatures) ? state.closedFeatures.at(-1)?.id : null);
  return typeof id === "string" && FEATURE.test(id) ? id : null;
}

/**
 * Resolves the baseline from the candidate snapshot. `rootDir` is the scan snapshot (a detached worktree of the candidate),
 * `authority` the project authority resolved there, `runGit(args)` runs git in it.
 */
export function resolveSemgrepBaseline({ rootDir, authority = null, runGit = null } = {}) {
  const git = runGit ?? ((args) => spawnSync("git", ["-C", rootDir, ...args], { encoding: "utf8", timeout: 15000, shell: false }));
  let state;
  try { state = JSON.parse(readFileSync(join(rootDir, stateRelativePath(rootDir, authority)), "utf8")); }
  catch { return unavailable("SEMGREP-BASELINE-STATE-UNREADABLE", "the Pipeline State of the candidate could not be read, so no feature names a start"); }
  const featureId = baselineFeatureId(state);
  if (featureId === null) return unavailable("SEMGREP-BASELINE-NO-FEATURE", "the Pipeline State names no active or closed feature");
  const range = featureRangeBase({ rootDir, featureId, runGit: git });
  if (range.status !== "found") return unavailable("SEMGREP-BASELINE-RANGE-UNREADABLE", range.reason, featureId);
  if (range.base === null) return unavailable("SEMGREP-BASELINE-NO-BASE", `the first commit of ${featureId} starts the history, so nothing predates the feature`, featureId);
  if (!OID.test(range.base)) return unavailable("SEMGREP-BASELINE-RANGE-UNREADABLE", "the start of the feature range is not a commit id", featureId);
  const isCommit = git(["cat-file", "-e", `${range.base}^{commit}`]);
  if (isCommit?.status !== 0) return unavailable("SEMGREP-BASELINE-BASE-MISSING", `the start of ${featureId} (${range.base}) is not in this repository`, featureId);
  const ancestor = git(["merge-base", "--is-ancestor", range.base, "HEAD"]);
  if (ancestor?.status !== 0) return unavailable("SEMGREP-BASELINE-NOT-ANCESTOR", `the start of ${featureId} (${range.base}) is not an ancestor of the candidate`, featureId);
  return Object.freeze({ schema: SEMGREP_BASELINE_SCHEMA, status: "applied", code: null, reason: null, featureId, commit: range.base, source: SEMGREP_BASELINE_SOURCE });
}

/** The identity of one Semgrep finding for the new/existing comparison: rule, scan-root-relative path, line. */
export function semgrepFindingKey(finding) {
  return `${finding?.rule ?? ""}\u0000${finding?.path ?? ""}\u0000${finding?.line ?? ""}`;
}

/**
 * The findings that block: a severity in `blockOn`, except a Semgrep finding the baseline record names as existing before
 * the feature. With no applied baseline record every blocking-severity finding blocks.
 */
export function blockingFindings(findings, blockOn, semgrepBaseline = null) {
  const blockOnSet = new Set(blockOn);
  const existing = semgrepBaseline?.status === "applied" && Array.isArray(semgrepBaseline.existing)
    ? new Set(semgrepBaseline.existing.map(semgrepFindingKey))
    : new Set();
  return (Array.isArray(findings) ? findings : []).filter((finding) => blockOnSet.has(finding?.severity)
    && !(finding?.tool === "semgrep" && existing.has(semgrepFindingKey(finding))));
}

/**
 * Splits the blocking-severity Semgrep findings of the full scan by the baseline pass's new findings. The two passes run in
 * two different worktrees of the same candidate, so paths are compared through `fullPath`/`newPath` (each makes a reported
 * path relative to its own root; null when it cannot). Returns the `existing` list (rule, path, line, severity) the evidence
 * records, with the full scan's own path so `blockingFindings` matches it exactly; every other blocking-severity finding is
 * new. A finding whose path cannot be made relative is never existing: it blocks.
 */
export function existingSemgrepFindings(fullFindings, newFindings, blockOn, { fullPath = (path) => path, newPath = (path) => path } = {}) {
  const blockOnSet = new Set(blockOn);
  const relativeKey = (finding, toRelative) => {
    const path = toRelative(finding?.path);
    return path === null || path === undefined ? null : semgrepFindingKey({ rule: finding.rule, path, line: finding.line });
  };
  const fresh = new Set((Array.isArray(newFindings) ? newFindings : []).map((finding) => relativeKey(finding, newPath)).filter((key) => key !== null));
  return (Array.isArray(fullFindings) ? fullFindings : [])
    .filter((finding) => {
      if (finding?.tool !== "semgrep" || !blockOnSet.has(finding.severity)) return false;
      const key = relativeKey(finding, fullPath);
      return key !== null && !fresh.has(key);
    })
    .map((finding) => ({ rule: finding.rule, path: finding.path, file: fullPath(finding.path), line: finding.line, severity: finding.severity }));
}

/**
 * How many findings of the baseline pass have no counterpart (rule, relative path, line) in the full scan. Both passes scan
 * the same candidate files, so anything above zero means they cannot be compared (measured 2026-11-12: a rule file inside
 * the scanned tree gets a path-derived id that differs between two worktrees) and the baseline must not be applied.
 */
export function unmatchedNewFindings(fullFindings, newFindings, { fullPath = (path) => path, newPath = (path) => path } = {}) {
  const keyOf = (finding, toRelative) => {
    const path = toRelative(finding?.path);
    return path === null || path === undefined ? null : semgrepFindingKey({ rule: finding.rule, path, line: finding.line });
  };
  const full = new Set((Array.isArray(fullFindings) ? fullFindings : []).map((finding) => keyOf(finding, fullPath)).filter((key) => key !== null));
  return (Array.isArray(newFindings) ? newFindings : []).filter((finding) => {
    const key = keyOf(finding, newPath);
    return key === null || !full.has(key);
  }).length;
}

/**
 * The existing findings that sit in a file the feature added. Such a finding cannot predate the feature, so any hit means the
 * baseline pass under-reported and the baseline must not be applied (a pass that silently returned too little would otherwise
 * exempt new code). `addedFiles` holds the repository-relative paths `git diff --diff-filter=A <base> HEAD` names.
 */
export function existingInAddedFiles(existing, addedFiles) {
  const added = addedFiles instanceof Set ? addedFiles : new Set(addedFiles ?? []);
  return (Array.isArray(existing) ? existing : []).filter((finding) => typeof finding?.file === "string" && added.has(finding.file));
}

/** The printed lines for a scan summary: existing findings listed and named non-blocking, or why every finding blocks. */
export function formatSemgrepBaselineLines(record, { limit = 20 } = {}) {
  if (record?.status === "applied") {
    const existing = Array.isArray(record.existing) ? record.existing : [];
    const lines = [`Semgrep baseline (${record.featureId}, start ${String(record.commit).slice(0, 12)}): ${existing.length} finding(s) at a blocking severity existed before the feature and are listed, not blocking; ${record.newCount ?? 0} are new and block.`];
    for (const finding of existing.slice(0, limit)) lines.push(`  existing ${finding.severity} ${finding.rule} ${finding.file ?? finding.path}:${finding.line ?? "?"}`);
    if (existing.length > limit) lines.push(`  ... ${existing.length - limit} more existing finding(s) in the evidence (execution.semgrepBaseline.existing)`);
    return lines;
  }
  if (record?.status === "unavailable") return [`Semgrep baseline unavailable (${record.code}): ${record.reason}. Every Semgrep finding at a blocking severity blocks.`];
  return [];
}
