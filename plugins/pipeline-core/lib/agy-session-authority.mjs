// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, isAbsolute, win32 } from "node:path";
import { inspectSessionOwnerRuntime, loadSessionDescriptor } from "./worktree-lifecycle.mjs";
import { createPoApprovalIntent, canonical } from "./po-approval-proof.mjs";
import { readCriticalHumanProofPolicy, readHumanApprovalMode, verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";
import { verifyModelFamilyAuthority } from "./model-family-authority.mjs";
import { validateInvocationReadback } from "./model-family-execution.mjs";

export const AGY_CONSENT_SCHEMA = "pipeline.agy-session-consent.v1";
const SHA = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");

export function consentSubject({ repository, session, provider = "google", model, roles, allowedPaths, scope, fallbackPolicy, expiresAtMs, decisionNonce }) {
  return { schema: "pipeline.agy-session-consent-subject.v1", repository, session, provider, model, roles: [...roles].sort(), allowedPaths: [...allowedPaths].sort(), scope, fallbackPolicy, expiresAtMs, decisionNonce };
}

export function consentStoragePath(root, sessionId) {
  const descriptor = loadSessionDescriptor(root, sessionId);
  return join(descriptor.repo.commonDir, "agent-pipeline", "run", "agy-session-consent", `${sessionId}.json`);
}

export function loadStoredConsent(root, sessionId, expectedDescriptorSha256) {
  const descriptor = loadSessionDescriptor(root, sessionId, { expectedDescriptorSha256 });
  const path = join(descriptor.repo.commonDir, "agent-pipeline", "run", "agy-session-consent", `${sessionId}.json`);
  const tombstone = `${path}.revoked`;
  if (existsSync(tombstone)) { const historyStat = lstatSync(tombstone); if (!historyStat.isFile() || historyStat.isSymbolicLink()) throw new Error("AGY-CONSENT-STORAGE-UNSAFE"); let history; try { history = JSON.parse(readFileSync(tombstone, "utf8")); } catch { throw new Error("AGY-CONSENT-STORAGE-MALFORMED"); } if (!Array.isArray(history)) throw new Error("AGY-CONSENT-STORAGE-MALFORMED"); if (existsSync(path)) { const current = JSON.parse(readFileSync(path, "utf8")); if (history.some((entry) => entry?.decisionId === current?.decisionId || entry?.subjectSha256 === current?.subjectSha256)) return { descriptor, record: null, revoked: true }; } }
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

export function validateConsentRecord(record, options = {}) {
  if (record?.schema === AGY_FAMILY_CONSENT_SCHEMA) return validateFamilyConsentRecord(record, options);
  const { root, repository, session, nowEpochMs = Date.now(), policy = null } = options;
  if (!record || record.schema !== AGY_CONSENT_SCHEMA || !ID.test(record.decisionId ?? "") || record.status !== "approved"
    || !record.session || record.session.id !== session?.id || record.session.descriptorSha256 !== session?.descriptorSha256
    || record.provider !== "google" || typeof record.model !== "string" || !Array.isArray(record.roles) || !Array.isArray(record.allowedPaths) || typeof record.subject?.decisionNonce !== "string" || record.subject.decisionNonce.length < 16 || record.decisionId !== record.subject.decisionNonce
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

export const AGY_FAMILY_SUBJECT_SCHEMA = "pipeline.agy-session-consent-subject.v2";
export const AGY_FAMILY_CONSENT_SCHEMA = "pipeline.agy-session-consent.v2";
export const AGY_FAMILY_BINDING_SCHEMA = "pipeline.agy-session-consent-binding.v2";
const SUBJECT_KEYS = ["schema", "repository", "session", "runner", "provider", "familyAuthoritySha256", "assignments", "roles", "allowedPaths", "scope", "fallbackPolicy", "expiresAtMs", "decisionNonce"];
const RECORD_KEYS = ["schema", "status", "decisionId", "mode", "session", "runner", "provider", "familyAuthoritySha256", "assignments", "roles", "allowedPaths", "subject", "subjectSha256", "intent", "proof", "attribution", "approvedAtMs", "expiresAtMs"];
const ASSIGNMENT_KEYS = ["taskRoute", "role", "effort", "familyId", "adapterContractSha256", "assignmentSha256"];
// Native consent permissions select a closed task route, while signed family
// assignments retain their normalized functional role. Callers cannot choose
// another task merely because it uses the same model family.
const IMPLEMENTATION_ROUTES = Object.freeze({
  "pipeline-core:goldfish-implementor": Object.freeze({ taskRoute: "duty.implement", role: "worker" }),
  "pipeline-core:goldfish-mechanic": Object.freeze({ taskRoute: "duty.mechanic", role: "efficient" }),
});
const implementationRoute = role => Object.hasOwn(IMPLEMENTATION_ROUTES, role) ? IMPLEMENTATION_ROUTES[role] : null;
const implementsRole = (assignment, role) => {
  const route = implementationRoute(role);
  return route !== null && assignment?.taskRoute === route.taskRoute && assignment?.role === route.role;
};
const exact = (v, keys) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join("\0") === [...keys].sort().join("\0");
const sortedUnique = (v, valid) => Array.isArray(v) && v.length > 0 && v.length <= 256 && v.every(valid) && v.every((x, i) => i === 0 || v[i - 1] < x);
const safePath = p => typeof p === "string" && p.length > 0 && p.length <= 1024 && !/^[\\/]|^[A-Za-z]:|[\\\x00-\x1f]/u.test(p) && p.split("/").every(x => x && x !== "." && x !== "..");
const restriction = v => {
  if (typeof v === "string") return v.length > 0 && v.length <= 1024;
  if (typeof v === "boolean" || Number.isSafeInteger(v)) return true;
  if (Array.isArray(v)) return v.length > 0 && v.length <= 256 && v.every(restriction);
  return v !== null && typeof v === "object" && Object.keys(v).length > 0 && Object.entries(v).every(([k, x]) => !["__proto__", "prototype", "constructor"].includes(k) && restriction(x));
};
const failConsent = code => ({ ok: false, code });
const frozenCopy = value => { const copy = structuredClone(value); const lock = v => { if (v && typeof v === "object") { Object.values(v).forEach(lock); Object.freeze(v); } }; lock(copy); return copy; };
const familyAuthorityPorts = new WeakMap();

/** Source-owned dispatch port. A method-shaped object, copied handle or public
 * projection cannot supply the private complete-record admission. */
export async function recheckAgyFamilyConsentBinding({ authority, handle, root, sessionId, candidate, consent, ...request } = {}) {
  const port = familyAuthorityPorts.get(authority);
  if (!port) return failConsent("AGY-CONSENT-HOST-INVALID");
  return port({ handle, root, sessionId, candidate, consent, request });
}

export function familyConsentAssignment(assignment) {
  return { taskRoute: assignment.taskRoute, role: assignment.role, effort: assignment.effort, familyId: assignment.familyId, adapterContractSha256: assignment.adapterContractSha256, assignmentSha256: digest(assignment) };
}

// The input port supplies source/proof bytes, never an `admitted:true` projection.
// Verification occurs here on every complete-record admission/preparation.
export function validateFamilyConsentSubject(subject, { repository, session, familyAuthorityInputs, nowEpochMs = Date.now() } = {}) {
  try {
    if (!exact(subject, SUBJECT_KEYS) || subject.schema !== AGY_FAMILY_SUBJECT_SCHEMA || subject.runner !== "antigravity" || subject.provider !== "google"
      || !exact(subject.repository, ["primaryRoot", "commonDir"]) || !Object.values(subject.repository).every(v => typeof v === "string" && (isAbsolute(v) || win32.isAbsolute(v)))
      || !exact(subject.session, ["id", "descriptorSha256"]) || !ID.test(subject.session.id) || !SHA.test(subject.session.descriptorSha256)
      || !SHA.test(subject.familyAuthoritySha256) || !ID.test(subject.decisionNonce) || subject.decisionNonce.length < 16
      || !Number.isSafeInteger(subject.expiresAtMs) || nowEpochMs >= subject.expiresAtMs
      || !sortedUnique(subject.roles, x => typeof x === "string" && implementationRoute(x) !== null) || !sortedUnique(subject.allowedPaths, safePath)
      || !restriction(subject.scope) || !restriction(subject.fallbackPolicy) || !Array.isArray(subject.assignments) || !subject.assignments.length || subject.assignments.length > 256) return failConsent("AGY-FAMILY-CONSENT-SUBJECT-INVALID");
    if (digest(subject.repository) !== digest({ primaryRoot: repository?.primaryRoot, commonDir: repository?.commonDir }) || digest(subject.session) !== digest({ id: session?.id, descriptorSha256: session?.descriptorSha256 })) return failConsent("AGY-CONSENT-SUBJECT-MISMATCH");
    const verified = verifyModelFamilyAuthority(familyAuthorityInputs);
    if (!verified.ok || verified.value.authoritySha256 !== subject.familyAuthoritySha256) return failConsent("AGY-FAMILY-CONSENT-AUTHORITY");
    let previous = "";
    if (subject.roles.some(role => !subject.assignments.some(a => implementsRole(a, role)))) return failConsent("AGY-FAMILY-CONSENT-ASSIGNMENT");
    for (const assignment of subject.assignments) {
      if (!exact(assignment, ASSIGNMENT_KEYS)) return failConsent("AGY-FAMILY-CONSENT-ASSIGNMENT");
      const key = canonical(assignment);
      if (previous && previous >= key || !subject.roles.some(role => implementsRole(assignment, role))
        || !verified.value.assignments.some(a => a.runner === "antigravity" && canonical(familyConsentAssignment(a)) === key)) return failConsent("AGY-FAMILY-CONSENT-ASSIGNMENT");
      previous = key;
    }
    return { ok: true, authority: verified.value };
  } catch { return failConsent("AGY-FAMILY-CONSENT-SUBJECT-INVALID"); }
}

function validateFamilyConsentRecord(record, options) {
  try {
    if (!exact(record, RECORD_KEYS) || record.status !== "approved" || !Number.isSafeInteger(record.approvedAtMs) || record.approvedAtMs < 0 || record.approvedAtMs > (options.nowEpochMs ?? Date.now()) || record.approvedAtMs >= record.expiresAtMs) return failConsent("AGY-CONSENT-INVALID");
    const subjectCheck = validateFamilyConsentSubject(record.subject, options); if (!subjectCheck.ok) return subjectCheck;
    if (record.decisionId !== record.subject.decisionNonce || record.subjectSha256 !== digest(record.subject)
      || ["session", "runner", "provider", "familyAuthoritySha256", "assignments", "roles", "allowedPaths", "expiresAtMs"].some(k => canonical(record[k]) !== canonical(record.subject[k]))) return failConsent("AGY-CONSENT-SUBJECT-MISMATCH");
    const mode = options.root ? configuredConsentMode(options.root).mode : options.configuredMode;
    if (mode !== record.mode) return failConsent("AGY-CONSENT-MODE-MISMATCH");
    if (record.mode === "chat") {
      if (record.intent !== null || record.proof !== null || !exact(record.attribution, ["mode", "decisionReference"]) || record.attribution.mode !== "chat-attributed-unattested" || typeof record.attribution.decisionReference !== "string" || !record.attribution.decisionReference.trim()) return failConsent("AGY-CONSENT-CHAT-ATTRIBUTION");
      return { ok: true, mode: "chat" };
    }
    if (record.mode !== "signature" || record.attribution !== null || !exact(record.intent, ["value", "sha256"])
      || !exact(record.intent.value, ["schema", "kind", "featureId", "planSha256", "specSha256", "candidate", "policyRevision", "subjectSha256", "decision"])
      || !exact(record.intent.value.candidate, ["commit", "tree"]) || record.intent.value.kind !== "agy-session" || record.intent.value.policyRevision !== "agy-session-family-v2" || record.intent.value.subjectSha256 !== record.subjectSha256 || record.intent.value.decision !== "approved") return failConsent("AGY-CONSENT-INTENT-MISMATCH");
    const resolved = options.policy ?? readCriticalHumanProofPolicy(options.root);
    if (!resolved.ok) return failConsent("AGY-CONSENT-POLICY-UNAVAILABLE");
    const verified = verifyAgainstTrustAnchors({ intent: record.intent, anchors: resolved.trustAnchors ?? (resolved.trustAnchor ? [resolved.trustAnchor] : []), proof: record.proof });
    return verified.verified ? { ok: true, mode: "signature", proofSha256: verified.proofSha256 } : failConsent(verified.code);
  } catch { return failConsent("AGY-CONSENT-INVALID"); }
}

/** Host-owned readers must resolve current family input, live owner, private
 * consent storage and original sealed invocation. No JSON handle is authority. */
export function createAgyFamilyConsentAuthority({ readFamilyAuthority, readInvocation, readStored = loadStoredConsent, readLive = loadLiveSession, readMode = configuredConsentMode, readPolicy = readCriticalHumanProofPolicy } = {}) {
  if (typeof readFamilyAuthority !== "function" || typeof readInvocation !== "function") throw new TypeError("Host family authority and sealed invocation readers required");
  const admitted = new WeakMap();
  const boundInvocations = new WeakMap();
  async function current(context, expectedHash = null) {
    const { root, sessionId, descriptorSha256, nowEpochMs = Date.now() } = context;
    const live = await readLive(root, sessionId, descriptorSha256); if (!live?.ok) return failConsent(live?.code ?? "AGY-SESSION-OWNER-UNAVAILABLE");
    if (live.session?.id !== sessionId || live.session?.descriptorSha256 !== descriptorSha256) return failConsent("AGY-CONSENT-SESSION-MISMATCH");
    const stored = await readStored(root, sessionId, descriptorSha256); if (stored?.revoked || !stored?.record) return failConsent("AGY-CONSENT-REVOKED-OR-MISSING");
    const record = stored.record;
    if (record.schema !== AGY_FAMILY_CONSENT_SCHEMA) return failConsent("AGY-CONSENT-V2-REQUIRED");
    if (expectedHash !== null && digest(record) !== expectedHash) return failConsent("AGY-CONSENT-RECORD-CHANGED");
    const repository = live.descriptor?.repo ?? stored.descriptor?.repo;
    const result = validateConsentRecord(record, { repository, session: live.session, nowEpochMs, configuredMode: (await readMode(root)).mode, policy: await readPolicy(root), familyAuthorityInputs: await readFamilyAuthority({ root }) });
    return result.ok ? { ok: true, record: frozenCopy(record) } : result;
  }
  const authority = Object.freeze({
    async admit(context) {
      try { const checked = await current(context); if (!checked.ok) return checked; const handle = Object.freeze({}); admitted.set(handle, { context: frozenCopy(context), record: checked.record, hash: digest(checked.record) }); return { ok: true, handle, consentRecordSha256: digest(checked.record) }; }
      catch { return failConsent("AGY-CONSENT-ADMISSION-UNAVAILABLE"); }
    },
    async bind(handle, { invocationId, requestedModel, requestedEffort, role, scope, requiredPaths = [], fallbackPolicy, nowEpochMs = Date.now() } = {}) {
      try {
        const admittedRecord = admitted.get(handle); if (!admittedRecord) return failConsent("AGY-CONSENT-HANDLE-INVALID");
        const currentRecord = await current({ ...admittedRecord.context, nowEpochMs }, admittedRecord.hash); if (!currentRecord.ok) return currentRecord;
        const readback = await readInvocation({ root: admittedRecord.context.root, sessionId: admittedRecord.context.sessionId, invocationId });
        const checked = validateInvocationReadback(readback?.ok === true ? readback.value : readback); if (!checked.ok) return failConsent(checked.code);
        const i = checked.value.invocation, r = admittedRecord.record, s = r.subject;
        if (i.invocationId !== invocationId || i.sessionId !== s.session.id || i.runner !== "antigravity" || i.authoritySha256 !== s.familyAuthoritySha256 || Date.parse(i.expiresAt) <= nowEpochMs) return failConsent("AGY-CONSENT-INVOCATION-MISMATCH");
        const a = s.assignments.find(a => ["taskRoute", "role", "effort", "familyId", "adapterContractSha256"].every(k => a[k] === i[k]));
        if (!a || !implementsRole(a, role) || !s.roles.includes(role)) return failConsent("AGY-CONSENT-ASSIGNMENT-MISMATCH");
        if (requestedModel !== i.selectedModelId || requestedEffort !== i.effort) return failConsent("AGY-CONSENT-LAUNCH-MISMATCH");
        if (!Array.isArray(requiredPaths) || !requiredPaths.every(p => safePath(p) && s.allowedPaths.includes(p))) return failConsent("AGY-CONSENT-PATH-MISMATCH");
        if (!familyRestrictionSubset(scope, s.scope)) return failConsent("AGY-CONSENT-SCOPE-MISMATCH");
        if (!familyRestrictionSubset(fallbackPolicy, s.fallbackPolicy)) return failConsent("AGY-CONSENT-FALLBACK-MISMATCH");
        const projection = frozenCopy({ schema: AGY_FAMILY_BINDING_SCHEMA, status: "approved", decisionId: r.decisionId, sessionId: s.session.id, descriptorSha256: s.session.descriptorSha256, runner: s.runner, provider: s.provider, familyAuthoritySha256: s.familyAuthoritySha256, assignmentSha256: a.assignmentSha256, role, allowedPaths: s.allowedPaths, scope: s.scope, fallbackPolicy: s.fallbackPolicy, subjectSha256: r.subjectSha256, consentRecordSha256: admittedRecord.hash, approvedAtMs: r.approvedAtMs, expiresAtMs: r.expiresAtMs });
        boundInvocations.set(projection, frozenCopy(i));
        return { ok: true, handle, projection };
      } catch { return failConsent("AGY-CONSENT-BINDING-UNAVAILABLE"); }
    },
  });
  familyAuthorityPorts.set(authority, async ({ handle, root, sessionId, candidate, consent, request }) => {
    try {
      const admission = admitted.get(handle);
      if (!admission || root !== admission.context.root || sessionId !== admission.context.sessionId) return failConsent("AGY-CONSENT-DISPATCH-CONTEXT");
      const bound = await authority.bind(handle, request); if (!bound.ok) return bound;
      const invocation = boundInvocations.get(bound.projection);
      if (candidate?.commit !== invocation.candidateCommit || candidate?.tree !== invocation.candidateTree) return failConsent("AGY-CONSENT-CANDIDATE-MISMATCH");
      if (canonical(consent) !== canonical(bound.projection)) return failConsent("AGY-CONSENT-BINDING-MISMATCH");
      return { ok: true, projection: bound.projection, invocation };
    } catch { return failConsent("AGY-CONSENT-DISPATCH-UNAVAILABLE"); }
  });
  return authority;
}

function familyRestrictionSubset(requested, permitted) {
  if (permitted && typeof permitted === "object" && !Array.isArray(permitted)) return exact(requested, Object.keys(permitted)) && Object.keys(permitted).every(k => familyRestrictionSubset(requested[k], permitted[k]));
  return scopeSubset(requested, permitted);
}
