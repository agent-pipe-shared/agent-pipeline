// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inspectSessionOwnerRuntime, loadSessionDescriptor } from "./worktree-lifecycle.mjs";
import { createPoApprovalIntent, canonical } from "./po-approval-proof.mjs";
import { readCriticalHumanProofPolicy, readHumanApprovalMode, verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";

export const AGY_CONSENT_SCHEMA = "pipeline.agy-session-consent.v1";
const SHA = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");

export function consentSubject({ repository, session, provider = "google", model, roles, allowedPaths, scope, fallbackPolicy, expiresAtMs }) {
  return { schema: "pipeline.agy-session-consent-subject.v1", repository, session, provider, model, roles: [...roles].sort(), allowedPaths: [...allowedPaths].sort(), scope, fallbackPolicy, expiresAtMs };
}

export function consentStoragePath(root, sessionId) {
  const descriptor = loadSessionDescriptor(root, sessionId);
  return join(descriptor.repo.commonDir, "agent-pipeline", "run", "agy-session-consent", `${sessionId}.json`);
}

export function loadStoredConsent(root, sessionId, expectedDescriptorSha256) {
  const descriptor = loadSessionDescriptor(root, sessionId, { expectedDescriptorSha256 });
  const path = join(descriptor.repo.commonDir, "agent-pipeline", "run", "agy-session-consent", `${sessionId}.json`);
  if (!existsSync(path)) return { descriptor, record: null };
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("AGY-CONSENT-STORAGE-UNSAFE");
  try { return { descriptor, record: JSON.parse(readFileSync(path, "utf8")) }; } catch { throw new Error("AGY-CONSENT-STORAGE-MALFORMED"); }
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

export function validateConsentRecord(record, { root, repository, session, nowEpochMs = Date.now(), policy = null } = {}) {
  if (!record || record.schema !== AGY_CONSENT_SCHEMA || !ID.test(record.decisionId ?? "") || record.status !== "approved"
    || !record.session || record.session.id !== session?.id || record.session.descriptorSha256 !== session?.descriptorSha256
    || record.provider !== "google" || typeof record.model !== "string" || !Array.isArray(record.roles) || !Array.isArray(record.allowedPaths)
    || !SHA.test(record.subjectSha256 ?? "") || !Number.isSafeInteger(record.expiresAtMs) || nowEpochMs >= record.expiresAtMs) return { ok: false, code: "AGY-CONSENT-INVALID" };
  const expectedSubject = digest(record.subject);
  const subject = record.subject;
  if (expectedSubject !== record.subjectSha256 || digest(record.subject?.session) !== digest({ id: session?.id, descriptorSha256: session?.descriptorSha256 })
    || record.subject?.provider !== record.provider || record.subject?.model !== record.model
    || digest(subject?.repository) !== digest({ primaryRoot: repository?.primaryRoot, commonDir: repository?.commonDir })
    || !Array.isArray(subject?.roles) || !Array.isArray(subject?.allowedPaths)
    || subject.roles.some((role) => typeof role !== "string") || subject.allowedPaths.some((path) => typeof path !== "string")
    || subject.expiresAtMs !== record.expiresAtMs) return { ok: false, code: "AGY-CONSENT-SUBJECT-MISMATCH" };
  if (root) {
    const configured = readHumanApprovalMode(root);
    if (configured.mode !== record.mode) return { ok: false, code: "AGY-CONSENT-MODE-MISMATCH" };
  }
  if (record.mode === "chat") {
    if (record.attribution?.mode !== "chat-attributed-unattested" || typeof record.attribution.decisionReference !== "string" || record.attribution.decisionReference.trim() === "") return { ok: false, code: "AGY-CONSENT-CHAT-ATTRIBUTION" };
    return { ok: true, mode: "chat" };
  }
  if (record.mode !== "signature" || !record.intent || !record.proof) return { ok: false, code: "AGY-CONSENT-PROOF-MISSING" };
  if (record.intent.value?.kind !== "agy-session" || record.intent.value?.subjectSha256 !== record.subjectSha256) return { ok: false, code: "AGY-CONSENT-INTENT-MISMATCH" };
  const resolved = policy ?? readCriticalHumanProofPolicy(root);
  if (!resolved.ok) return { ok: false, code: "AGY-CONSENT-POLICY-UNAVAILABLE" };
  const anchors = resolved.trustAnchors ?? (resolved.trustAnchor ? [resolved.trustAnchor] : []);
  const verified = verifyAgainstTrustAnchors({ intent: record.intent, anchors, proof: record.proof });
  return verified.verified ? { ok: true, mode: "signature", proofSha256: verified.proofSha256 } : { ok: false, code: verified.code };
}

function scopeSubset(requested, permitted) {
  if (typeof requested === "string" || typeof requested === "number" || typeof requested === "boolean") return requested === permitted;
  if (Array.isArray(requested)) return Array.isArray(permitted) && requested.every((value) => permitted.some((candidate) => digest(candidate) === digest(value)));
  if (requested && typeof requested === "object" && permitted && typeof permitted === "object" && !Array.isArray(permitted)) {
    return Object.entries(requested).every(([key, value]) => Object.hasOwn(permitted, key) && scopeSubset(value, permitted[key]));
  }
  return false;
}

export function validateDispatchBinding(record, { requestedModel, role, scope, requiredPaths = [], nowEpochMs = Date.now() } = {}) {
  if (!record?.subject || record.expiresAtMs !== record.subject.expiresAtMs || nowEpochMs >= record.expiresAtMs) return { ok: false, code: "AGY-CONSENT-EXPIRED" };
  if (record.provider !== "google" || record.subject.provider !== "google" || record.model !== requestedModel || record.subject.model !== requestedModel) return { ok: false, code: "AGY-CONSENT-MODEL-MISMATCH" };
  if (!record.subject.roles.includes(role)) return { ok: false, code: "AGY-CONSENT-ROLE-MISMATCH" };
  if (!scopeSubset(scope, record.subject.scope)) return { ok: false, code: "AGY-CONSENT-SCOPE-MISMATCH" };
  if (!requiredPaths.every((path) => record.subject.allowedPaths.includes(path))) return { ok: false, code: "AGY-CONSENT-PATH-MISMATCH" };
  return { ok: true };
}

export function configuredConsentMode(root) { return readHumanApprovalMode(root); }
export { digest };
