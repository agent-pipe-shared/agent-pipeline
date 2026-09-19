// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { inspectSessionOwnerRuntime, loadSessionDescriptor } from "./worktree-lifecycle.mjs";
import { createPoApprovalIntent, canonical } from "./po-approval-proof.mjs";
import { readCriticalHumanProofPolicy, readHumanApprovalMode, verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";

export const AGY_CONSENT_SCHEMA = "pipeline.agy-session-consent.v1";
const SHA = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");

export function consentSubject({ repository, session, provider = "google", model, roles, allowedPaths, scope, fallbackPolicy }) {
  return { schema: "pipeline.agy-session-consent-subject.v1", repository, session, provider, model, roles: [...roles].sort(), allowedPaths: [...allowedPaths].sort(), scope, fallbackPolicy };
}

export function loadLiveSession(root, sessionId, expectedDescriptorSha256) {
  const descriptor = loadSessionDescriptor(root, sessionId, { expectedDescriptorSha256 });
  const owner = inspectSessionOwnerRuntime(root, sessionId, { expectedDescriptorSha256: descriptor.descriptorSha256 });
  if (owner.status !== "live") return { ok: false, code: `AGY-SESSION-OWNER-${owner.status.toUpperCase()}` };
  return { ok: true, session: { id: descriptor.sessionId, descriptorSha256: descriptor.descriptorSha256, ownerStatus: owner.status }, descriptor };
}

export function buildSignatureIntent({ featureId, planSha256, specSha256, candidate, subjectSha256, policyRevision = "agy-session-v1", decision = "approved" }) {
  return createPoApprovalIntent({ kind: "agy-session", featureId, planSha256, specSha256, candidate, policyRevision, subjectSha256, decision });
}

export function validateConsentRecord(record, { root, session, nowEpochMs = Date.now(), policy = null } = {}) {
  if (!record || record.schema !== AGY_CONSENT_SCHEMA || !ID.test(record.decisionId ?? "") || record.status !== "approved"
    || !record.session || record.session.id !== session?.id || record.session.descriptorSha256 !== session?.descriptorSha256
    || record.provider !== "google" || typeof record.model !== "string" || !Array.isArray(record.roles) || !Array.isArray(record.allowedPaths)
    || !SHA.test(record.subjectSha256 ?? "") || !Number.isSafeInteger(record.expiresAtMs) || nowEpochMs >= record.expiresAtMs) return { ok: false, code: "AGY-CONSENT-INVALID" };
  const expectedSubject = digest(record.subject);
  if (expectedSubject !== record.subjectSha256) return { ok: false, code: "AGY-CONSENT-SUBJECT-MISMATCH" };
  if (record.mode === "chat") {
    if (record.attribution?.mode !== "chat-attributed-unattested" || typeof record.attribution.decisionReference !== "string" || record.attribution.decisionReference.trim() === "") return { ok: false, code: "AGY-CONSENT-CHAT-ATTRIBUTION" };
    return { ok: true, mode: "chat" };
  }
  if (record.mode !== "signature" || !record.intent || !record.proof) return { ok: false, code: "AGY-CONSENT-PROOF-MISSING" };
  const resolved = policy ?? readCriticalHumanProofPolicy(root);
  if (!resolved.ok) return { ok: false, code: "AGY-CONSENT-POLICY-UNAVAILABLE" };
  const anchors = resolved.trustAnchors ?? (resolved.trustAnchor ? [resolved.trustAnchor] : []);
  const verified = verifyAgainstTrustAnchors({ intent: record.intent, anchors, proof: record.proof });
  return verified.verified ? { ok: true, mode: "signature", proofSha256: verified.proofSha256 } : { ok: false, code: verified.code };
}

export function configuredConsentMode(root) { return readHumanApprovalMode(root); }
export { digest };
