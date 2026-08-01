// SPDX-License-Identifier: SUL-1.0
const SHA = /^[a-f0-9]{64}$/u;
const own = (v, k) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === k.length && k.every((x) => Object.hasOwn(v, x));
/** Promotion requires immutable SBOM and security evidence bound to its subject. */
export function evaluateReleasePromotionBinding(input) {
  if (!own(input, ["subject", "evidence"]) || !own(input.subject, ["id", "sha256"]) || typeof input.subject.id !== "string" || !SHA.test(input.subject.sha256) || !own(input.evidence, ["sbomSha256", "securitySha256", "subjectSha256"]) || !SHA.test(input.evidence.sbomSha256) || !SHA.test(input.evidence.securitySha256) || !SHA.test(input.evidence.subjectSha256)) return { allowed: false, code: "RELEASE-BINDING-INVALID" };
  return input.evidence.subjectSha256 === input.subject.sha256 ? { allowed: true, code: "RELEASE-BINDING-ALLOWED" } : { allowed: false, code: "RELEASE-BINDING-SUBJECT-MISMATCH" };
}
