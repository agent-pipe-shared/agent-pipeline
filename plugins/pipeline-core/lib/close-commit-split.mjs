// SPDX-License-Identifier: SUL-1.0
/**
 * C22B (CGR-13, AC-108): the commits of a feature's range counted as product commits and evidence commits, apart. The commits stay exactly as they are
 * (PO decision): this only reads them. A commit is an EVIDENCE commit when every path it touches is
 *   - an administration or documentation path of the one shared set (lib/administration-documentation-paths.mjs), or
 *   - a path under specs/<feature>/evidence/ or audit-bundles/, or a root evidence record (evidence/ or backlog/evidence/).
 * Any other path (source, tests, configuration, an ADR, the spec text of the feature) makes it a PRODUCT commit. A commit that touches no path (an empty
 * commit, a merge without its own changes) counts as evidence: it changes nothing a reviewer reads.
 *
 * The shared set is asked through its public function and the three evidence prefixes are added here, because that function vetoes the tracked Critic export
 * and the Critic addenda (they are Critic-carry-forward evidence there), and for this count they are evidence.
 *
 * The feature range: from the first commit that touched specs/<feature>/ (the feature's own directory) to HEAD. The close has no recorded base commit of its
 * own, so the range names that source; a range that cannot be read is typed `unavailable` and never blocks a close.
 *
 * The result is a printed fact for the close result and the audit bundle README. It is NOT a manifest field: the manifest and its keys are hashed.
 */
import { spawnSync } from "node:child_process";
import { administrationDocumentationClassOf } from "./administration-documentation-paths.mjs";

export const CLOSE_COMMIT_SPLIT_SCHEMA = "pipeline.close-commit-split.v1";
export const RANGE_SOURCE = "first-commit-touching-feature-directory";
const FEATURE = /^[a-z][a-z0-9-]{2,63}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

const unavailable = (reason) => Object.freeze({ schema: CLOSE_COMMIT_SPLIT_SCHEMA, status: "unavailable", reason: String(reason).slice(0, 200) });

/** True when `path` is an evidence path for the count (see the header). */
export function isEvidencePath(path, featureId) {
  if (typeof path !== "string" || path === "") return false;
  return administrationDocumentationClassOf(path, { featureIds: [featureId] }) !== null
    || path.startsWith(`specs/${featureId}/evidence/`) || path.startsWith("audit-bundles/")
    || path.startsWith("evidence/") || path.startsWith("backlog/evidence/");
}

/**
 * C29 (Claude greenfield run 3, L1; PO tile 2026-11-13: "a product path, not only evidence/administration"): a path whose change can
 * correct a Critic finding. Not an evidence or administration path (above), and not under specs/: the Spec and design text of a
 * package are corrected only through an approved Spec addendum (ADR-0095), which the lapsed-findings reader counts on its own. The run
 * this closes passed a round that changed only the Spec, and its two earlier majors then read as fixed.
 */
export function isCorrectionPath(path, featureId) {
  if (typeof path !== "string" || path === "" || isEvidencePath(path, featureId)) return false;
  return !path.startsWith("specs/");
}

/** "evidence" or "product" for the paths one commit touches. */
export function classifyCommitPaths(paths, featureId) {
  return paths.every((path) => isEvidencePath(path, featureId)) ? "evidence" : "product";
}

/** Parses `git log --format=%x00%H --name-only` output into [{ commit, paths }]. */
export function parseCommitPaths(output) {
  return String(output).split("\0").filter((chunk) => chunk.trim() !== "").map((chunk) => {
    const [commit, ...rest] = chunk.split("\n");
    return { commit: commit.trim(), paths: rest.map((line) => line.trim()).filter((line) => line !== "") };
  }).filter((entry) => OID.test(entry.commit));
}

/**
 * The one definition of where a feature's range starts (C28e: shared by this count and the Semgrep baseline of the security scan, ADR-0093):
 * the parent of the first first-parent commit that touched specs/<feature>/. `{ status: "found", first, base }`, where `base` is null when that
 * first commit has no parent (the feature starts the history); `{ status: "unavailable", reason }` otherwise.
 */
export function featureRangeBase({ rootDir, featureId, head = "HEAD", runGit = null } = {}) {
  if (!FEATURE.test(featureId ?? "")) return Object.freeze({ status: "unavailable", reason: "the feature id is not valid" });
  const git = runGit ?? ((args) => spawnSync("git", ["-C", rootDir, ...args], { encoding: "utf8", timeout: 15000 }));
  const text = (result) => (result?.status === 0 ? String(result.stdout ?? "") : null);
  const feature = text(git(["log", "--first-parent", "--reverse", "--format=%H", head, "--", `specs/${featureId}`]));
  const first = feature === null ? undefined : feature.split("\n").find((line) => OID.test(line.trim()))?.trim();
  if (first === undefined) return Object.freeze({ status: "unavailable", reason: feature === null ? "git log could not read the history" : `no commit touches specs/${featureId}` });
  const parent = text(git(["rev-parse", "--verify", "--quiet", `${first}^`]))?.trim() ?? "";
  return Object.freeze({ status: "found", first, base: OID.test(parent) ? parent : null });
}

/**
 * @param {{ rootDir: string, featureId: string, head?: string, runGit?: (args: string[]) => { status: number, stdout: string } }} input
 *   `runGit` runs git in the root and defaults to a real process; a close passes its own injectable runner.
 */
export function featureRangeCommitSplit({ rootDir, featureId, head = "HEAD", runGit = null } = {}) {
  const git = runGit ?? ((args) => spawnSync("git", ["-C", rootDir, ...args], { encoding: "utf8", timeout: 15000 }));
  const text = (result) => (result?.status === 0 ? String(result.stdout ?? "") : null);
  const range = featureRangeBase({ rootDir, featureId, head, runGit: git });
  if (range.status !== "found") return unavailable(range.reason);
  const { base } = range;
  const listing = text(git(["-c", "core.quotepath=off", "log", "--first-parent", "-m", "--no-renames", "--name-only", "--format=%x00%H", base === null ? head : `${base}..${head}`]));
  if (listing === null) return unavailable("git log could not read the range");
  const counts = { product: 0, evidence: 0 };
  for (const { paths } of parseCommitPaths(listing)) counts[classifyCommitPaths(paths, featureId)] += 1;
  return Object.freeze({ schema: CLOSE_COMMIT_SPLIT_SCHEMA, status: "counted", rangeSource: RANGE_SOURCE, base, product: counts.product, evidence: counts.evidence, total: counts.product + counts.evidence });
}

/** One sentence for a printed text; never states a count the split does not hold. */
export function describeCommitSplit(split) {
  if (split?.status !== "counted") return "The commits of the feature range could not be counted.";
  return `The feature range holds ${split.product} product commit(s) and ${split.evidence} evidence commit(s) (${split.total} in total, counted by the touched paths; the commits themselves are unchanged).`;
}
