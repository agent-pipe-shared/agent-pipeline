// SPDX-License-Identifier: SUL-1.0
/**
 * A deliberately unprivileged remote acknowledgement.  The code is not a
 * secret or identity proof: it is hashed only to avoid retaining its value and
 * can unlock just one explicitly local continuation scope.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const REMOTE_PROVISIONAL_RECEIPT_SCHEMA = "pipeline.remote-provisional-receipt.v1";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const code = (value) => typeof value === "string" && /^[A-Z2-9-]{12,128}$/u.test(value);
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const candidate = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === 2 && OID.test(value.commit ?? "") && OID.test(value.tree ?? "") && value.commit !== value.tree;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value) => createHash("sha256").update(value).digest("hex");

export function createRemoteProvisionalReceipt({ candidate: receiptCandidate, scopeSha256, code: acknowledgementCode, expiresAt, now } = {}) {
  if (!candidate(receiptCandidate) || !SHA.test(scopeSha256 ?? "") || !code(acknowledgementCode) || !iso(expiresAt) || !iso(now)
    || Date.parse(expiresAt) <= Date.parse(now) || Date.parse(expiresAt) - Date.parse(now) > 30 * 60 * 1000) {
    throw new TypeError("remote provisional receipt is invalid");
  }
  return {
    schema: REMOTE_PROVISIONAL_RECEIPT_SCHEMA,
    candidate: structuredClone(receiptCandidate),
    scopeSha256,
    codeSha256: digest(acknowledgementCode),
    expiresAt,
    consumedAt: null,
  };
}

export function consumeRemoteProvisionalReceipt({ receipt, candidate: expectedCandidate, scopeSha256, code: acknowledgementCode, now } = {}) {
  if (!own(receipt, ["schema", "candidate", "scopeSha256", "codeSha256", "expiresAt", "consumedAt"])
    || receipt.schema !== REMOTE_PROVISIONAL_RECEIPT_SCHEMA || !candidate(receipt.candidate)
    || !SHA.test(receipt.scopeSha256 ?? "") || !SHA.test(receipt.codeSha256 ?? "") || !iso(receipt.expiresAt)
    || receipt.consumedAt !== null || !candidate(expectedCandidate) || !SHA.test(scopeSha256 ?? "") || !code(acknowledgementCode) || !iso(now)) {
    return { ok: false, code: "REMOTE-PROVISIONAL-INVALID" };
  }
  if (receipt.candidate.commit !== expectedCandidate.commit || receipt.candidate.tree !== expectedCandidate.tree || receipt.scopeSha256 !== scopeSha256) {
    return { ok: false, code: "REMOTE-PROVISIONAL-SCOPE-MISMATCH" };
  }
  if (Date.parse(now) > Date.parse(receipt.expiresAt)) return { ok: false, code: "REMOTE-PROVISIONAL-EXPIRED" };
  const actual = Buffer.from(digest(acknowledgementCode), "hex");
  const expected = Buffer.from(receipt.codeSha256, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { ok: false, code: "REMOTE-PROVISIONAL-CODE-MISMATCH" };
  return { ok: true, value: { ...structuredClone(receipt), consumedAt: now } };
}

/** Final/irreversible action kinds never accept a provisional receipt. */
export function provisionalReceiptAllowedForAction(kind) {
  return kind === "local-continuation";
}
