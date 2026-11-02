// SPDX-License-Identifier: SUL-1.0
// Admission of a NATIVE Antigravity `invoke_subagent` call that names an implementation role (goldfish-implementor, goldfish-mechanic).
//
// Until this module the guard refused such a call unconditionally (AGY-NATIVE-IMPLEMENTATION-CONSENT-UNAVAILABLE): a native hook call carries
// no authenticated parent identity. The PO decided on 2026-11-02 to build the native route anyway, on assumptions that are labelled and kept
// narrow. It stays deny-by-default and admits a call only when ALL of the following hold, none of which the agent can supply by itself:
//
//   1. the hook payload names a session (UNMEASURED ASSUMPTION, not measured on a real Antigravity host: the payload's session id is the
//      PARENT session's; nothing here claims the admission works in a real Antigravity run);
//   2. that session has a descriptor, its owner is live, and it has a stored v1 session consent that validates (signature or chat mode as
//      configured), unexpired and bound to that exact session and repository;
//   3. the consent's SIGNED subject scope carries `nativeImplementation: { schema, models: [...] }` -- the PO's explicit grant of the native
//      route and of the exact Model aliases (flash_lite | flash | pro) it may use, so no alias-to-model-id mapping is guessed here;
//   4. every implementation entry's role is in the consent's signed role list and its Model alias is in that grant.
//
// A v2 (model-family) consent is not accepted here: its binding is rechecked by the family dispatch path only. Any missing piece is a typed
// refusal that names the cause and the sanctioned alternative (elephant-implementation-dispatch.mjs). Nothing is written.

import { loadLiveSession, loadStoredConsent, validateConsentRecord, AGY_FAMILY_CONSENT_SCHEMA } from "./agy-session-authority.mjs";
import { loadSessionDescriptor } from "./worktree-lifecycle.mjs";

export const NATIVE_IMPLEMENTATION_SCOPE_SCHEMA = "pipeline.agy-native-implementation-scope.v1";
export const NATIVE_ASSURANCE = "unmeasured-hook-session-id";
const NATIVE_MODELS = new Set(["flash_lite", "flash", "pro"]);

const roleOf = (entry) => {
  const type = typeof entry?.TypeName === "string" && entry.TypeName.startsWith("pipeline-core:") ? entry.TypeName.slice("pipeline-core:".length) : entry?.TypeName;
  return type === "goldfish-implementor" || type === "goldfish-mechanic" ? `pipeline-core:${type}` : null;
};

export function evaluateNativeImplementationAdmission({ root, hookSessionId, subagents, nowEpochMs = Date.now() } = {}, deps = {}) {
  const deny = (code, reason) => ({ ok: false, code, reason });
  const implementation = (Array.isArray(subagents) ? subagents : []).map((entry) => ({ entry, role: roleOf(entry) })).filter((item) => item.role !== null);
  if (implementation.length === 0) return { ok: true, assurance: null, implementation: 0 };
  if (typeof root !== "string" || typeof hookSessionId !== "string" || hookSessionId === "") {
    return deny("AGY-NATIVE-SESSION-UNIDENTIFIED", "the hook payload names no session, so no stored consent can be bound to this call");
  }
  let descriptor;
  try { descriptor = (deps.loadSessionDescriptor ?? loadSessionDescriptor)(root, hookSessionId); }
  catch { return deny("AGY-NATIVE-SESSION-UNKNOWN", "the hook session has no session descriptor in this repository"); }
  const descriptorSha256 = descriptor?.descriptorSha256;
  let live;
  try { live = (deps.loadLiveSession ?? loadLiveSession)(root, hookSessionId, descriptorSha256); }
  catch { return deny("AGY-SESSION-OWNER-UNAVAILABLE", "the session owner could not be inspected"); }
  if (!live?.ok) return deny(live?.code ?? "AGY-SESSION-OWNER-UNAVAILABLE", "the session owner is not live");
  let stored;
  try { stored = (deps.loadStoredConsent ?? loadStoredConsent)(root, hookSessionId, descriptorSha256); }
  catch { return deny("AGY-SESSION-CONSENT-UNAVAILABLE", "the stored session consent could not be read"); }
  if (!stored?.record) return deny("AGY-SESSION-CONSENT-REQUIRED", "this session has no stored consent");
  if (stored.record.schema === AGY_FAMILY_CONSENT_SCHEMA) return deny("AGY-NATIVE-CONSENT-FAMILY-UNSUPPORTED", "a model-family consent is rechecked only by the family dispatch route");
  const verified = (deps.validateConsentRecord ?? validateConsentRecord)(stored.record, {
    root, repository: stored.descriptor?.repo ?? live.descriptor?.repo, session: live.session, nowEpochMs, policy: deps.policy,
  });
  if (!verified?.ok) return deny(verified?.code ?? "AGY-CONSENT-INVALID", "the stored consent does not validate");
  const grant = stored.record.subject?.scope?.nativeImplementation;
  if (grant?.schema !== NATIVE_IMPLEMENTATION_SCOPE_SCHEMA || !Array.isArray(grant.models) || grant.models.length === 0
    || grant.models.some((model) => !NATIVE_MODELS.has(model))) {
    return deny("AGY-NATIVE-SCOPE-NOT-GRANTED", `the signed consent scope carries no valid nativeImplementation grant (schema ${NATIVE_IMPLEMENTATION_SCOPE_SCHEMA}, models from flash_lite|flash|pro)`);
  }
  for (const { entry, role } of implementation) {
    if (!stored.record.subject.roles.includes(role)) return deny("AGY-CONSENT-ROLE-MISMATCH", `${role} is not in the consent's signed role list`);
    if (!grant.models.includes(entry.Model)) return deny("AGY-NATIVE-MODEL-NOT-GRANTED", `Model ${JSON.stringify(entry.Model ?? null)} is not in the consent's native grant`);
  }
  return { ok: true, assurance: NATIVE_ASSURANCE, implementation: implementation.length, sessionId: hookSessionId, consentSubjectSha256: stored.record.subjectSha256 };
}
