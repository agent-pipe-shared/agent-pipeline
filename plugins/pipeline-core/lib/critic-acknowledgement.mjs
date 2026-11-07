// SPDX-License-Identifier: SUL-1.0
/**
 * G20-39 (candidate 20, AC-108): the PO acknowledgement of a caller-authored Critic, the bridge for a runner that issues no Source return record.
 *
 * At rigor >= 1 or high risk the close gate (scripts/close-coordinator.mjs `assertCriticIndependenceForClose`) refuses a verdict finalized as
 * `caller-authored-fallback` (C19-D2b). This kind is the one runnable repair: a PO approval, recorded through the existing human-approval route
 * (`pipeline-state.mjs approve-critic-acknowledgement`, signature or chat per `gates.human_approval`, modelled on `feature-package-reconcile`),
 * bound to exactly one consumed Critic packet and the candidate it reviewed. It is never generic and never inferred: another packet, another
 * receipt or another candidate does not match. The close record keeps the label `caller-authored-fallback` together with this reference.
 */
import { canonicalJson, sha256 } from "./critic-packet-preflight-read.mjs";
import { readPrivateApprovals } from "./critical-action-authorization.mjs";

export const CRITIC_ACKNOWLEDGEMENT_KIND = "acknowledge-caller-authored-critic";
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** The signed / attributed subject: the packet, the digest of its consumed receipt and the label being acknowledged. */
export function criticAcknowledgementSubject({ packetId, receipt }) {
  return { packetId, criticReceiptSha256: sha256(canonicalJson(receipt)), independence: receipt?.independence ?? null };
}

/**
 * The acknowledgement recorded for exactly this consumed receipt, as a bounded reference, or null. The record is read from the private
 * approval store; its proof was verified and consumed when it was recorded.
 */
export function findCriticAcknowledgement({ gitCommonDir, packetId, receipt }) {
  const subject = criticAcknowledgementSubject({ packetId, receipt });
  for (const envelope of readPrivateApprovals(gitCommonDir, CRITIC_ACKNOWLEDGEMENT_KIND).reverse()) {
    const approval = envelope.approval;
    if (!object(approval) || approval.packetId !== subject.packetId || approval.criticReceiptSha256 !== subject.criticReceiptSha256
      || approval.forCommit !== receipt?.candidate?.commit || approval.forTree !== receipt?.candidate?.tree) continue;
    return Object.freeze({ kind: CRITIC_ACKNOWLEDGEMENT_KIND, packetId, criticReceiptSha256: subject.criticReceiptSha256, approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt, mode: object(approval.criticalProof) ? "signature" : "chat-attributed-unattested", proofSha256: approval.criticalProof?.proofSha256 ?? null });
  }
  return null;
}
