// SPDX-License-Identifier: SUL-1.0
import { createHash, verify } from "node:crypto";

const SHA256 = /^[a-f0-9]{64}$/u;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value) => typeof value === "string" && value.trim() !== "";
const credentialPattern = /(?:-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b|\bBearer\s+[A-Za-z0-9._-]{12,})/u;

/** The core emits a digest-only request; signing remains an external key duty. */
export function createAttestationRequest(payload) {
  if (!text(payload)) return { ok: false, code: "PROVENANCE-ATTESTATION-INVALID" };
  return { ok: true, payloadSha256: createHash("sha256").update(payload).digest("hex") };
}

/** Verify a public-key signature without accepting a private key or policy decision. */
export function verifyAttestation(input) {
  if (!own(input, ["keyReference", "payload", "publicKey", "signatureBase64"]) || !text(input.keyReference) || !text(input.payload) || !text(input.publicKey) || !text(input.signatureBase64)) return { status: "unverified", code: "PROVENANCE-ATTESTATION-INVALID" };
  let signature;
  try { signature = Buffer.from(input.signatureBase64, "base64"); } catch { return { status: "unverified", code: "PROVENANCE-ATTESTATION-INVALID" }; }
  if (signature.length === 0) return { status: "unverified", code: "PROVENANCE-ATTESTATION-INVALID" };
  try {
    const valid = verify(null, Buffer.from(input.payload), input.publicKey, signature);
    return valid ? { status: "verified", code: "PROVENANCE-ATTESTATION-VERIFIED", signatureSha256: createHash("sha256").update(signature).digest("hex") } : { status: "unverified", code: "PROVENANCE-ATTESTATION-MISMATCH" };
  } catch { return { status: "unverified", code: "PROVENANCE-ATTESTATION-INVALID" }; }
}

/** Credential-shaped content is never admission evidence or exportable provenance text. */
export function evaluateCredentialHygiene(value) {
  const findings = [];
  const visit = (current, path) => {
    if (typeof current === "string" && credentialPattern.test(current)) findings.push(path);
    else if (Array.isArray(current)) current.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    else if (current !== null && typeof current === "object") Object.entries(current).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };
  visit(value, "$" );
  return findings.length === 0 ? { ok: true } : { ok: false, code: "PROVENANCE-CREDENTIAL-EXPOSURE", findings };
}

/** Only a digest is stable enough to expose in a public-safe signing request. */
export function validateSigningRequest(value) {
  return own(value, ["keyReference", "payloadSha256"]) && text(value.keyReference) && SHA256.test(value.payloadSha256) ? { valid: true } : { valid: false, code: "PROVENANCE-SIGNING-REQUEST-INVALID" };
}
