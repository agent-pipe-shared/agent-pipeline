// SPDX-License-Identifier: SUL-1.0

/**
 * Private, host-observed route sequence for one Advisor receipt. The public
 * receipt intentionally summarizes only the selected adapter and last failure;
 * an unavailable exception must not infer earlier attempts from that summary.
 * This is local host evidence, not provider attestation.
 */
import { createHash } from "node:crypto";

export const ADVISORY_ATTEMPT_TRAIL_SCHEMA = "pipeline.advisory-attempt-trail.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ADAPTER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const FAILURES = new Set(["unavailable", "failed", "timed-out", "permission-denied"]);
const STATUSES = new Set(["answered", ...FAILURES]);

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function failure(code) { return { ok: false, code }; }
export function advisoryAttemptReceiptSha256(receiptBytes) {
  return createHash("sha256").update(receiptBytes).digest("hex");
}

/** Build only from the coordinator's actual call ledger and persisted receipt bytes. */
export function createAdvisoryAttemptTrail({ receipt, receiptBytes, attempts } = {}) {
  return {
    schema: ADVISORY_ATTEMPT_TRAIL_SCHEMA,
    dispatchId: receipt?.dispatch?.dispatchId,
    receiptSha256: advisoryAttemptReceiptSha256(receiptBytes),
    attempts: structuredClone(attempts),
  };
}

/** Closed-shape readback; `requireNativeThenConsult` is the Claude fallback gate. */
export function validateAdvisoryAttemptTrail({ trail, receipt, receiptBytes, requireNativeThenConsult = false } = {}) {
  if (!exact(trail, ["schema", "dispatchId", "receiptSha256", "attempts"])
    || trail.schema !== ADVISORY_ATTEMPT_TRAIL_SCHEMA
    || !ID.test(trail.dispatchId ?? "") || trail.dispatchId !== receipt?.dispatch?.dispatchId
    || !SHA256.test(trail.receiptSha256 ?? "")
    || !Buffer.isBuffer(receiptBytes) || trail.receiptSha256 !== advisoryAttemptReceiptSha256(receiptBytes)
    || !Array.isArray(trail.attempts) || trail.attempts.length === 0 || trail.attempts.length > 8) {
    return failure("advisor-attempt-trail-binding");
  }
  for (const [index, attempt] of trail.attempts.entries()) {
    if (!exact(attempt, ["adapter", "kind", "runner", "status"])
      || !ADAPTER.test(attempt.adapter ?? "")
      || !["native", "consult"].includes(attempt.kind)
      || attempt.runner !== receipt.configuredRoute?.runner
      || !STATUSES.has(attempt.status)
      || (index < trail.attempts.length - 1 && attempt.status === "answered")) {
      return failure("advisor-attempt-trail-shape");
    }
  }
  const last = trail.attempts.at(-1);
  if (last.kind !== receipt.adapter || last.status !== receipt.observed?.status
    || (last.kind === "consult" && last.adapter !== "consult")
    || (last.kind === "native" && !last.adapter.startsWith("native-"))) {
    return failure("advisor-attempt-trail-result");
  }
  if (requireNativeThenConsult) {
    const earlier = trail.attempts.slice(0, -1);
    if (receipt.configuredRoute.runner !== "claude" || last.kind !== "consult"
      || earlier.length === 0
      || earlier.some((attempt) => attempt.kind !== "native" || !attempt.adapter.startsWith("native-") || !FAILURES.has(attempt.status))) {
      return failure("advisor-attempt-trail-fallback");
    }
    if (last.status === "answered"
      && receipt.fallback?.reason !== `native-${earlier.at(-1).status === "timed-out" ? "timeout" : earlier.at(-1).status}`) {
      return failure("advisor-attempt-trail-fallback-reason");
    }
  }
  return { ok: true, attempts: trail.attempts.length };
}
