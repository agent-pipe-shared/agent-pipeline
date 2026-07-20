// SPDX-License-Identifier: Apache-2.0

/**
 * Public, dependency-free contract for recovery-preview delivery attestation.
 * The callback receives only the public invocation binding; no preview payload,
 * private receipt, path, or runtime evidence is persisted by this module.
 */
export const RECOVERY_PREVIEW_SCHEMA = "pipeline.recovery-preview.v1";
export const RECOVERY_PREVIEW_ACK_SCHEMA = "pipeline.recovery-preview-ack.v1";

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function validInvocation(value) {
  return exactKeys(value, ["schema", "invocationId", "previewDigest"])
    && value.schema === RECOVERY_PREVIEW_SCHEMA
    && SAFE_ID.test(value.invocationId ?? "")
    && SHA256.test(value.previewDigest ?? "");
}

function invalid(code) {
  return { ok: false, code, delivered: false };
}

export function createRecoveryPreviewInvocation({ invocationId, previewDigest } = {}) {
  const invocation = { schema: RECOVERY_PREVIEW_SCHEMA, invocationId, previewDigest };
  return validInvocation(invocation) ? invocation : null;
}

export function attestRecoveryPreviewDelivery({ invocation, callback, usedAcknowledgementIds = [] } = {}) {
  if (!validInvocation(invocation)) return invalid("RP-INVOCATION-INVALID");
  if (typeof callback !== "function") return invalid("RP-CALLBACK-ABSENT");
  if (!Array.isArray(usedAcknowledgementIds)
    || usedAcknowledgementIds.some((value) => !SAFE_ID.test(value ?? ""))
    || new Set(usedAcknowledgementIds).size !== usedAcknowledgementIds.length) {
    return invalid("RP-USED-ACKS-INVALID");
  }

  let acknowledgement;
  try {
    acknowledgement = callback(structuredClone(invocation));
  } catch {
    return invalid("RP-CALLBACK-THREW");
  }
  if (acknowledgement && typeof acknowledgement.then === "function") return invalid("RP-CALLBACK-ASYNC");
  if (!exactKeys(acknowledgement, ["schema", "invocationId", "previewDigest", "acknowledgementId", "delivery"])) {
    return invalid("RP-ACK-MALFORMED");
  }
  if (acknowledgement.schema !== RECOVERY_PREVIEW_ACK_SCHEMA
    || acknowledgement.delivery !== "delivered"
    || !SAFE_ID.test(acknowledgement.acknowledgementId ?? "")) {
    return invalid("RP-ACK-MALFORMED");
  }
  if (acknowledgement.invocationId !== invocation.invocationId) return invalid("RP-INVOCATION-MISMATCH");
  if (acknowledgement.previewDigest !== invocation.previewDigest) return invalid("RP-DIGEST-MISMATCH");
  if (usedAcknowledgementIds.includes(acknowledgement.acknowledgementId)) return invalid("RP-ACK-REPLAY");

  return {
    ok: true,
    code: "RP-DELIVERY-ATTESTED",
    delivered: true,
    acknowledgement,
    usedAcknowledgementIds: [...usedAcknowledgementIds, acknowledgement.acknowledgementId],
  };
}
