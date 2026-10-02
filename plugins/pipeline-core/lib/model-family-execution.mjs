// SPDX-License-Identifier: SUL-1.0
/** Inert execution verification. Trusted host ports, not serialized flags,
 * supply invocation provenance, launch controls and S2 identity readback. */
import { createHash } from "node:crypto";
import { canonicalizeJson } from "./governance-event.mjs";

export const EXECUTION_RUNNERS = Object.freeze(["codex", "claude", "antigravity"]);
const EFFORTS = Object.freeze(["low", "medium", "high", "xhigh", "max", "not-applicable"]);
const SHA = /^[a-f0-9]{64}$/u, OID = /^[a-f0-9]{40}$/u, ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SELECTED_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
export const sha = (v) => typeof v === "string" && SHA.test(v);
const id = (v) => typeof v === "string" && ID.test(v);
export const own = (v, fields) => v !== null && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).sort().join("\0") === [...fields].sort().join("\0");
export const pass = (code, value) => ({ ok: true, code, value });
export const fail = (code, retryable = false) => ({ ok: false, code, retryable });
export const digest = (v) => createHash("sha256").update(canonicalizeJson(v)).digest("hex");
export const freeze = (v) => { const c = structuredClone(v); const lock = (x) => {
  if (x && typeof x === "object") { Object.values(x).forEach(lock); Object.freeze(x); } return x;
}; return lock(c); };
export const validResult = (r) => own(r, r?.ok === true ? ["ok", "code", "value"] : ["ok", "code", "retryable"])
  && typeof r.code === "string" && (r.ok === true || r.ok === false && typeof r.retryable === "boolean");
export async function hostCall(fn, input) {
  if (typeof fn !== "function") return fail("HOST_PORT_UNAVAILABLE");
  try { const r = await fn(input); return validResult(r) ? r : fail("HOST_RESULT_INVALID"); }
  catch { return fail("HOST_PORT_FAILED"); }
}
const nullSha = (v) => v === null || sha(v);
const version = (v) => Array.isArray(v) && v.length > 0 && v.length <= 8 && v.every((n) => Number.isSafeInteger(n) && n >= 0);
const time = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const INVOCATION_FIELDS = ["schema", "kind", "runner", "sessionId", "invocationId", "candidateCommit", "candidateTree", "taskRoute", "role", "effort", "familyId", "releaseId", "version", "selectedModelId", "canonicalModelId", "groupingEvidenceSha256", "variantSelectionEvidenceSha256", "selection", "authoritySha256", "pinDecisionSha256", "adapterContractSha256", "discoverySha256", "compatibilityEvidenceSha256", "observedAt", "expiresAt", "storeGeneration", "watermarkBefore", "watermarkAfter", "packetBindingSha256", "receiptSha256"];

export function validateInvocationReadback(v) {
  try {
    if (!own(v, ["invocation", "bindings", "provenanceSha256"]) || !sha(v.provenanceSha256)
      || !own(v.bindings, ["installationBindingSha256", "accountBindingSha256", "hostProcessBindingSha256"])
      || !Object.values(v.bindings).every(sha)) return fail("INVOCATION_PROVENANCE_UNAVAILABLE");
    const i = v.invocation;
    if (!own(i, INVOCATION_FIELDS) || i.schema !== "pipeline.model-family-invocation.v2"
      || i.kind !== "model-family-invocation" || !EXECUTION_RUNNERS.includes(i.runner)
      || !id(i.sessionId) || !id(i.invocationId) || !OID.test(i.candidateCommit) || !OID.test(i.candidateTree)
      || i.candidateCommit === i.candidateTree || !/^(?:profile|duty)\.[A-Za-z0-9_.-]{1,120}$/u.test(i.taskRoute)
      || !["frontier", "worker", "efficient"].includes(i.role) || !EFFORTS.includes(i.effort)
      || typeof i.familyId !== "string" || !/^[a-z][a-z0-9-]{0,31}$/u.test(i.familyId)
      || !id(i.releaseId) || !version(i.version) || typeof i.selectedModelId !== "string" || !SELECTED_MODEL_ID.test(i.selectedModelId)
      || !(i.canonicalModelId === null || typeof i.canonicalModelId === "string" && i.canonicalModelId.length <= 128)
      || !["latest", "explicit-po-pin"].includes(i.selection) || !nullSha(i.pinDecisionSha256)
      || ["groupingEvidenceSha256", "variantSelectionEvidenceSha256", "authoritySha256", "adapterContractSha256", "discoverySha256", "compatibilityEvidenceSha256", "packetBindingSha256", "receiptSha256"].some((k) => !sha(i[k]))
      || !time(i.observedAt) || !time(i.expiresAt) || Date.parse(i.expiresAt) <= Date.parse(i.observedAt)
      || Date.parse(i.expiresAt) - Date.parse(i.observedAt) > 60_000 || !Number.isSafeInteger(i.storeGeneration) || i.storeGeneration < 1
      || !(i.watermarkBefore === null || version(i.watermarkBefore)) || !version(i.watermarkAfter)) return fail("INVOCATION_INVALID");
    const { receiptSha256, ...subject } = i;
    if (digest(subject) !== receiptSha256) return fail("INVOCATION_DIGEST_MISMATCH");
    return pass("INVOCATION_STRUCTURAL", freeze(v));
  } catch { return fail("INVOCATION_INVALID"); }
}

export function validateModelFamilyExecutionReceipt(receipt) {
  try {
    if (!own(receipt, ["schema", "invocationReceiptSha256", "rawHostResultSha256", "actualModelIds", "actualEffort", "hostObservationSha256", "outcome", "receiptSha256"])
      || receipt.schema !== "pipeline.model-family-execution.v1" || !sha(receipt.invocationReceiptSha256)
      || !sha(receipt.rawHostResultSha256) || !sha(receipt.hostObservationSha256) || !sha(receipt.receiptSha256)
      || !Array.isArray(receipt.actualModelIds) || receipt.actualModelIds.length > 128
      || receipt.actualModelIds.some((x) => typeof x !== "string" || !SELECTED_MODEL_ID.test(x)) || new Set(receipt.actualModelIds).size !== receipt.actualModelIds.length
      || !(receipt.actualEffort === null || EFFORTS.includes(receipt.actualEffort))
      || !["matched", "mismatch", "identity-unavailable", "execution-failed"].includes(receipt.outcome)
      || receipt.outcome === "matched" && receipt.actualModelIds.length !== 1) return fail("EXECUTION_RECEIPT_INVALID");
    const { receiptSha256, ...subject } = receipt;
    return digest(subject) === receiptSha256 ? pass("EXECUTION_RECEIPT_STRUCTURAL", freeze(receipt)) : fail("EXECUTION_RECEIPT_DIGEST_MISMATCH");
  } catch { return fail("EXECUTION_RECEIPT_INVALID"); }
}

/** Factory construction is host code authority. The S4 port must read the
 * original immutable admitted invocation; structural validation alone does
 * not admit it. The S2 adapter/context are privately obtained from host code.
 * Defaults keep production closed. Returned handles are module-local. */
export function createModelFamilyExecutionHost({ readInvocation, readLaunchEvidence,
  adapters = {}, contextForInvocation, verifyAlias = () => fail("ALIAS_EXECUTION_UNVERIFIED"),
  appendExecution } = {}) {
  const reader = readInvocation, launchReader = readLaunchEvidence, contextReader = contextForInvocation;
  const adapterMethods = new Map(EXECUTION_RUNNERS.map((runner) => [runner,
    typeof adapters[runner]?.readActualExecutionIdentity === "function"
      ? adapters[runner].readActualExecutionIdentity.bind(adapters[runner]) : null]));
  const receipts = new WeakMap(), completed = new Map();
  const issue = (receipt) => { const h = Object.freeze(Object.create(null)); receipts.set(h, receipt); return h; };
  const audit = async (subject, observation, code = null) => {
    const receipt = freeze({ ...subject, hostObservationSha256: digest(observation), receiptSha256: digest({ ...subject, hostObservationSha256: digest(observation) }) });
    if (typeof appendExecution === "function") {
      const appended = await hostCall(appendExecution, { receipt, observation: freeze(observation) });
      if (!appended.ok) return appended;
    }
    if (code !== null) return fail(code);
    return pass("MODEL_FAMILY_EXECUTION_MATCHED", issue(receipt));
  };
  return Object.freeze({
    async recordModelFamilyExecution({ invocationId, rawHostResult } = {}) {
      try {
        if (!id(invocationId)) return fail("INVOCATION_ID_INVALID");
        const loaded = await hostCall(reader, { invocationId }); if (!loaded.ok) return loaded;
        const checked = validateInvocationReadback(loaded.value); if (!checked.ok) return checked;
        const { invocation: i, bindings, provenanceSha256 } = checked.value;
        if (i.invocationId !== invocationId) return fail("INVOCATION_ID_MISMATCH");
        const rawSha = digest(rawHostResult), held = completed.get(invocationId);
        if (held) return held.receiptSha256 === i.receiptSha256 && held.rawSha === rawSha
          ? pass("MODEL_FAMILY_EXECUTION_HELD", held.handle) : fail("EXECUTION_IMMUTABLE_CONFLICT");
        const controls = await hostCall(launchReader, { invocation: i, bindings }); if (!controls.ok) return controls;
        const c = freeze(controls.value);
        if (!own(c, ["invocationReceiptSha256", "runner", "supported", "requested", "configured", "execution"])
          || c.invocationReceiptSha256 !== i.receiptSha256 || c.runner !== i.runner
          || !own(c.supported, ["status", "efforts", "evidenceSha256"])
          || !["supported", "unknown", "unsupported"].includes(c.supported.status)
          || !nullSha(c.supported.evidenceSha256)
          || !(c.supported.efforts === null || Array.isArray(c.supported.efforts) && c.supported.efforts.length <= 128
            && c.supported.efforts.every((e) => typeof e === "string") && new Set(c.supported.efforts).size === c.supported.efforts.length)
          || !own(c.requested, ["modelId", "effort", "evidenceSha256"])
          || !own(c.configured, ["modelId", "effort", "evidenceSha256", "assurance"])
          || !["host-accepted", "host-configured"].includes(c.configured.assurance)
          || !sha(c.requested.evidenceSha256) || !sha(c.configured.evidenceSha256)
          || !own(c.execution, ["status", "evidenceSha256"]) || !["succeeded", "failed"].includes(c.execution.status)
          || !sha(c.execution.evidenceSha256)) return fail("EXECUTION_CONTROLS_UNVERIFIED");
        if (c.supported.status !== "supported" || !sha(c.supported.evidenceSha256) || !c.supported.efforts?.includes(i.effort))
          return fail("SUPPORTED_EFFORT_UNVERIFIED");
        if (c.requested.modelId !== i.selectedModelId || c.requested.effort !== i.effort) return fail("REQUEST_BINDING_MISMATCH");
        if (c.configured.modelId !== i.selectedModelId || c.configured.effort !== i.effort) return fail("CONFIGURATION_BINDING_MISMATCH");
        const base = { schema: "pipeline.model-family-execution.v1", invocationReceiptSha256: i.receiptSha256,
          rawHostResultSha256: rawSha, actualModelIds: [], actualEffort: null, outcome: "execution-failed" };
        const observation = { runner: i.runner, bindings, invocationProvenanceSha256: provenanceSha256,
          supported: c.supported, requested: c.requested, configured: c.configured, execution: c.execution,
          effective: { status: "unknown", effort: null, evidenceSha256: null }, identity: null, alias: null };
        if (c.execution.status === "failed") return audit(base, observation, "HOST_EXECUTION_FAILED");
        const context = await hostCall(contextReader, { invocation: i, bindings }); if (!context.ok) return context;
        // Invoke S2's actual positional contract with its host-owned context.
        const actual = adapterMethods.get(i.runner);
        let identity;
        if (typeof actual !== "function") identity = fail("EXECUTION_IDENTITY_UNAVAILABLE");
        else { try { const r = await actual(rawHostResult, context.value);
          identity = validResult(r) ? r : fail("HOST_RESULT_INVALID"); } catch { identity = fail("HOST_PORT_FAILED"); } }
        if (!identity.ok) return audit({ ...base, outcome: "identity-unavailable" }, observation, "EXECUTION_IDENTITY_UNAVAILABLE");
        const e = identity.value;
        if (!own(e, ["actualModelIds", "actualEffort", "rawHostResultSha256", "hostObservationSha256"])
          || !Array.isArray(e.actualModelIds) || e.actualModelIds.length > 128 || e.actualModelIds.some((x) => typeof x !== "string" || !SELECTED_MODEL_ID.test(x))
          || new Set(e.actualModelIds).size !== e.actualModelIds.length || !(e.actualEffort === null || EFFORTS.includes(e.actualEffort))
          || e.rawHostResultSha256 !== rawSha || !sha(e.hostObservationSha256)) return fail("EXECUTION_IDENTITY_UNVERIFIED");
        observation.identity = { actualModelIds: e.actualModelIds, hostObservationSha256: e.hostObservationSha256 };
        observation.effective = { status: e.actualEffort === null ? "unknown" : "observed", effort: e.actualEffort,
          evidenceSha256: e.actualEffort === null ? null : e.hostObservationSha256 };
        const subject = { ...base, actualModelIds: e.actualModelIds, actualEffort: e.actualEffort, outcome: "mismatch" };
        if (e.actualModelIds.length !== 1) return audit({ ...subject, outcome: "identity-unavailable" }, observation, "EXECUTION_IDENTITY_MULTIPLE_OR_MISSING");
        const actualId = e.actualModelIds[0];
        if (actualId !== i.selectedModelId) {
          if (i.canonicalModelId === null || actualId !== i.canonicalModelId) return audit(subject, observation, "EXECUTION_MODEL_MISMATCH");
          const alias = await hostCall(verifyAlias, { invocation: i, actualModelId: actualId, bindings });
          if (!alias.ok || !own(alias.value, ["invocationReceiptSha256", "selectedModelId", "canonicalModelId", "adapterContractSha256", "evidenceSha256"])
            || alias.value.invocationReceiptSha256 !== i.receiptSha256 || alias.value.selectedModelId !== i.selectedModelId
            || alias.value.canonicalModelId !== actualId || alias.value.adapterContractSha256 !== i.adapterContractSha256
            || !sha(alias.value.evidenceSha256)) return audit(subject, observation, "ALIAS_EXECUTION_UNVERIFIED");
          observation.alias = alias.value;
        }
        if (e.actualEffort !== null && e.actualEffort !== i.effort) return audit(subject, observation, "EXECUTION_EFFORT_MISMATCH");
        const matched = await audit({ ...subject, outcome: "matched" }, observation);
        if (matched.ok) completed.set(invocationId, { receiptSha256: i.receiptSha256, rawSha, handle: matched.value });
        return matched;
      } catch { return fail("EXECUTION_INPUT_INVALID"); }
    },
    readExecutionReceipt(handle) { const receipt = receipts.get(handle);
      return receipt ? pass("EXECUTION_RECEIPT_READ", receipt) : fail("EXECUTION_HANDLE_REQUIRED"); },
  });
}
