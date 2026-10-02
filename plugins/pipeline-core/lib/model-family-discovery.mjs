// SPDX-License-Identifier: SUL-1.0
/** Inert host discovery boundary. Ports are host-owned code, never wire data.
 * Default ports cannot qualify provider semantics. Fixture ports prove source
 * behavior only. No process, provider call, signing, activation or disk write. */
import { createHash } from "node:crypto";
import { canonicalizeJson, parseStrictJson } from "./governance-event.mjs";

export const RUNNERS = Object.freeze(["codex", "claude", "antigravity"]);
export const RULE_FIELDS = Object.freeze(["identityRule", "releaseGroupingRule", "versionRule",
  "variantSelectionRule", "selectabilityRule", "effortRule", "compatibilityRule", "executionIdentityRule"]);
const SHA = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const validId = (v) => typeof v === "string" && ID.test(v);
const FAMILY = /^[a-z][a-z0-9-]{0,31}$/u;
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "not-applicable"]);
export const fail = (code, retryable = false) => ({ ok: false, code, retryable });
export const pass = (code, value) => ({ ok: true, code, value });
export const own = (v, keys) => v !== null && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).sort().join("\0") === [...keys].sort().join("\0");
export const digest = (v) => createHash("sha256").update(canonicalizeJson(v)).digest("hex");
export const bytesDigest = (v) => createHash("sha256").update(v).digest("hex");
export const freeze = (v) => { const c = structuredClone(v); const lock = (x) => {
  if (x && typeof x === "object") { Object.values(x).forEach(lock); Object.freeze(x); } return x;
}; return lock(c); };
const time = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const binding = (v) => own(v, ["installationBindingSha256", "accountBindingSha256", "hostProcessBindingSha256"])
  && Object.values(v).every((x) => typeof x === "string" && SHA.test(x));
const same = (a, b) => { try { return digest(a) === digest(b); } catch { return false; } };
const result = (v) => own(v, v?.ok === true ? ["ok", "code", "value"] : ["ok", "code", "retryable"])
  && typeof v.code === "string" && (v.ok === true || v.ok === false && typeof v.retryable === "boolean");
const invoke = (fn, input) => { try { const r = fn(input); return result(r) ? r : fail("HOST_RESULT_INVALID"); }
  catch { return fail("HOST_PORT_FAILED"); } };

export function validateAdapterContract(c) {
  if (!own(c, ["schema", "runner", "familyId", ...RULE_FIELDS, "discoveryModes", "providerEvidenceSha256s"])
    || c.schema !== "pipeline.model-family-adapter-contract.v1" || !RUNNERS.includes(c.runner)
    || typeof c.familyId !== "string" || !FAMILY.test(c.familyId)
    || !Array.isArray(c.discoveryModes) || c.discoveryModes.length === 0
    || new Set(c.discoveryModes).size !== c.discoveryModes.length
    || c.discoveryModes.some((x) => !["complete-catalogue", "verified-latest-alias"].includes(x))
    || !Array.isArray(c.providerEvidenceSha256s) || c.providerEvidenceSha256s.length === 0
    || new Set(c.providerEvidenceSha256s).size !== c.providerEvidenceSha256s.length
    || c.providerEvidenceSha256s.some((x) => typeof x !== "string" || !SHA.test(x))) return fail("ADAPTER_CONTRACT_INVALID");
  if (RULE_FIELDS.some((k) => !own(c[k], ["id", "version", "sha256"]) || !validId(c[k].id)
    || !Number.isSafeInteger(c[k].version) || c[k].version < 1 || !SHA.test(c[k].sha256))) return fail("ADAPTER_CONTRACT_INVALID");
  return pass("ADAPTER_CONTRACT_STRUCTURAL", freeze(c));
}

/** Host construction is a code capability. There is deliberately no serialized
 * context/contract/admitted boolean API. Independently verified evidence must
 * bind all rule implementations, external shapes and the exact contract. */
export function createModelFamilyDiscoveryHost({ capture, verifyProviderContract = () => fail("ADAPTER_CONTRACT_UNQUALIFIED"),
  rules = {}, compatibility = () => fail("COMPATIBILITY_UNVERIFIED"),
  execution = () => fail("EXECUTION_IDENTITY_UNAVAILABLE"), clock = () => new Date().toISOString() } = {}) {
  const contexts = new WeakMap(), contracts = new WeakMap(), raws = new WeakMap(), coverages = new WeakMap(), discoveries = new WeakMap();
  // Copy the rule registry once; future mutation of the caller registry cannot change semantics.
  const rulebook = new Map(Object.entries(rules).map(([key, value]) => [key, Object.freeze({ ...value })]));
  const handle = (map, value) => { const h = Object.freeze(Object.create(null)); map.set(h, value); return h; };
  const fresh = (c) => { try { const now = clock(); return c && time(now) && Date.parse(now) >= Date.parse(c.observedAt)
    && Date.parse(now) < Date.parse(c.expiresAt) && Date.parse(c.expiresAt) - Date.parse(c.observedAt) <= 60_000;
  } catch { return false; } };
  const pair = (context, contract, runner) => { const c = contexts.get(context), k = contracts.get(contract);
    return c && k && c.runner === runner && k.contract.runner === runner && fresh(c) ? { c, k } : null; };
  const runRule = (k, name, input) => invoke(rulebook.get(k.contract[name].id).run, input);
  return Object.freeze({
    createContext({ runner, bindings, observedAt, expiresAt } = {}) {
      if (!RUNNERS.includes(runner) || !binding(bindings) || !time(observedAt) || !time(expiresAt)
        || Date.parse(expiresAt) <= Date.parse(observedAt) || Date.parse(expiresAt) - Date.parse(observedAt) > 60_000)
        return fail("HOST_CONTEXT_INVALID");
      const c = freeze({ runner, bindings, observedAt, expiresAt });
      return fresh(c) ? pass("HOST_CONTEXT_BOUND", handle(contexts, c)) : fail("DISCOVERY_STALE", true);
    },
    qualifyContract(contract) {
      const valid = validateAdapterContract(contract); if (!valid.ok) return valid;
      const c = valid.value;
      for (const name of RULE_FIELDS) { const r = rulebook.get(c[name].id);
        if (!r || r.version !== c[name].version || r.sha256 !== c[name].sha256 || typeof r.run !== "function")
          return fail("ADAPTER_CONTRACT_UNQUALIFIED"); }
      const verified = invoke(verifyProviderContract, { contract: c, contractSha256: digest(c) });
      if (!verified.ok) return verified;
      if (!own(verified.value, ["contractSha256", "providerEvidenceSha256s"])
        || verified.value.contractSha256 !== digest(c) || !same(verified.value.providerEvidenceSha256s, c.providerEvidenceSha256s))
        return fail("ADAPTER_CONTRACT_UNQUALIFIED");
      return pass("ADAPTER_CONTRACT_QUALIFIED", handle(contracts, { contract: c, sha256: digest(c) }));
    },
    async captureRawDiscovery(runner, context) {
      const c = contexts.get(context);
      if (!c || c.runner !== runner || !fresh(c)) return fail("DISCOVERY_STALE", true);
      if (typeof capture !== "function") return fail("DISCOVERY_SOURCE_UNAVAILABLE", true);
      let r; try { r = await capture(freeze(c)); } catch { return fail("DISCOVERY_CAPTURE_FAILED", true); }
      if (!result(r)) return fail("HOST_RESULT_INVALID"); if (!r.ok) return r;
      const v = r.value;
      if (!own(v, ["bindings", "pages", "source", "observedAt"]) || !same(v.bindings, c.bindings)
        || v.observedAt !== c.observedAt || !Array.isArray(v.pages) || v.pages.length === 0 || v.pages.length > 32
        || typeof v.source !== "string" || v.source.length > 128 || !fresh(c)) return fail("RAW_CAPTURE_BINDING_INVALID");
      let bytes = 0;
      const pages = [];
      for (const page of v.pages) {
        if (!own(page, ["request", "responseBytes"]) || typeof page.responseBytes !== "string"
          || !page.request || typeof page.request !== "object") return fail("RAW_CAPTURE_INVALID");
        bytes += Buffer.byteLength(page.responseBytes); if (bytes > 1_048_576) return fail("DISCOVERY_BOUNDS");
        pages.push({ request: page.request, responseBytes: page.responseBytes, responseByteSha256: bytesDigest(page.responseBytes) });
      }
      const retained = freeze({ ...v, pages });
      return pass("RAW_DISCOVERY_CAPTURED", handle(raws, { context, retained, sha256: digest(retained) }));
    },
    readRetainedRaw(raw) { const r = raws.get(raw); return r ? pass("RAW_EVIDENCE_RETAINED", r.retained) : fail("RAW_HANDLE_REQUIRED"); },
    verifyCoverage(runner, raw, context, contract, parseCoverage) {
      const p = pair(context, contract, runner), r = raws.get(raw);
      if (!p || !r || r.context !== context) return fail("HOST_HANDLE_REQUIRED");
      const parsed = invoke(parseCoverage, r.retained); if (!parsed.ok) return parsed;
      const coverage = runRule(p.k, "identityRule", { phase: "coverage", raw: r.retained, structural: parsed.value,
        bindings: p.c.bindings, contract: p.k.contract });
      if (!coverage.ok) return coverage;
      if (!own(coverage.value, ["mode", "evidenceSha256", "latestAliasEvidenceSha256"])
        || !p.k.contract.discoveryModes.includes(coverage.value.mode) || !SHA.test(coverage.value.evidenceSha256)
        || (coverage.value.mode === "complete-catalogue" ? coverage.value.latestAliasEvidenceSha256 !== null
          : !SHA.test(coverage.value.latestAliasEvidenceSha256))) return fail("COVERAGE_UNVERIFIED");
      return pass("COVERAGE_VERIFIED", handle(coverages, { context, contract, raw, structural: parsed.value, coverage: freeze(coverage.value) }));
    },
    normalizeReleases(runner, raw, contract, coverage) {
      const cv = coverages.get(coverage), r = raws.get(raw), k = contracts.get(contract);
      if (!cv || !r || !k || cv.raw !== raw || cv.contract !== contract || k.contract.runner !== runner
        || !fresh(contexts.get(cv.context))) return fail("HOST_HANDLE_REQUIRED");
      const records = [], seenIds = new Set(), versions = new Map();
      for (const entry of cv.structural.entries) {
        const input = { phase: "entry", entry, raw: r.retained, contract: k.contract };
        const identity = runRule(k, "identityRule", input); if (!identity.ok) return identity;
        if (identity.value === null) continue; // A verified unrelated entry is diagnostic only.
        const group = runRule(k, "releaseGroupingRule", { ...input, identity: identity.value }); if (!group.ok) return group;
        const ver = runRule(k, "versionRule", { ...input, identity: identity.value }); if (!ver.ok) return ver;
        const selectable = runRule(k, "selectabilityRule", input); if (!selectable.ok) return selectable;
        const effort = runRule(k, "effortRule", input); if (!effort.ok) return effort;
        const variant = runRule(k, "variantSelectionRule", { ...input, identity: identity.value }); if (!variant.ok) return variant;
        const g = group.value, v = ver.value, s = selectable.value, e = effort.value, a = variant.value;
        if (!own(g, ["releaseId", "familyId", "groupingEvidenceSha256"]) || !validId(g.releaseId)
          || g.familyId !== k.contract.familyId || !SHA.test(g.groupingEvidenceSha256)
          || !Array.isArray(v) || v.length < 1 || v.length > 8 || v.some((n) => !Number.isSafeInteger(n) || n < 0)
          || !own(s, ["released", "visible", "selectable"]) || Object.values(s).some((b) => typeof b !== "boolean")
          || s.selectable && (!s.visible || !s.released)
          || !own(e, ["efforts", "capabilityEvidenceSha256"])
          || !(e.capabilityEvidenceSha256 === null || typeof e.capabilityEvidenceSha256 === "string" && SHA.test(e.capabilityEvidenceSha256))
          || e.efforts !== null && (!Array.isArray(e.efforts) || e.capabilityEvidenceSha256 === null || e.efforts.length > 128
            || e.efforts.some((x) => typeof x !== "string" || !/^[a-z][a-z0-9-]{0,31}$/u.test(x)) || new Set(e.efforts).size !== e.efforts.length)
          || !own(a, ["modelId", "canonicalModelId", "aliasEvidenceSha256"]) || !validId(a.modelId)
          || (a.canonicalModelId === null ? a.aliasEvidenceSha256 !== null : !validId(a.canonicalModelId) || !SHA.test(a.aliasEvidenceSha256)))
          return fail("NORMALIZATION_INVALID");
        if (seenIds.has(a.modelId)) return fail("MODEL_ID_DUPLICATE"); seenIds.add(a.modelId);
        const normalized = [...v]; while (normalized.length > 1 && normalized.at(-1) === 0) normalized.pop();
        const versionKey = JSON.stringify(normalized), prior = versions.get(versionKey);
        if (prior && prior !== g.releaseId) return fail("VERSION_AMBIGUOUS"); versions.set(versionKey, g.releaseId);
        let record = records.find((x) => x.releaseId === g.releaseId);
        if (record && (!same(record.version, normalized) || record.released !== s.released
          || record.groupingEvidenceSha256 !== g.groupingEvidenceSha256)) return fail("RELEASE_GROUP_CONFLICT");
        if (!record) { record = { ...g, version: normalized, released: s.released, variants: [] }; records.push(record); }
        if (record.variants.length >= 256 || seenIds.size > 8192) return fail("DISCOVERY_BOUNDS");
        record.variants.push({ ...a, visible: s.visible, selectable: s.selectable, ...e, compatibilityBySlotSha256: {} });
      }
      if (!records.length || records.length > 2048) return fail("FAMILY_COVERAGE_UNKNOWN");
      const c = contexts.get(cv.context), value = freeze({ schema: "pipeline.model-family-discovery.v1", runner,
        ...c.bindings, adapterContractSha256: k.sha256, mode: cv.coverage.mode, observedAt: c.observedAt, expiresAt: c.expiresAt,
        rawEvidenceSha256: r.sha256, coverageEvidenceSha256: cv.coverage.evidenceSha256,
        compatibilityEvidenceSha256: null, records, latestAliasEvidenceSha256: cv.coverage.latestAliasEvidenceSha256 });
      return pass("DISCOVERY_NORMALIZED", handle(discoveries, { value, context: cv.context, contract }));
    },
    readDiscovery(discovery) { const d = discoveries.get(discovery); return d ? pass("DISCOVERY_READ", d.value) : fail("DISCOVERY_HANDLE_REQUIRED"); },
    verifyCompatibility(runner, head, slot, context, contract) {
      const p = pair(context, contract, runner);
      if (!p) return fail("HOST_HANDLE_REQUIRED");
      const d = discoveries.get(head?.discovery);
      if (!own(head, ["discovery", "releaseId", "modelId"]) || !d || d.context !== context || d.contract !== contract)
        return fail("DISCOVERY_HANDLE_REQUIRED");
      const record = d.value.records.find((x) => x.releaseId === head.releaseId);
      const variant = record?.variants.find((x) => x.modelId === head.modelId);
      if (!variant || !record.released || !variant.visible || !variant.selectable) return fail("HEAD_NOT_SELECTABLE");
      if (!own(slot, ["taskRoute", "role", "effort"]) || typeof slot.taskRoute !== "string" || !["frontier", "worker", "efficient"].includes(slot.role)
        || !EFFORTS.has(slot.effort)) return fail("SLOT_INVALID");
      if (variant.efforts === null) return fail("EFFORT_UNKNOWN");
      if (!variant.efforts.includes(slot.effort)) return fail("EFFORT_UNSUPPORTED");
      const r = invoke(compatibility, { runner, record, variant, slot: freeze(slot), bindings: p.c.bindings, contract: p.k.contract });
      if (!r.ok) return r;
      const subject = { runner, releaseId: head.releaseId, modelId: head.modelId, ...slot, discoverySha256: digest(d.value), adapterContractSha256: p.k.sha256 };
      if (!own(r.value, ["subjectSha256", "evidenceSha256"]) || r.value.subjectSha256 !== digest(subject) || !SHA.test(r.value.evidenceSha256))
        return fail("COMPATIBILITY_UNVERIFIED");
      const value = structuredClone(d.value);
      const v = value.records.find((x) => x.releaseId === head.releaseId).variants.find((x) => x.modelId === head.modelId);
      v.compatibilityBySlotSha256[JSON.stringify([runner, slot.taskRoute, slot.role, slot.effort])] = r.value.evidenceSha256;
      value.compatibilityEvidenceSha256 = r.value.evidenceSha256;
      return pass("COMPATIBILITY_VERIFIED", { discovery: handle(discoveries, { ...d, value: freeze(value) }), evidence: freeze(r.value) });
    },
    renderExactLaunch(runner, selection, packet, render) {
      const d = discoveries.get(selection?.discovery);
      if (!own(selection, ["discovery", "releaseId", "modelId", "effort"]) || !d || d.value.runner !== runner
        || !fresh(contexts.get(d.context))) return fail("DISCOVERY_HANDLE_REQUIRED");
      const record = d.value.records.find((x) => x.releaseId === selection.releaseId);
      const v = record?.variants.find((x) => x.modelId === selection.modelId);
      if (!record?.released || !v?.visible || !v.selectable || !v.efforts?.includes(selection.effort)) return fail("LAUNCH_NOT_SELECTABLE");
      if (!own(packet, ["invocationReceiptSha256", "selectedModelId", "effort", "discoverySha256"])
        || !SHA.test(packet.invocationReceiptSha256) || packet.selectedModelId !== selection.modelId
        || packet.effort !== selection.effort || packet.discoverySha256 !== digest(d.value)
        || !Object.values(v.compatibilityBySlotSha256).length) return fail("LAUNCH_BINDING_INVALID");
      return invoke(render, { modelId: selection.modelId, effort: selection.effort, packet: freeze(packet) });
    },
    readActualExecutionIdentity(runner, rawHostResult, context) {
      // A held invocation may finish after discovery expired. Identity retains
      // its original binding; a new selection still requires fresh discovery.
      const c = contexts.get(context); if (!c || c.runner !== runner) return fail("HOST_HANDLE_REQUIRED");
      const r = invoke(execution, { runner, rawHostResult, bindings: c.bindings }); if (!r.ok) return r;
      if (!own(r.value, ["actualModelIds", "actualEffort", "rawHostResultSha256", "hostObservationSha256"])
        || !Array.isArray(r.value.actualModelIds) || !r.value.actualModelIds.length || r.value.actualModelIds.some((id) => !validId(id))
        || new Set(r.value.actualModelIds).size !== r.value.actualModelIds.length
        || r.value.actualEffort !== null && !EFFORTS.has(r.value.actualEffort)
        || r.value.rawHostResultSha256 !== digest(rawHostResult) || !SHA.test(r.value.hostObservationSha256)) return fail("EXECUTION_IDENTITY_UNVERIFIED");
      return pass("EXECUTION_IDENTITY_OBSERVED", freeze(r.value));
    },
  });
}

export function parsePageBytes(page) { try { return pass("RAW_PAGE_PARSED", parseStrictJson(page.responseBytes)); }
  catch { return fail("RAW_PAGE_MALFORMED"); } }

export async function collectModelFamilyDiscovery({ runner, authority, installedHost, clock } = {}) {
  if (!RUNNERS.includes(runner) || !installedHost || typeof installedHost.adapter?.captureRawDiscovery !== "function"
    || !authority || typeof installedHost.verifyAuthority !== "function") return fail("HOST_HANDLE_REQUIRED");
  const verified = invoke(installedHost.verifyAuthority, authority); if (!verified.ok) return verified;
  if (clock !== undefined && typeof clock !== "function") return fail("CLOCK_INVALID");
  const { adapter, context, contract } = installedHost;
  const raw = await adapter.captureRawDiscovery(context); if (!raw.ok) return raw;
  const coverage = adapter.verifyCoverage(raw.value, context, contract); if (!coverage.ok) return coverage;
  return adapter.normalizeReleases(raw.value, contract, coverage.value);
}
