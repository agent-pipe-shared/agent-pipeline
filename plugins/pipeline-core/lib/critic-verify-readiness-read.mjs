// SPDX-License-Identifier: SUL-1.0
/**
 * Read half of lib/critic-verify-readiness.mjs (D216 option A, D219): the residual-acceptance record reader and dependency loader,
 * with no filesystem-write API. The old module imports and re-exports these symbols.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { authorizeRecordedResidualAcceptanceByMode } from "./critical-action-authorization-read.mjs";
import { canonicalJson, readConsumedCandidateReceipt, sha256 } from "./critic-packet-preflight-read.mjs";

export const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SHA = /^[a-f0-9]{64}$/u;
const PACKET = /^[a-f0-9]{32}$/u;

export const RESIDUAL_ACCEPTANCE_PRIVATE_SCHEMA = "pipeline.critic-residual-acceptance-record.v1";

// N22: a PO acceptance of residual minor findings is a PRIVATE record, bound to the consumed Critic receipt's
// own candidate and kept under the git common directory next to the Critic packets. The tracked project state
// file is never written, so the checkout stays clean and the acceptance survives an evidence-only commit.
export function residualAcceptanceRecordPath(gitCommonDir, criticReceiptSha256) {
  if (typeof gitCommonDir !== "string" || gitCommonDir.length === 0 || !SHA.test(criticReceiptSha256 ?? "")) {
    throw new Error("RESIDUAL-RECORD-INPUT");
  }
  return join(resolve(gitCommonDir), "agent-pipeline", "critic-residual-acceptance", `${criticReceiptSha256}.json`);
}

/**
 * The one loader: the lifecycle deps `{ residualAcceptance, verifyResidualAcceptanceFn }` for a Critic receipt
 * digest, or null when no private record exists (the passing-receipt path is then unchanged). The verifier
 * re-checks the record in the configured approval mode through a state-shaped object, so the authorizers in
 * critical-action-authorization.mjs stay as they are.
 */
export function loadResidualAcceptanceDeps({ gitCommonDir, projectDir = null, criticReceiptSha256,
  authorizeFn = authorizeRecordedResidualAcceptanceByMode, now = () => new Date().toISOString() } = {}) {
  try {
    const stored = JSON.parse(readFileSync(residualAcceptanceRecordPath(gitCommonDir, criticReceiptSha256), "utf8"));
    const record = stored?.record;
    if (stored?.schema !== RESIDUAL_ACCEPTANCE_PRIVATE_SCHEMA || record === null || typeof record !== "object"
      || record.criticReceiptSha256 !== criticReceiptSha256 || !OID.test(record.forCommit ?? "") || !OID.test(record.forTree ?? "")
      || !Array.isArray(record.findings)) return null;
    let projectState = {};
    if (typeof projectDir === "string" && projectDir.length > 0) {
      try { projectState = JSON.parse(readFileSync(join(projectDir, "project", "pipeline-state.json"), "utf8")); } catch { projectState = {}; }
    }
    const state = { ...projectState, residualAcceptance: { lastAccepted: record },
      criticalProofConsumption: stored.consumption === null || stored.consumption === undefined ? [] : [stored.consumption] };
    return {
      // D227: the reason class travels only when the private record carries it (a minor-only record yields the exact old shape).
      residualAcceptance: { candidate: { commit: record.forCommit, tree: record.forTree },
        criticReceiptSha256: record.criticReceiptSha256, findings: record.findings,
        ...(record.reasonClass === undefined ? {} : { reasonClass: record.reasonClass }) },
      verifyResidualAcceptanceFn: ({ candidate: bound, criticReceiptSha256: bondSha, findings, reasonClass }) =>
        authorizeFn({ projectDir, state, candidate: bound, criticReceiptSha256: bondSha, findings, now: now(),
          ...(reasonClass === undefined ? {} : { reasonClass }) }),
    };
  } catch { return null; }
}

/** The same loader keyed by consumed Critic packet id (the digest is that of the packet's consumed receipt). */
export function loadResidualAcceptanceDepsForPacket({ gitCommonDir, projectDir = null, criticPacketId,
  readConsumedCandidateReceiptFn = readConsumedCandidateReceipt, authorizeFn, now } = {}) {
  try {
    if (typeof gitCommonDir !== "string" || !PACKET.test(criticPacketId ?? "")) return null;
    const { receipt } = readConsumedCandidateReceiptFn({
      controlRoot: join(resolve(gitCommonDir), "agent-pipeline", "critic-packets"), packetId: criticPacketId });
    return loadResidualAcceptanceDeps({ gitCommonDir, projectDir, criticReceiptSha256: sha256(canonicalJson(receipt)),
      ...(authorizeFn === undefined ? {} : { authorizeFn }), ...(now === undefined ? {} : { now }) });
  } catch { return null; }
}

