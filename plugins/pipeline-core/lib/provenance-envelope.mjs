// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { verifyAttestation } from "./provenance-attestation.mjs";

export const PROVENANCE_ENVELOPE_SCHEMA = "pipeline.provenance-envelope.v1";
export const REPRODUCIBILITY_STATES = Object.freeze(["not-assessed", "non-reproducible-expected", "repeatable-in-same-builder", "reproducible-in-independent-builder", "hermetic-evidence-available", "mismatch", "unverifiable"]);
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const safeText = (value) => typeof value === "string" && value.trim() !== "";
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value) => SHA256.test(value ?? "");
const candidate = (value) => own(value, ["commit", "tree"]) && OID.test(value.commit) && OID.test(value.tree);
const subject = (value) => own(value, ["id", "sha256"]) && safeText(value.id) && digest(value.sha256);
const material = (value) => own(value, ["id", "kind", "sha256"]) && safeText(value.id) && safeText(value.kind) && digest(value.sha256);
const attestationPolicy = (value) => own(value, ["keyReference", "publicKeySha256"]) && safeText(value.keyReference) && digest(value.publicKeySha256);

/** Canonical claims signed by the external key; status and assurance are never claims. */
export function createProvenanceAttestationPayload(envelope) {
  if (!validateProvenanceEnvelope(envelope).valid) return null;
  return JSON.stringify({
    schema: "pipeline.provenance-attestation-payload.v1",
    candidate: { commit: envelope.candidate.commit, tree: envelope.candidate.tree },
    subject: { id: envelope.subject.id, sha256: envelope.subject.sha256 },
    materials: envelope.materials.map(({ id, kind, sha256 }) => ({ id, kind, sha256 })),
    builder: { id: envelope.builder.id, digest: envelope.builder.digest },
    invocation: { id: envelope.invocation.id, parametersSha256: envelope.invocation.parametersSha256 },
    environment: { kind: envelope.environment.kind, identitySha256: envelope.environment.identitySha256 },
    reproducibility: envelope.reproducibility,
  });
}

/** A closed provenance envelope binds every artifact to one candidate and build. */
export function validateProvenanceEnvelope(value) {
  if (!own(value, ["schema", "candidate", "subject", "materials", "builder", "invocation", "environment", "assurance", "attestation", "reproducibility"]) || value.schema !== PROVENANCE_ENVELOPE_SCHEMA || !candidate(value.candidate) || !subject(value.subject) || !Array.isArray(value.materials) || !value.materials.every(material) || new Set(value.materials.map((entry) => `${entry.kind}\0${entry.id}`)).size !== value.materials.length || !own(value.builder, ["digest", "id"]) || !safeText(value.builder.id) || !digest(value.builder.digest) || !own(value.invocation, ["id", "parametersSha256"]) || !safeText(value.invocation.id) || !digest(value.invocation.parametersSha256) || !own(value.environment, ["identitySha256", "kind"]) || !safeText(value.environment.kind) || !digest(value.environment.identitySha256) || !["unverified", "verified"].includes(value.assurance) || !own(value.attestation, ["keyReference", "signatureSha256", "status"]) || !safeText(value.attestation.keyReference) || !digest(value.attestation.signatureSha256) || !["verified", "unverified", "revoked", "expired"].includes(value.attestation.status) || !REPRODUCIBILITY_STATES.includes(value.reproducibility)) return { valid: false, code: "PROVENANCE-INVALID" };
  return { valid: true };
}

/** Stable identities are derived from canonical subject bytes, never mutable tags. */
export function createArtifactIdentity(kind, bytes) {
  if (!safeText(kind) || !safeText(bytes)) return { ok: false, code: "PROVENANCE-SUBJECT-INVALID" };
  return { ok: true, id: `${kind}-${createHash("sha256").update(`${kind}\n${bytes}`).digest("hex").slice(0, 20)}` };
}

/** Produce, promotion and readback share one candidate/subject admission boundary. */
export function evaluateProvenanceAdmission(input) {
  if (!own(input, ["boundary", "envelope", "expected", "attestation"]) || !["produce", "promote", "readback"].includes(input.boundary) || !own(input.expected, ["attestation", "builderDigest", "candidate", "materials", "subject"]) || !candidate(input.expected.candidate) || !subject(input.expected.subject) || !digest(input.expected.builderDigest) || !Array.isArray(input.expected.materials) || !input.expected.materials.every(material) || !attestationPolicy(input.expected.attestation)) return { allowed: false, code: "PROVENANCE-ADMISSION-INVALID" };
  const checked = validateProvenanceEnvelope(input.envelope);
  if (!checked.valid) return { allowed: false, code: checked.code };
  if (JSON.stringify(input.envelope.candidate) !== JSON.stringify(input.expected.candidate)) return { allowed: false, code: "PROVENANCE-CANDIDATE-MISMATCH" };
  if (JSON.stringify(input.envelope.subject) !== JSON.stringify(input.expected.subject)) return { allowed: false, code: "PROVENANCE-SUBJECT-MISMATCH" };
  if (JSON.stringify(input.envelope.materials) !== JSON.stringify(input.expected.materials)) return { allowed: false, code: "PROVENANCE-MATERIAL-MISMATCH" };
  if (input.envelope.builder.digest !== input.expected.builderDigest) return { allowed: false, code: "PROVENANCE-BUILDER-MISMATCH" };
  if (input.envelope.assurance !== "verified" || input.envelope.attestation.status !== "verified") return { allowed: false, code: "PROVENANCE-UNVERIFIED" };
  const verification = verifyAttestation(input.attestation);
  if (verification.status !== "verified") return { allowed: false, code: "PROVENANCE-ATTESTATION-UNVERIFIED" };
  if (input.attestation.keyReference !== input.envelope.attestation.keyReference || input.attestation.keyReference !== input.expected.attestation.keyReference || createHash("sha256").update(input.attestation.publicKey).digest("hex") !== input.expected.attestation.publicKeySha256) return { allowed: false, code: "PROVENANCE-ATTESTATION-TRUST-MISMATCH" };
  if (verification.signatureSha256 !== input.envelope.attestation.signatureSha256) return { allowed: false, code: "PROVENANCE-ATTESTATION-SIGNATURE-MISMATCH" };
  if (input.attestation.payload !== createProvenanceAttestationPayload(input.envelope)) return { allowed: false, code: "PROVENANCE-ATTESTATION-PAYLOAD-MISMATCH" };
  return { allowed: true, code: "PROVENANCE-ADMISSION-ALLOWED" };
}

/** Policy treats mutable actions, images and toolchains as explicit admission failures. */
export function evaluatePinningPolicy(references) {
  if (!Array.isArray(references) || !references.every((entry) => own(entry, ["kind", "value"]) && safeText(entry.kind) && safeText(entry.value))) return { ok: false, code: "PROVENANCE-PINNING-INVALID" };
  const unpinned = references.filter(({ value }) => !/@[a-f0-9]{40}$/u.test(value) && !/@sha256:[a-f0-9]{64}$/u.test(value)).map(({ value }) => value);
  return unpinned.length === 0 ? { ok: true } : { ok: false, code: "PROVENANCE-UNPINNED", unpinned };
}

/** Historical bindings append only; a correction must create a new envelope. */
export function evaluateProvenanceAppend(input) {
  if (!own(input, ["existing", "next"]) || !Array.isArray(input.existing) || !input.existing.every((entry) => validateProvenanceEnvelope(entry).valid) || !validateProvenanceEnvelope(input.next).valid) return { allowed: false, code: "PROVENANCE-APPEND-INVALID" };
  const existingSubject = input.existing.find((entry) => entry.subject.id === input.next.subject.id);
  if (!existingSubject) return { allowed: true, code: "PROVENANCE-APPEND-ALLOWED" };
  return existingSubject.subject.sha256 === input.next.subject.sha256 ? { allowed: false, code: "PROVENANCE-HISTORICAL-IMMUTABLE" } : { allowed: false, code: "PROVENANCE-SUBJECT-REUSE" };
}
