// SPDX-License-Identifier: SUL-1.0
const SHA = /^[a-f0-9]{64}$/u;
const own = (v, k) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === k.length && k.every((x) => Object.hasOwn(v, x));
const subject = (value) => own(value, ["id", "sha256"]) && typeof value.id === "string" && value.id.trim() !== "" && SHA.test(value.sha256);
const evidence = (value) => own(value, ["sha256", "subject"]) && SHA.test(value.sha256) && subject(value.subject);
/** Promotion requires immutable SBOM and security evidence bound to its subject. */
export function evaluateReleasePromotionBinding(input) {
  if (!own(input, ["subject", "evidence"]) || !subject(input.subject) || !own(input.evidence, ["sbom", "security"]) || !evidence(input.evidence.sbom) || !evidence(input.evidence.security)) return { allowed: false, code: "RELEASE-BINDING-INVALID" };
  const matches = (reference) => reference.id === input.subject.id && reference.sha256 === input.subject.sha256;
  return matches(input.evidence.sbom.subject) && matches(input.evidence.security.subject) ? { allowed: true, code: "RELEASE-BINDING-ALLOWED" } : { allowed: false, code: "RELEASE-BINDING-SUBJECT-MISMATCH" };
}
