// SPDX-License-Identifier: SUL-1.0
/** Read-only final-candidate check: diagnostic Verify never asserts a Critic. */
import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readCriticVerifyLifecycle } from "./critic-verify-lifecycle.mjs";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const RECEIPT = /^[a-f0-9]{64}\.json$/u;

export function inspectCriticBoundVerify({ repoRoot = null, gitCommonDir, head, tree, worktreeState,
  evidencePath = "evidence/verify-latest.json", evidence,
  readLifecycle = readCriticVerifyLifecycle } = {}) {
  const base = { headEvidenceOk: false, currentCheckoutOk: false,
    privateLifecycleBound: false, receiptId: null };
  const candidate = { commit: head, tree };
  if (!OID.test(head ?? "") || !OID.test(tree ?? "")
    || evidence?.schema !== "pipeline.verify-evidence.v0"
    || evidence?.exitCode !== 0 || evidence?.commit !== head || evidence?.tree !== tree
    || evidence?.candidate?.commit !== head || evidence?.candidate?.tree !== tree
    || evidence?.verifyRun?.status !== "passed"
    || !/^[a-f0-9]{64}$/u.test(evidence?.verifyRun?.terminalSha256 ?? "")
    || !Array.isArray(evidence?.steps) || evidence.steps.length === 0
    || evidence.steps.some((step) => step?.exitCode !== 0)) {
    return { ...base, code: "verify-evidence-not-exact-green" };
  }
  const exact = { ...base, headEvidenceOk: true };
  if (worktreeState !== "clean") return { ...exact, code: "checkout-not-clean" };
  if (typeof gitCommonDir !== "string" || gitCommonDir.length === 0) {
    return { ...exact, code: "git-common-dir-unavailable" };
  }
  const directory = join(gitCommonDir, "agent-pipeline", "critic-verify-lifecycle");
  let ids;
  try {
    if (!lstatSync(directory).isDirectory()) throw new Error("not-directory");
    const entries = readdirSync(directory);
    if (entries.length > 4096) return { ...exact, code: "private-receipt-inventory-too-large" };
    ids = entries.filter((name) => RECEIPT.test(name)).map((name) => name.slice(0, -5));
  } catch {
    return { ...exact, code: "private-critic-binding-unavailable" };
  }
  for (const id of ids) {
    try {
      readLifecycle({ repoRoot, gitCommonDir, id, candidate, evidencePath, evidence });
      return { ...exact, currentCheckoutOk: true, privateLifecycleBound: true,
        receiptId: id, code: "critic-bound-verify-valid" };
    } catch { /* Other candidates and invalid private records are not admission. */ }
  }
  return { ...exact, code: "private-critic-binding-unavailable" };
}
