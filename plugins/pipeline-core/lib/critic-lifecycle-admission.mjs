// SPDX-License-Identifier: SUL-1.0

/**
 * Pure admission predicate for the content-bound Critic/Verify lifecycle.
 *
 * This module validates receipts and candidate bindings only. It never starts
 * a Critic, runs Verify, or upgrades a diagnostic artifact into reviewer proof.
 */
import { validateSessionCriticReceipt } from "../scripts/session-critic-finalizer.mjs";
import { canonicalJson, sha256 } from "../scripts/critic-packet-preflight.mjs";

export const CRITIC_LIFECYCLE_ADMISSION_SCHEMA = "pipeline.critic-lifecycle-admission.v1";
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));
const digest = (value) => sha256(canonicalJson(value));
const failure = (code) => ({ ok: false, code });

export function criticLifecycleDigest(value) { return digest(value); }

function validCandidate(value) {
  return exact(value, ["commit", "tree", "diffSha256", "changedContent"])
    && OID.test(value.commit ?? "") && OID.test(value.tree ?? "")
    && SHA.test(value.diffSha256 ?? "") && typeof value.changedContent === "boolean";
}

function receiptFor(candidate, receipt, receiptSha256) {
  if (!object(receipt) || !SHA.test(receiptSha256 ?? "")) return failure("critic-receipt-required");
  try {
    validateSessionCriticReceipt(receipt);
  } catch {
    return failure("critic-receipt-invalid");
  }
  if (digest(receipt) !== receiptSha256) return failure("critic-receipt-digest-mismatch");
  if (receipt.candidate.commit !== candidate.commit || receipt.candidate.tree !== candidate.tree
    || receipt.reviewRange.commit !== candidate.commit || receipt.reviewRange.diffSha256 !== candidate.diffSha256) {
    return failure("critic-receipt-stale");
  }
  return { ok: true, pass: receipt.reviewPass, receiptSha256 };
}

function verifyReceiptFor(candidate, value) {
  // A status/digest pair supplied by a caller is not Verify evidence.  The
  // lifecycle accepts the concrete, public Verify receipt and binds its own
  // digest; callers cannot substitute a status assertion.
  if (!exact(value, ["receipt", "receiptSha256"]) || !object(value.receipt)
    || !SHA.test(value.receiptSha256 ?? "") || digest(value.receipt) !== value.receiptSha256) {
    return failure("verify-receipt-required");
  }
  const receipt = value.receipt;
  if (receipt.schema !== "pipeline.verify-evidence.v0" || receipt.exitCode !== 0
    || !exact(receipt.candidate, ["commit", "tree"])
    || !OID.test(receipt.candidate.commit ?? "") || !OID.test(receipt.candidate.tree ?? "")) {
    return failure("verify-receipt-invalid");
  }
  if (receipt.candidate.commit !== candidate.commit || receipt.candidate.tree !== candidate.tree) {
    return failure("verify-receipt-stale");
  }
  return { ok: true, receiptSha256: value.receiptSha256 };
}

/**
 * Evaluate one lifecycle snapshot.
 *
 * `priorCritic` is optional historical failure evidence. If it failed on a
 * prior candidate, `critic` must be a fresh review of the correction candidate.
 */
export function evaluateCriticLifecycleAdmission(input) {
  if (!exact(input, ["candidate", "critic", "priorCritic", "verify"]) || !validCandidate(input.candidate)) return failure("lifecycle-input-invalid");
  const { candidate, critic, priorCritic, verify } = input;
  const verified = verifyReceiptFor(candidate, verify);
  if (!verified.ok) return verified;

  if (!candidate.changedContent) {
    return { ok: true, code: "admitted-no-content-change", criticRequired: false, verifyRequired: false };
  }

  if (!exact(critic, ["receipt", "receiptSha256"])) return failure("critic-required-before-verify");
  const current = receiptFor(candidate, critic.receipt, critic.receiptSha256);
  if (!current.ok) return current;
  if (!current.pass) return failure("critic-findings-unresolved");

  if (priorCritic !== null) {
    if (!exact(priorCritic, ["receipt", "receiptSha256"])) return failure("prior-critic-invalid");
    const prior = priorCritic.receipt;
    if (typeof priorCritic.receiptSha256 !== "string" || !SHA.test(priorCritic.receiptSha256)
      || digest(prior) !== priorCritic.receiptSha256) return failure("prior-critic-digest-mismatch");
    try { validateSessionCriticReceipt(prior); } catch { return failure("prior-critic-invalid"); }
    if (prior.reviewPass === false && (prior.candidate.commit === candidate.commit || prior.reviewRange.diffSha256 === candidate.diffSha256)) {
      return failure("correction-review-required");
    }
  }

  return {
    ok: true, code: "admitted",
    criticRequired: false,
    verifyRequired: false,
  };
}
