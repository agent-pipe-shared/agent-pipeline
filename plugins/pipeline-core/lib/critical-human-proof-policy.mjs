// SPDX-License-Identifier: SUL-1.0
/**
 * The project's critical-human-proof policy (ADR-0055).
 *
 * Extracted so the State writer and the push guard read ONE implementation. They
 * previously could not: the reader lived inside `scripts/pipeline-state.mjs`, so the
 * guard had no way to see the policy at all and simply assumed it.
 *
 * `.v1` — `requiredKinds` only. Deleting a kind from that list does not relax the
 * gate; the writer action REJECTS instead, so nobody can quietly disarm the proof by
 * trimming a list. That stays true.
 *
 * `.v2` — adds the one thing `.v1` had no answer for: an operator who genuinely wants
 * the cryptographic proof off. A waiver must name its kind AND carry a reason, so
 * standing the gate down is a committed, diffable, attributable act. The waived kind
 * stays in `requiredKinds`: the action remains gated, only the private-key proof is
 * no longer demanded.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { USER_SOURCE_PATH, HUMAN_APPROVAL_MODE_KEY, readGateApprovalMode, readHumanApprovalMode, CRITICAL_HUMAN_PROOF_POLICY_PATH, CRITICAL_HUMAN_PROOF_POLICY_V3, SHA256, KEY_REFERENCE, anchorShapeOk, readCriticalHumanProofPolicy } from "./critical-human-proof-policy-read.mjs";
import { isWellFormedEd25519PublicKey } from "./critical-human-proof-policy-read.mjs";
export { criticalProofWaiverFor, isWellFormedEd25519PublicKey, verifyAgainstTrustAnchors } from "./critical-human-proof-policy-read.mjs";
export { USER_SOURCE_PATH, DEFAULT_PUSH_APPROVAL_MODE, DEFAULT_HUMAN_APPROVAL_MODE, HUMAN_APPROVAL_MODE_KEY, DEFAULT_RECONCILE_APPROVAL_MODE, readHumanApprovalMode, CRITICAL_HUMAN_PROOF_POLICY_PATH, CRITICAL_HUMAN_PROOF_POLICY_V1, CRITICAL_HUMAN_PROOF_POLICY_V2, CRITICAL_HUMAN_PROOF_POLICY_V3, readCriticalHumanProofPolicy } from "./critical-human-proof-policy-read.mjs";


export function readPushApprovalMode(dir, opts = {}) {
  return readGateApprovalMode(dir, "push", opts);
}

/** Mirrors `readPushApprovalMode` exactly, for `gates.reconcile_approval` (ADR-0056 Follow-up). */
export function readReconcileApprovalMode(dir, opts = {}) {
  return readGateApprovalMode(dir, "feature-package-reconcile", opts);
}

/**
 * Per-key TOFU confirmation and storage of confirmed keys in `trustAnchors[]` (WP-B2-4).
 *
 * Gated by signature-or-chat confirmation before first use; confirmed keys persist in
 * `project/critical-human-proof.json` under schema v3.
 */
export function confirmTrustAnchorKey(dir, { keyReference, publicKeySha256, publicKey } = {}) {
  let resolvedSha = publicKeySha256;
  if (typeof publicKey === "string" && publicKey.trim() !== "") {
    if (!isWellFormedEd25519PublicKey(publicKey)) {
      return { ok: false, code: "PO-APPROVAL-PROOF-INVALID" };
    }
    resolvedSha = createHash("sha256").update(publicKey).digest("hex");
  }
  if (typeof keyReference !== "string" || !KEY_REFERENCE.test(keyReference)
    || typeof resolvedSha !== "string" || !SHA256.test(resolvedSha)) {
    return { ok: false, code: "CRITICAL-PROOF-POLICY-TRUST-ANCHOR-INVALID" };
  }
  const path = resolve(dir, CRITICAL_HUMAN_PROOF_POLICY_PATH);
  let doc;
  if (existsSync(path)) {
    try {
      doc = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return { ok: false, code: "CRITICAL-PROOF-POLICY-UNREADABLE" };
    }
  } else {
    doc = {
      schema: CRITICAL_HUMAN_PROOF_POLICY_V3,
      requiredKinds: ["push"],
      waivedKinds: [],
      trustAnchors: [],
    };
  }
  doc.schema = CRITICAL_HUMAN_PROOF_POLICY_V3;
  if (!Array.isArray(doc.requiredKinds)) doc.requiredKinds = ["push"];
  if (!Array.isArray(doc.waivedKinds)) doc.waivedKinds = [];
  const existingAnchors = Array.isArray(doc.trustAnchors)
    ? [...doc.trustAnchors]
    : (doc.trustAnchor && anchorShapeOk(doc.trustAnchor) ? [{ ...doc.trustAnchor }] : []);
  const alreadyPresent = existingAnchors.some((a) => a.publicKeySha256 === resolvedSha);
  if (!alreadyPresent) {
    existingAnchors.push({ keyReference, publicKeySha256: resolvedSha });
  }
  doc.trustAnchors = existingAnchors;
  delete doc.trustAnchor;
  const dirName = dirname(path);
  mkdirSync(dirName, { recursive: true });
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  return {
    ok: true,
    confirmed: !alreadyPresent,
    alreadyPresent,
    anchor: { keyReference, publicKeySha256: resolvedSha },
    trustAnchors: doc.trustAnchors,
  };
}

export const storeConfirmedTrustAnchor = confirmTrustAnchorKey;

export function isRecognizedTrustAnchorKey(dir, { publicKeySha256, publicKey } = {}) {
  let resolvedSha = publicKeySha256;
  if (typeof publicKey === "string" && isWellFormedEd25519PublicKey(publicKey)) {
    resolvedSha = createHash("sha256").update(publicKey).digest("hex");
  }
  if (!resolvedSha || typeof resolvedSha !== "string") return false;
  const policy = readCriticalHumanProofPolicy(dir);
  if (!policy.ok) return false;
  if (Array.isArray(policy.trustAnchors)) {
    return policy.trustAnchors.some((a) => a.publicKeySha256 === resolvedSha);
  }
  if (policy.trustAnchor !== null) {
    return policy.trustAnchor.publicKeySha256 === resolvedSha;
  }
  return false;
}
