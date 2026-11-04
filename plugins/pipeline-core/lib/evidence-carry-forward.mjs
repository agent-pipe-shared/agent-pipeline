// SPDX-License-Identifier: SUL-1.0
/**
 * Evidence-only carry-forward (candidate 19, D4b/E3; docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md, point 2).
 *
 * A Verify or Security record is bound to one candidate commit. A commit that changes only evidence records (the registration commit,
 * the evidence commit, the generated lifecycle files, the audit bundle) moves HEAD although no product line changed, which makes the
 * record stale for HEAD. This module answers one question and grants nothing: "may the record bound to `evidenceCommit` be carried to
 * `candidateCommit`?" It is a pure, read-only decision. NO reader calls it yet: wiring it into the push guard and the close coordinator
 * is the next stage and sits behind its own opt-in (the ADR has had one review and no second one).
 *
 * The evidence set is closed, defined here in plugin source, and by record class (never by file type): data files are consumed by gates,
 * guards and code, so the feature spec, plan and PRD, `project/guard-config.json`, every other `project/` file and any source, script or
 * configuration extension are product-bound and are never in the set. Security evidence is carried only together with a clean secret scan
 * of the files the passed-over commits changed (SEC-01); an unavailable scan or a finding fails closed.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const CARRY_FORWARD_SCHEMA = "pipeline.evidence-carry-forward.v1";

/** The closed evidence path classes. Each pattern must match the whole repository-relative path. */
export const EVIDENCE_PATH_PATTERNS = Object.freeze([
  /^specs\/[^/]+\/evidence\/.+$/u,
  /^specs\/[^/]+\/audit-bundles\/.+$/u,
  /^specs\/[^/]+\/lifecycle\.json$/u,
  /^specs\/[^/]+\/result\.md$/u,
  /^project\/push-threat-model\.md$/u,
]);

const FULL_SHA = /^[0-9a-f]{40}$/u;

export function isEvidencePath(path) {
  if (typeof path !== "string" || path === "" || path.startsWith("/") || path.split("/").some((part) => part === ".." || part === "." || part === "")) return false;
  return EVIDENCE_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
}

function requireCommit(name, value) {
  if (typeof value !== "string" || !FULL_SHA.test(value)) throw new Error(`${name} must be a full 40-hex commit id`);
  return value;
}

/** Hash over the tree entries of `commit` that lie OUTSIDE the evidence set (mode, type, object id and path of each). */
export function productTreeSha256(root, commit) {
  requireCommit("commit", commit);
  const entries = git(root, ["ls-tree", "-r", "-z", "--full-tree", commit]).split("\0").filter(Boolean);
  const kept = [];
  for (const entry of entries) {
    const tab = entry.indexOf("\t");
    const path = entry.slice(tab + 1);
    if (!isEvidencePath(path)) kept.push(entry);
  }
  kept.sort();
  return createHash("sha256").update(kept.join("\n")).digest("hex");
}

/**
 * @param {object} input
 * @param {string} input.root repository root
 * @param {string} input.evidenceCommit the full commit id the record is bound to
 * @param {string} input.candidateCommit the full commit id the record would be carried to
 * @param {"verify"|"security"} input.kind
 * @param {(files: string[], context: {root: string, commit: string, evidenceCommit: string}) => {status: "clean"|"finding"|"unavailable"}} [input.secretScan] required for kind "security"
 * @returns {{carried: boolean, reason: string, ...}} `carried: true` only when every changed path lies in the evidence set (and, for security, the scan is clean)
 */
export function evaluateEvidenceCarryForward({ root, evidenceCommit, candidateCommit, kind, secretScan } = {}) {
  if (kind !== "verify" && kind !== "security") throw new Error('kind must be "verify" or "security"');
  requireCommit("evidenceCommit", evidenceCommit);
  requireCommit("candidateCommit", candidateCommit);
  const result = (carried, reason, extra = {}) => ({ schema: CARRY_FORWARD_SCHEMA, kind, carried, reason, evidenceCommit, candidateCommit, ...extra });
  if (evidenceCommit === candidateCommit) {
    return result(true, "SAME-COMMIT", { passedOverCommits: [], changedEvidencePaths: [], productTreeSha256: productTreeSha256(root, candidateCommit) });
  }
  try { git(root, ["merge-base", "--is-ancestor", evidenceCommit, candidateCommit]); } catch { return result(false, "NOT-AN-ANCESTOR"); }
  const passedOverCommits = git(root, ["rev-list", "--reverse", `${evidenceCommit}..${candidateCommit}`]).split("\n").filter(Boolean);
  const changedPaths = [...new Set(git(root, ["diff", "--name-only", "-z", "--no-renames", evidenceCommit, candidateCommit]).split("\0").filter(Boolean))].sort();
  const productPath = changedPaths.find((path) => !isEvidencePath(path));
  if (productPath !== undefined) return result(false, "PRODUCT-PATH-CHANGED", { path: productPath });
  const before = productTreeSha256(root, evidenceCommit);
  const after = productTreeSha256(root, candidateCommit);
  if (before !== after) return result(false, "PRODUCT-TREE-CHANGED");
  if (kind === "security") {
    if (typeof secretScan !== "function") return result(false, "SECRET-SCAN-UNAVAILABLE");
    let scan;
    try { scan = secretScan(changedPaths, { root, commit: candidateCommit, evidenceCommit }); } catch { scan = null; }
    if (scan?.status !== "clean") return result(false, scan?.status === "finding" ? "SECRET-SCAN-FINDING" : "SECRET-SCAN-UNAVAILABLE");
  }
  return result(true, "EVIDENCE-ONLY", { passedOverCommits, changedEvidencePaths: changedPaths, productTreeSha256: after });
}
