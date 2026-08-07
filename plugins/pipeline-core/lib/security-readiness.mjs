// SPDX-License-Identifier: SUL-1.0
/** Product-security readiness is a typed release contract, never a template claim. */
import { securityAuthorityScopeSha256, verifySecurityAuthority } from "./security-authority-proof.mjs";
export const SECURITY_READINESS_SCHEMA = "pipeline.security-readiness.v1";
export const READINESS_ARTIFACTS = Object.freeze({
  "public-package": ["public-disclosure", "support-policy", "response-process", "incident-runbook", "release-evidence"],
  "internal-service": ["restricted-response", "support-policy", "incident-runbook", "release-evidence"],
  "documentation-only": [],
});
const SHA256 = /^[0-9a-f]{64}$/u;
const validDigest = (value) => typeof value === "string" && SHA256.test(value);
const required = (value) => typeof value === "string" && value.length > 0;

function verifiedAuthority({ authority, authorityContext, action, candidateSha256, policySha256, scope } = {}) {
  if (!authorityContext || typeof authorityContext !== "object") return false;
  return verifySecurityAuthority({
    ...authorityContext,
    authority,
    featureId: "cyb-9",
    action,
    candidateSha256,
    policySha256,
    scopeSha256: securityAuthorityScopeSha256(scope),
  }).verified;
}

/** Unknown product type is incomplete, never an unrecorded exemption. */
export function evaluateReadinessApplicability({ productType, notApplicableReceipt, authorityContext, candidateSha256, policySha256 } = {}) {
  if (!Object.hasOwn(READINESS_ARTIFACTS, productType)) return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, status: "incomplete", code: "READINESS-PRODUCT-CLASS-UNKNOWN", requiredArtifacts: [] });
  if (productType === "documentation-only" && (!validDigest(candidateSha256) || !validDigest(policySha256) || !verifiedAuthority({ authority: notApplicableReceipt, authorityContext, action: "declare-not-applicable", candidateSha256, policySha256, scope: { productType } }))) return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, status: "incomplete", code: "READINESS-NOT-APPLICABLE-UNAUTHORIZED", requiredArtifacts: [] });
  return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, status: productType === "documentation-only" ? "not-applicable" : "required", code: productType === "documentation-only" ? "READINESS-NOT-APPLICABLE" : "READINESS-ARTIFACTS-REQUIRED", requiredArtifacts: READINESS_ARTIFACTS[productType] });
}

/** Public disclosure, restricted response and findings have intentionally separate schemas. */
export function validateReadinessArtifact(artifact = {}) {
  const requiredFields = {
    "public-disclosure": ["contact", "supportedVersions"],
    "restricted-response": ["intakeChannel", "sla", "owner"],
    "canonical-finding": ["findingId", "candidateSha256"],
  };
  const fields = requiredFields[artifact.type];
  const valid = fields && fields.every((field) => required(artifact[field]));
  return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, valid: Boolean(valid), code: valid ? "READINESS-ARTIFACT-VALID" : "READINESS-ARTIFACT-INVALID" });
}

/** Support policy is authoritative only when its release is in a versioned window. */
export function validateSupportWindow({ policy, release } = {}) {
  if (!policy || !required(policy.version) || !Array.isArray(policy.supportedVersions) || !required(release?.version)) return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, valid: false, code: "SUPPORT-POLICY-INVALID" });
  return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, valid: policy.supportedVersions.includes(release.version), code: policy.supportedVersions.includes(release.version) ? "SUPPORT-WINDOW-CURRENT" : "SUPPORT-WINDOW-EOL" });
}

/** Named authority and evidence are required at every response stage. */
export function validateResponseTrace(stages = []) {
  const requiredStages = ["intake", "triage", "ownership", "remediation", "disclosure", "closure"];
  const missing = requiredStages.filter((stage) => !stages.some((entry) => entry.stage === stage && required(entry.authority) && validDigest(entry.evidenceSha256)));
  return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, valid: missing.length === 0, missing, code: missing.length ? "RESPONSE-TRACE-INCOMPLETE" : "RESPONSE-TRACE-COMPLETE" });
}

/** Runbooks must name real release/deployment capabilities, not prose-only steps. */
export function validateIncidentRunbook({ steps = [], capabilities = [] } = {}) {
  const missing = steps.filter((step) => !capabilities.includes(step.capability)).map((step) => step.capability);
  return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, valid: missing.length === 0, missing, code: missing.length ? "RUNBOOK-CAPABILITY-MISSING" : "RUNBOOK-CAPABILITIES-BOUND" });
}

/** Agents cannot publish, accept risk, close incidents, or authorize production change. */
export function authorizeSecurityAction({ action, authority, authorityContext, candidateSha256, policySha256 } = {}) {
  const protectedAction = ["publish-advisory", "accept-risk", "close-incident", "authorize-production-change"].includes(action);
  const allowed = !protectedAction || (validDigest(candidateSha256) && validDigest(policySha256) && verifiedAuthority({ authority, authorityContext, action, candidateSha256, policySha256, scope: { action } }));
  return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, allowed, code: allowed ? "READINESS-ACTION-AUTHORIZED" : "READINESS-ACTION-HUMAN-OR-POLICY-REQUIRED" });
}

/** Exact build, SBOM, provenance and verified finding closure are all release evidence. */
export function validateSecurityReleaseEvidence({ artifactSha256, sbomSha256, provenanceSha256, verifiedFindingIds = [], candidateSha256 } = {}) {
  const valid = [artifactSha256, sbomSha256, provenanceSha256, candidateSha256].every(validDigest) && Array.isArray(verifiedFindingIds);
  return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, valid, code: valid ? "SECURITY-RELEASE-EVIDENCE-BOUND" : "SECURITY-RELEASE-EVIDENCE-INCOMPLETE" });
}

/** A public artifact must not contain restricted details, secrets, or private endpoints. */
export function validatePublicArtifactRedaction(artifact = {}) {
  const forbidden = Object.keys(artifact).filter((key) => /secret|token|credential|private|internal|endpoint|exploit/iu.test(key));
  return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, valid: forbidden.length === 0, forbidden, code: forbidden.length ? "PUBLIC-ARTIFACT-REDACTION-FAILED" : "PUBLIC-ARTIFACT-REDACTION-PASSED" });
}

export function validateReadinessFreshness({ contact, channel, presentArtifacts = [], requiredArtifacts = [], at } = {}) {
  if (!contact || !required(contact.address) || !required(contact.expiresAt) || contact.expiresAt <= at) return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, valid: false, code: "READINESS-CONTACT-STALE" });
  if (!channel || !["security-file", "private-tracker", "email"].includes(channel)) return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, valid: false, code: "READINESS-CHANNEL-UNSUPPORTED" });
  const missing = requiredArtifacts.filter((artifact) => !presentArtifacts.includes(artifact));
  return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, valid: missing.length === 0, missing, code: missing.length ? "READINESS-ARTIFACT-MISSING" : "READINESS-CURRENT" });
}

/** Consumers get a read-only projection and cannot become the system of record. */
export function projectReadinessForConsumer(canonical, consumerPatch = {}) {
  return Object.freeze({ schema: SECURITY_READINESS_SCHEMA, projection: Object.freeze({ candidateSha256: canonical.candidateSha256, status: canonical.status }), canonicalUnchanged: true, rejectedAuthorityFields: Object.keys(consumerPatch).filter((key) => key !== "displayUrl") });
}
