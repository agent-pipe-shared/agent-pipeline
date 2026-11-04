// SPDX-License-Identifier: SUL-1.0
/**
 * Reader of the evidence-only carry-forward decision (candidate 19, D4b/E3 order of work, step 3; OPT-IN block of the apply script,
 * docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md point 2 and the amendment of 2026-11-04).
 *
 * `lib/evidence-carry-forward.mjs` answers "may the record bound to commit A be carried to commit B?" and grants nothing. This module is
 * the one place a push-gate reader asks it: it never throws, it returns the decision (or a refusal with a reason), and it supplies the
 * secret scan that a Security record needs (SEC-01). A Verify record needs no scan. An unavailable scanner, a finding, an invalid commit
 * or any error is a refusal: the record stays stale for HEAD, exactly as without this patch.
 */
import { spawnSync } from "node:child_process";
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

/**
 * @param {object} input
 * @param {string} input.root repository root
 * @param {{commit?: string}} input.record the parsed Verify or Security record
 * @param {"verify"|"security"} input.kind
 * @param {string} input.candidateCommit the full commit id the record would be carried to
 * @returns {{carried: boolean, reason: string}} never throws
 */
export function evidenceCarriedForward({ root, record, kind, candidateCommit, secretScan = gitleaksRangeSecretScan, evaluate = evaluateEvidenceCarryForward } = {}) {
  try {
    const decision = evaluate({ root, evidenceCommit: record?.commit, candidateCommit, kind, secretScan });
    return decision?.carried === true ? decision : { carried: false, reason: typeof decision?.reason === "string" ? decision.reason : "NOT-CARRIED" };
  } catch {
    return { carried: false, reason: "CARRY-FORWARD-INPUT-INVALID" };
  }
}
