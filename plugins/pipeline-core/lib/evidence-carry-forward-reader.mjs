// SPDX-License-Identifier: SUL-1.0
/**
 * Reader of the evidence-only carry-forward decision (candidate 19, D4b/E3 order of work, step 3; ACTIVE by default since the PO
 * decision of 2026-11-04, docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md point 2 and the amendment of 2026-11-04).
 *
 * `lib/evidence-carry-forward.mjs` answers "may the record bound to commit A be carried to commit B?" and grants nothing. This module is
 * the one place a push-gate reader asks it: it never throws, it returns the decision (or a refusal with a reason), and it supplies the
 * secret scan that a Security record needs (SEC-01). A Verify record needs no scan. An unavailable scanner, a finding, an invalid commit
 * or any error is a refusal: the record stays stale for HEAD, exactly as without a carry-forward. A carried decision also names the tree
 * of the evidence commit (`evidenceTree`), because a record that binds a tree (the Security records) must be checked against the tree of
 * the commit it was produced for, not against the tree of the commit it is carried to.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { isInstalled, resolveGitleaksConfigPath } from "../scripts/security-adapters/gitleaks.mjs";
import { evaluateEvidenceCarryForward } from "./evidence-carry-forward.mjs";

export const CARRY_FORWARD_SCAN_TIMEOUT_MS = 120000;

/**
 * Secret scan of the commits a carry-forward passes over: `gitleaks git <root> --log-opts <evidenceCommit>..<commit>` with the plugin's
 * resolved gitleaks config. Exit 0 is clean, exit 2 (forced with --exit-code 2) is a finding, anything else (missing binary, missing
 * config, timeout, spawn error, gitleaks' own error exit 1) is `unavailable`, which the decision treats as a refusal.
 */
export function gitleaksRangeSecretScan(_files, { root, commit, evidenceCommit } = {}, deps = {}) {
  if (typeof root !== "string" || typeof commit !== "string" || typeof evidenceCommit !== "string") return { status: "unavailable" };
  try {
    const binary = (deps.isInstalled ?? isInstalled)(deps.env ?? process.env);
    if (!binary?.installed || typeof binary.path !== "string") return { status: "unavailable" };
    const config = (deps.resolveConfig ?? resolveGitleaksConfigPath)();
    if (typeof config !== "string" || config === "") return { status: "unavailable" };
    const result = (deps.spawn ?? spawnSync)(binary.path, [
      "git", root,
      "--log-opts", `${evidenceCommit}..${commit}`,
      "--config", config,
      "--no-banner", "--redact", "--exit-code", "2",
    ], { encoding: "utf8", timeout: deps.timeoutMs ?? CARRY_FORWARD_SCAN_TIMEOUT_MS, shell: false });
    if (result?.error || result?.status === null || result?.status === undefined) return { status: "unavailable" };
    if (result.status === 0) return { status: "clean" };
    if (result.status === 2) return { status: "finding" };
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

// One push decision asks the same question up to three times (the freshness verdict, the v1 candidate binding, the v2 completeness
// gate); the scan is the expensive part. Commit ids are immutable, so the answer for one (repository, kind, pair) is kept for the life of
// the process. Only the default decision and scan are kept: an injected double is never cached.
const decisions = new Map();

/**
 * @param {object} input
 * @param {string} input.root repository root
 * @param {{commit?: string}} input.record the parsed Verify or Security record
 * @param {"verify"|"security"} input.kind
 * @param {string} input.candidateCommit the full commit id the record would be carried to
 * @returns {{carried: boolean, reason: string, evidenceTree?: string}} never throws; a carried decision names `passedOverCommits` and `evidenceTree`
 */
export function evidenceCarriedForward({ root, record, kind, candidateCommit, secretScan = gitleaksRangeSecretScan, evaluate = evaluateEvidenceCarryForward } = {}) {
  const key = secretScan === gitleaksRangeSecretScan && evaluate === evaluateEvidenceCarryForward
    ? JSON.stringify([root, kind, record?.commit, candidateCommit]) : null;
  if (key !== null && decisions.has(key)) return decisions.get(key);
  const decision = decide({ root, record, kind, candidateCommit, secretScan, evaluate });
  if (key !== null) decisions.set(key, decision);
  return decision;
}

function decide({ root, record, kind, candidateCommit, secretScan, evaluate }) {
  try {
    const decision = evaluate({ root, evidenceCommit: record?.commit, candidateCommit, kind, secretScan });
    if (decision?.carried !== true) return { carried: false, reason: typeof decision?.reason === "string" ? decision.reason : "NOT-CARRIED" };
    const evidenceTree = execFileSync("git", ["-C", root, "rev-parse", `${record.commit}^{tree}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (!/^[0-9a-f]{40}$/u.test(evidenceTree)) return { carried: false, reason: "CARRY-FORWARD-INPUT-INVALID" };
    return { ...decision, evidenceTree };
  } catch {
    return { carried: false, reason: "CARRY-FORWARD-INPUT-INVALID" };
  }
}
