// SPDX-License-Identifier: SUL-1.0
//
// Exports (stable — downstream packages import from this exact module path):
//   createEvaluationReceipt({ candidateId, policyDigest, resolvedControls, evaluatedAt })
//                                -> Receipt
//                                Binds one resolved policy (CYB-1b's
//                                resolveApplicableControls() output) to an exact
//                                candidate; pure, throws a typed TypeError when
//                                candidateId/policyDigest/resolvedControls is
//                                missing or malformed. Never recomputes
//                                `policyDigest` — it is bound in verbatim.
//   validateEvaluationReceipt(receipt)
//                                -> { valid: true } | { valid: false, errors }
//                                Typed accept/reject of a receipt object's
//                                SHAPE (mirrors control-catalog-schema.mjs's
//                                validateControl typed-rejection style: the
//                                same `{ valid, errors: [{ field, code, message }] }`
//                                result shape). Unlike validateControl, this
//                                does NOT close the schema against extra
//                                top-level keys — `evaluatedAt` (optional,
//                                informative-only metadata) must round-trip
//                                through here without being rejected, so only
//                                the four required fields are checked.
//
// Implements cyb-1-feature-spec.md §3 rows AC6 (binding + digest determinism)
// and AC11 (single documented consumption contract) only.
//
// ============================================================================
// SINGLE CONSUMPTION CONTRACT (AC11 — read this before writing a new receipt
// or policy shape anywhere in this codebase):
//
// `pipeline.control-catalog.v1` resolution (CYB-1b's
// resolveApplicableControls() output) -> THIS receipt shape (below) is the
// ONE, sole, normalized evaluation-receipt schema that #5, #6, #9, and
// Release/Promotion consume. Per cyb-1f-schema-boundary-draft.md §8: "The
// evaluation receipt (#41 §5) is a separate schema (`pipeline.control-catalog.v1`
// resolution -> receipt) that references these fields by digest ... it is not
// a second policy authority." No package may define a second, parallel policy/result schema
// of its own — any downstream package that needs a candidate-bound
// evaluation result consumes createEvaluationReceipt() /
// validateEvaluationReceipt() from THIS module, never a bespoke shape.
// ============================================================================
//
// Receipt shape:
//
//   {
//     candidateId,       // string, required, non-empty — the exact candidate
//                        // this evaluation is bound to (#41 §5: a receipt
//                        // without it is meaningless)
//     policyDigest,      // string, required, non-empty — verbatim
//                        // CYB-1b resolveApplicableControls().digest, bound
//                        // in as-is; this module never recomputes or
//                        // second-guesses it (#41 §5: same "meaningless
//                        // without it" reasoning as candidateId)
//     resolvedControls,  // array, required — CYB-1b's resolvedControls
//                        // output, passed through unchanged (never
//                        // transformed); may legitimately be empty (a
//                        // zero-control resolution is still a valid receipt)
//     evaluatedAt,       // string | null — optional ISO-8601 timestamp,
//                        // informative only; NOT part of the receiptDigest
//                        // payload (two evaluations at different wall-clock
//                        // times but identical candidate/policy/controls
//                        // still produce identical receiptDigest values)
//     receiptDigest,     // 'sha256:<hex>' — stable content hash over the
//                        // canonicalized (key-sorted) serialization of
//                        // { candidateId, policyDigest, resolvedControls }.
//                        // Deterministic: identical inputs -> identical
//                        // digest; a different candidateId (all else equal)
//                        // -> a different digest (AC6). This is THIS
//                        // module's own digest, independent of and never
//                        // conflated with CYB-1b's `policyDigest`.
//   }
//
// Both exported functions are pure: no fs/network access, no mutation of any
// input argument.

import { createHash } from "node:crypto";

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// Deterministic, key-order-independent serialization used only for digesting
// (read-only: never mutates `value`, tolerates deeply frozen input). Mirrors
// CYB-1b's own canonicalization discipline; kept as a local, independent copy
// so this module has no import-time coupling to security-policy-resolver.mjs.
function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function computeReceiptDigest({ candidateId, policyDigest, resolvedControls }) {
  const payload = canonicalize({ candidateId, policyDigest, resolvedControls });
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

// Binds one resolved policy (CYB-1b's resolveApplicableControls() output) to
// an exact candidate (AC6). Pure: performs no filesystem/network access and
// mutates none of `input`'s (nested) values.
export function createEvaluationReceipt(input) {
  if (!isPlainObject(input)) {
    throw new TypeError("createEvaluationReceipt: input must be a plain object");
  }
  const { candidateId, policyDigest, resolvedControls, evaluatedAt } = input;

  if (!isNonEmptyString(candidateId)) {
    throw new TypeError(
      `createEvaluationReceipt: "candidateId" is required and must be a non-empty string (a receipt without it is meaningless, #41 §5), got ${JSON.stringify(candidateId)}`,
    );
  }
  if (!isNonEmptyString(policyDigest)) {
    throw new TypeError(
      `createEvaluationReceipt: "policyDigest" is required and must be a non-empty string — bind CYB-1b's resolveApplicableControls().digest as-is, never recompute it (a receipt without it is meaningless, #41 §5), got ${JSON.stringify(policyDigest)}`,
    );
  }
  if (!Array.isArray(resolvedControls)) {
    throw new TypeError(
      `createEvaluationReceipt: "resolvedControls" is required and must be an array — pass CYB-1b's resolveApplicableControls().resolvedControls through unchanged (an empty array is a legitimate zero-control resolution), got ${JSON.stringify(resolvedControls)}`,
    );
  }
  if (evaluatedAt !== undefined && evaluatedAt !== null && !isNonEmptyString(evaluatedAt)) {
    throw new TypeError(
      `createEvaluationReceipt: "evaluatedAt", when supplied, must be a non-empty string (ISO-8601 timestamp) or omitted/null, got ${JSON.stringify(evaluatedAt)}`,
    );
  }

  const receiptDigest = computeReceiptDigest({ candidateId, policyDigest, resolvedControls });

  return {
    candidateId,
    policyDigest,
    resolvedControls,
    evaluatedAt: evaluatedAt ?? null,
    receiptDigest,
  };
}

const REQUIRED_FIELDS = ["candidateId", "policyDigest", "resolvedControls", "receiptDigest"];

// Typed accept/reject of a receipt object's shape (AC11). Pure: performs no
// filesystem/network access and mutates none of `receipt`'s (nested) values.
// Deliberately does NOT close the schema against extra top-level keys (unlike
// control-catalog-schema.mjs's validateControl) — `evaluatedAt` is optional,
// informative metadata that must round-trip through here unrejected.
export function validateEvaluationReceipt(receipt) {
  if (!isPlainObject(receipt)) {
    return {
      valid: false,
      errors: [{ field: null, code: "RECEIPT-NOT-OBJECT", message: "evaluation receipt must be a plain object" }],
    };
  }

  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (!hasOwn(receipt, field) || receipt[field] === undefined) {
      errors.push({ field, code: "RECEIPT-MISSING-FIELD", message: `missing required field "${field}"` });
    }
  }

  if (hasOwn(receipt, "candidateId") && receipt.candidateId !== undefined && !isNonEmptyString(receipt.candidateId)) {
    errors.push({ field: "candidateId", code: "RECEIPT-INVALID-CANDIDATE-ID", message: 'field "candidateId" must be a non-empty string' });
  }
  if (hasOwn(receipt, "policyDigest") && receipt.policyDigest !== undefined && !isNonEmptyString(receipt.policyDigest)) {
    errors.push({ field: "policyDigest", code: "RECEIPT-INVALID-POLICY-DIGEST", message: 'field "policyDigest" must be a non-empty string' });
  }
  if (hasOwn(receipt, "receiptDigest") && receipt.receiptDigest !== undefined && !isNonEmptyString(receipt.receiptDigest)) {
    errors.push({ field: "receiptDigest", code: "RECEIPT-INVALID-RECEIPT-DIGEST", message: 'field "receiptDigest" must be a non-empty string' });
  }
  if (hasOwn(receipt, "resolvedControls") && receipt.resolvedControls !== undefined && !Array.isArray(receipt.resolvedControls)) {
    errors.push({ field: "resolvedControls", code: "RECEIPT-INVALID-RESOLVED-CONTROLS", message: 'field "resolvedControls" must be an array' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
