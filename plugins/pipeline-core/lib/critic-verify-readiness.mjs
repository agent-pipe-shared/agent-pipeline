// SPDX-License-Identifier: SUL-1.0
/** Read-only final-candidate check: diagnostic Verify never asserts a Critic. */
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readCriticVerifyLifecycle } from "./critic-verify-lifecycle.mjs";
import { authorizeRecordedResidualAcceptanceByMode } from "./critical-action-authorization.mjs";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const RECEIPT = /^[a-f0-9]{64}\.json$/u;

// D190: a recorded PO acceptance of residual minor findings, read from the project state file. Inert
// (null) when no record is bound to this candidate, so the passing-receipt path is unchanged; the
// verifier re-checks the record in the configured approval mode (signature proof or chat waiver).
function residualAcceptanceDeps(repoRoot, candidate) {
  if (typeof repoRoot !== "string" || repoRoot.length === 0) return null;
  try {
    const state = JSON.parse(readFileSync(join(repoRoot, "project", "pipeline-state.json"), "utf8"));
    const record = state?.residualAcceptance?.lastAccepted;
    if (record === null || typeof record !== "object" || record.forCommit !== candidate.commit
      || record.forTree !== candidate.tree) return null;
    return {
      residualAcceptance: { candidate: { commit: record.forCommit, tree: record.forTree },
        criticReceiptSha256: record.criticReceiptSha256, findings: record.findings },
      verifyResidualAcceptanceFn: ({ candidate: bound, criticReceiptSha256, findings }) =>
        authorizeRecordedResidualAcceptanceByMode({ projectDir: repoRoot, state, candidate: bound,
          criticReceiptSha256, findings, now: new Date().toISOString() }),
    };
  } catch { return null; }
}

export function inspectCriticBoundVerify({ repoRoot = null, gitCommonDir, head, tree, worktreeState,
  evidencePath = "evidence/verify-latest.json", evidence, requireClean = true,
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
  // An actual push can name a commit other than checkout HEAD. Its source tree
  // is supplied explicitly; checkout cleanliness is a preparation constraint.
  if (requireClean && worktreeState !== "clean") return { ...exact, code: "checkout-not-clean" };
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
  const residualDeps = residualAcceptanceDeps(repoRoot, candidate);
  for (const id of ids) {
    try {
      if (residualDeps === null) readLifecycle({ repoRoot, gitCommonDir, id, candidate, evidencePath, evidence });
      else readLifecycle({ repoRoot, gitCommonDir, id, candidate, evidencePath, evidence }, residualDeps);
      return { ...exact, currentCheckoutOk: true, privateLifecycleBound: true,
        receiptId: id, code: "critic-bound-verify-valid" };
    } catch { /* Other candidates and invalid private records are not admission. */ }
  }
  return { ...exact, code: "private-critic-binding-unavailable" };
}
