// SPDX-License-Identifier: SUL-1.0
/** Pure selection proposal over normalized discovery. This module cannot admit host evidence. */
import { createHash } from "node:crypto";
import { canonicalizeJson } from "./governance-event.mjs";

const SHA = /^[a-f0-9]{64}$/u;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const FAMILY_ID = /^[a-z][a-z0-9-]{0,31}$/u;
const TASK_ROUTE = /^(?:profile|duty)\.[A-Za-z0-9_.-]{1,120}$/u;
const RUNNERS = new Set(["claude", "codex", "antigravity"]);
const ROLES = new Set(["frontier", "worker", "efficient"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "not-applicable"]);
const MODES = new Set(["complete-catalogue", "verified-latest-alias"]);
const UPDATE = "latest";
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const digest = (value) => createHash("sha256").update(canonicalizeJson(value)).digest("hex");
const slotKey = (a) => JSON.stringify([a.runner, a.taskRoute, a.role, a.effort]);
const failure = (code, retryable = false) => ({ ok: false, code, retryable });
const success = (code, value) => ({ ok: true, code, value });
const validSha = (value) => typeof value === "string" && SHA.test(value);
const validModelId = (value) => typeof value === "string" && MODEL_ID.test(value);
const validFamily = (value) => typeof value === "string" && FAMILY_ID.test(value);
const validVersion = (value) => Array.isArray(value) && value.length >= 1 && value.length <= 8
  && value.every((part) => Number.isSafeInteger(part) && part >= 0);
const unique = (items) => new Set(items).size === items.length;

function validTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

/** Compare version tuples numerically with zero-padding; equal tuples return 0. */
export function compareModelFamilyVersions(left, right) {
  if (!validVersion(left) || !validVersion(right)) throw new TypeError("model family version tuple is invalid");
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return 0;
}

function validAssignment(assignment) {
  return own(assignment, ["runner", "taskRoute", "role", "effort", "familyId", "adapterContractSha256", "minimumVersion", "update"])
    && RUNNERS.has(assignment.runner) && typeof assignment.taskRoute === "string" && TASK_ROUTE.test(assignment.taskRoute)
    && ROLES.has(assignment.role) && EFFORTS.has(assignment.effort) && validFamily(assignment.familyId)
    && validSha(assignment.adapterContractSha256) && validVersion(assignment.minimumVersion)
    && assignment.update === UPDATE;
}

function validEffortTokens(value) {
  return Array.isArray(value) && value.length <= 128 && value.every((item) =>
    typeof item === "string" && /^[a-z][a-z0-9-]{0,31}$/u.test(item)) && unique(value);
}

function validateDiscovery(discovery, assignment, now) {
  const fields = ["schema", "runner", "installationBindingSha256", "accountBindingSha256", "hostProcessBindingSha256",
    "adapterContractSha256", "mode", "observedAt", "expiresAt", "rawEvidenceSha256", "coverageEvidenceSha256",
    "compatibilityEvidenceSha256", "records", "latestAliasEvidenceSha256"];
  if (!own(discovery, fields) || discovery.schema !== "pipeline.model-family-discovery.v1"
    || !RUNNERS.has(discovery.runner) || discovery.runner !== assignment.runner
    || !["installationBindingSha256", "accountBindingSha256", "hostProcessBindingSha256", "adapterContractSha256",
      "rawEvidenceSha256", "coverageEvidenceSha256"].every((k) => validSha(discovery[k]))
    || discovery.adapterContractSha256 !== assignment.adapterContractSha256
    || !MODES.has(discovery.mode) || !validTime(discovery.observedAt) || !validTime(discovery.expiresAt)
    || Date.parse(discovery.expiresAt) <= Date.parse(discovery.observedAt)
    || Date.parse(discovery.expiresAt) - Date.parse(discovery.observedAt) > 60000
    || !validTime(now) || !Array.isArray(discovery.records) || discovery.records.length < 1 || discovery.records.length > 2048
    || !(discovery.compatibilityEvidenceSha256 === null || validSha(discovery.compatibilityEvidenceSha256))
    || !(discovery.latestAliasEvidenceSha256 === null || validSha(discovery.latestAliasEvidenceSha256))) return { code: "DISCOVERY_INVALID" };
  if (Date.parse(now) < Date.parse(discovery.observedAt) || Date.parse(now) >= Date.parse(discovery.expiresAt)) {
    return { code: "DISCOVERY_STALE", retryable: true };
  }
  if ((discovery.mode === "complete-catalogue" && discovery.latestAliasEvidenceSha256 !== null)
    || (discovery.mode === "verified-latest-alias" && discovery.latestAliasEvidenceSha256 === null)) return { code: "DISCOVERY_INVALID" };

  const releaseIds = new Set();
  const modelIds = new Set();
  let variantsSeen = 0;
  const records = [];
  for (const record of discovery.records) {
    if (!own(record, ["releaseId", "familyId", "version", "released", "groupingEvidenceSha256", "variants"])
      || !validModelId(record.releaseId) || !validFamily(record.familyId) || !validVersion(record.version)
      || typeof record.released !== "boolean" || !validSha(record.groupingEvidenceSha256)
      || !Array.isArray(record.variants) || record.variants.length < 1 || record.variants.length > 256
      || releaseIds.has(record.releaseId)) return { code: "DISCOVERY_INVALID" };
    releaseIds.add(record.releaseId);
    const variants = [];
    for (const variant of record.variants) {
      if (!own(variant, ["modelId", "canonicalModelId", "aliasEvidenceSha256", "visible", "selectable", "efforts",
        "capabilityEvidenceSha256", "compatibilityBySlotSha256"])
        || !validModelId(variant.modelId) || modelIds.has(variant.modelId)
        || !(variant.canonicalModelId === null || validModelId(variant.canonicalModelId))
        || !(variant.aliasEvidenceSha256 === null || validSha(variant.aliasEvidenceSha256))
        || ((variant.canonicalModelId === null) !== (variant.aliasEvidenceSha256 === null))
        || typeof variant.visible !== "boolean" || typeof variant.selectable !== "boolean"
        || !(variant.efforts === null || validEffortTokens(variant.efforts))
        || !(variant.capabilityEvidenceSha256 === null || validSha(variant.capabilityEvidenceSha256))
        || (variant.efforts !== null && variant.capabilityEvidenceSha256 === null)
        || variant.compatibilityBySlotSha256 === null || typeof variant.compatibilityBySlotSha256 !== "object"
        || Array.isArray(variant.compatibilityBySlotSha256)
        || Object.keys(variant.compatibilityBySlotSha256).length > 512
        || Object.entries(variant.compatibilityBySlotSha256).some(([key, value]) => key.length > 512
          || !(value === null || validSha(value)))) return { code: "DISCOVERY_INVALID" };
      modelIds.add(variant.modelId);
      variantsSeen += 1;
      variants.push(variant);
    }
    records.push({ ...record, variants });
  }
  if (variantsSeen > 8192) return { code: "DISCOVERY_INVALID" };
  const familyRecords = records.filter((record) => record.familyId === assignment.familyId);
  for (let i = 0; i < familyRecords.length; i += 1) for (let j = i + 1; j < familyRecords.length; j += 1) {
    if (compareModelFamilyVersions(familyRecords[i].version, familyRecords[j].version) === 0) {
      return { code: "VERSION_AMBIGUOUS" };
    }
  }
  return { records, familyRecords };
}

function validateWatermark(watermark, discovery, assignment) {
  if (watermark === null) return { version: null };
  if (!own(watermark, ["runner", "accountBindingSha256", "installationBindingSha256", "familyId", "version", "admittedReceiptSha256"])
    || watermark.runner !== assignment.runner || watermark.familyId !== assignment.familyId
    || watermark.accountBindingSha256 !== discovery.accountBindingSha256
    || watermark.installationBindingSha256 !== discovery.installationBindingSha256
    || !validVersion(watermark.version) || !validSha(watermark.admittedReceiptSha256)) return { error: "WATERMARK_SCOPE_MISMATCH" };
  return { version: [...watermark.version] };
}

function validateHardEligibility(value, assignment) {
  if (!own(value, ["runner", "taskRoute", "role", "effort", "evidenceSha256", "minimumVersion", "deniedModelIds"])
    || value.runner !== assignment.runner || value.taskRoute !== assignment.taskRoute || value.role !== assignment.role
    || value.effort !== assignment.effort || !validSha(value.evidenceSha256)
    || !(value.minimumVersion === null || validVersion(value.minimumVersion))
    || !Array.isArray(value.deniedModelIds) || value.deniedModelIds.length > 1024
    || value.deniedModelIds.some((id) => !validModelId(id)) || !unique(value.deniedModelIds)) return false;
  return true;
}

function versionMaximum(...versions) {
  return versions.filter((version) => version !== null).reduce((maximum, version) =>
    maximum === null || compareModelFamilyVersions(version, maximum) > 0 ? [...version] : maximum, null);
}

/**
 * Evaluate a normalized, already-authenticated-by-caller discovery snapshot.
 * The caller must obtain discovery, pin and watermark from S2/S4-owned
 * verifiers/stores. This pure function creates a proposal only; it cannot
 * confer authority or establish provider semantics.
 */
export function evaluateModelFamilySelection({ assignment, discovery, watermark = null, pinSelection = null,
  context, now } = {}) {
  if (!validAssignment(assignment) || !own(context, ["coverage", "hardEligibility", "variantRule", "compatibility", "latestAlias"])
    || !validTime(now)) return failure("INPUT_INVALID");
  const checked = validateDiscovery(discovery, assignment, now);
  if (checked.code) return failure(checked.code, checked.retryable ?? false);
  const slot = slotKey(assignment);
  const coverage = context.coverage;
  if (!own(coverage, ["familyId", "coverageEvidenceSha256", "unknownTargetFamilyEvidenceSha256s"])
    || coverage.familyId !== assignment.familyId || coverage.coverageEvidenceSha256 !== discovery.coverageEvidenceSha256
    || !Array.isArray(coverage.unknownTargetFamilyEvidenceSha256s)
    || coverage.unknownTargetFamilyEvidenceSha256s.length > 1024
    || coverage.unknownTargetFamilyEvidenceSha256s.some((h) => !validSha(h))) return failure("DISCOVERY_INVALID");
  if (coverage.unknownTargetFamilyEvidenceSha256s.length > 0) return failure("FAMILY_VERSION_UNRECOGNIZED", true);
  if (!validateHardEligibility(context.hardEligibility, assignment)) return failure("HARD_ELIGIBILITY_UNVERIFIED");
  const hard = context.hardEligibility;
  const checkedWatermark = validateWatermark(watermark, discovery, assignment);
  if (checkedWatermark.error) return failure(checkedWatermark.error);

  let pinnedVariant = null;
  let pinDigest = null;
  let selection = "latest";
  if (pinSelection !== null) {
    if (!own(pinSelection, ["decisionSha256", "authoritySha256", "runner", "familyId", "taskRoutes", "role", "effort", "modelId", "revision"])
      || !validSha(pinSelection.decisionSha256) || !validSha(pinSelection.authoritySha256)
      || pinSelection.runner !== assignment.runner || pinSelection.familyId !== assignment.familyId
      || pinSelection.role !== assignment.role || pinSelection.effort !== assignment.effort
      || !Array.isArray(pinSelection.taskRoutes) || !unique(pinSelection.taskRoutes)
      || !pinSelection.taskRoutes.includes(assignment.taskRoute) || pinSelection.taskRoutes.some((t) => typeof t !== "string" || !TASK_ROUTE.test(t))
      || !validModelId(pinSelection.modelId) || !Number.isSafeInteger(pinSelection.revision) || pinSelection.revision < 1) return failure("PIN_INVALID");
    const matches = checked.familyRecords.flatMap((record) => record.variants
      .filter((variant) => variant.modelId === pinSelection.modelId && record.released && variant.visible && variant.selectable)
      .map((variant) => ({ record, variant })));
    if (matches.length !== 1) return failure("PIN_UNAVAILABLE");
    pinnedVariant = matches[0];
    pinDigest = pinSelection.decisionSha256;
    selection = "explicit-po-pin";
  }

  // Select the newest selectable release group before checking floor, effort,
  // hard eligibility or compatibility. Those later checks never fall back.
  const headRecords = checked.familyRecords.filter((record) => record.released
    && record.variants.some((variant) => variant.visible && variant.selectable));
  if (headRecords.length === 0) return failure("FAMILY_RELEASE_UNAVAILABLE", true);
  const head = headRecords.reduce((best, record) => compareModelFamilyVersions(record.version, best.version) > 0 ? record : best);

  let group;
  if (pinSelection !== null) {
    group = pinnedVariant;
  } else {
    if (compareModelFamilyVersions(head.version, assignment.minimumVersion) < 0
      || (checkedWatermark.version && compareModelFamilyVersions(head.version, checkedWatermark.version) < 0)) return failure("DOWNGRADE_REFUSED");
    group = { record: head, variant: null };
  }
  if (discovery.mode === "verified-latest-alias") {
    const alias = context.latestAlias;
    if (!own(alias, ["releaseId", "modelId", "evidenceSha256"])
      || !validModelId(alias.modelId) || !validSha(alias.evidenceSha256)
      || alias.evidenceSha256 !== discovery.latestAliasEvidenceSha256
      || alias.releaseId !== head.releaseId
      || !head.variants.some((v) => v.modelId === alias.modelId && v.visible && v.selectable)) return failure("LATEST_ALIAS_UNVERIFIED", true);
  } else if (context.latestAlias !== null) return failure("INPUT_INVALID");

  const record = group.record;
  if (pinSelection !== null && (!record.released || record.familyId !== assignment.familyId
    || !group.variant.visible || !group.variant.selectable)) return failure("PIN_UNAVAILABLE");
  if (hard.minimumVersion !== null && compareModelFamilyVersions(record.version, hard.minimumVersion) < 0) {
    return failure("HARD_MODEL_INELIGIBLE");
  }

  const visibleSelectable = record.variants.filter((variant) => variant.visible && variant.selectable);
  const eligible = visibleSelectable.filter((variant) => Array.isArray(variant.efforts) && variant.efforts.includes(assignment.effort));
  let selected;
  let variantRuleSha256 = null;
  if (pinSelection !== null) {
    selected = group.variant;
    if (!Array.isArray(selected.efforts)) return failure("CURRENT_EFFORT_UNKNOWN");
    if (!selected.efforts.includes(assignment.effort)) return failure("CURRENT_EFFORT_UNAVAILABLE");
  } else if (eligible.length === 0) {
    if (visibleSelectable.some((variant) => variant.efforts === null)) return failure("CURRENT_EFFORT_UNKNOWN");
    return failure("CURRENT_EFFORT_UNAVAILABLE");
  } else if (eligible.length === 1) {
    selected = eligible[0];
    if (context.variantRule !== null) return failure("VARIANT_RULE_CONTRADICTION");
  } else {
    const rule = context.variantRule;
    if (!own(rule, ["adapterContractSha256", "ruleSha256", "evidenceSha256", "canonicalModelId", "selectedModelId"])
      || rule.adapterContractSha256 !== assignment.adapterContractSha256 || !validSha(rule.ruleSha256)
      || !validSha(rule.evidenceSha256) || !validModelId(rule.canonicalModelId) || !validModelId(rule.selectedModelId)) {
      return failure("VARIANT_AMBIGUOUS");
    }
    if (eligible.some((variant) => variant.canonicalModelId === null || variant.canonicalModelId !== rule.canonicalModelId)) {
      return failure("VARIANT_RULE_CONTRADICTION");
    }
    const matches = eligible.filter((variant) => variant.modelId === rule.selectedModelId);
    if (matches.length !== 1) return failure("VARIANT_AMBIGUOUS");
    selected = matches[0];
    variantRuleSha256 = rule.ruleSha256;
  }
  if (hard.deniedModelIds.includes(selected.modelId)) return failure("HARD_MODEL_INELIGIBLE");

  const compatibility = context.compatibility;
  if (!own(compatibility, ["runner", "taskRoute", "role", "effort", "modelId", "evidenceSha256"])
    || compatibility.runner !== assignment.runner || compatibility.taskRoute !== assignment.taskRoute
    || compatibility.role !== assignment.role || compatibility.effort !== assignment.effort
    || compatibility.modelId !== selected.modelId || !validSha(compatibility.evidenceSha256)
    || !Object.hasOwn(selected.compatibilityBySlotSha256, slot)
    || selected.compatibilityBySlotSha256[slot] !== compatibility.evidenceSha256) return failure("COMPATIBILITY_UNVERIFIED", true);

  const watermarkAfter = versionMaximum(assignment.minimumVersion, checkedWatermark.version, record.version);
  const unassignedFamilyIds = [...new Set(discovery.records.map((item) => item.familyId)
    .filter((family) => family !== assignment.familyId))].sort();
  const variantSelectionEvidenceSha256 = digest({ releaseId: record.releaseId, modelId: selected.modelId,
    canonicalModelId: selected.canonicalModelId, groupingEvidenceSha256: record.groupingEvidenceSha256,
    aliasEvidenceSha256: selected.aliasEvidenceSha256, ruleSha256: variantRuleSha256 });
  const value = {
    runner: assignment.runner, taskRoute: assignment.taskRoute, role: assignment.role, effort: assignment.effort,
    familyId: assignment.familyId, releaseId: record.releaseId, version: [...record.version], selectedModelId: selected.modelId,
    canonicalModelId: selected.canonicalModelId, selection, pinDecisionSha256: pinDigest,
    adapterContractSha256: assignment.adapterContractSha256, discoverySha256: digest(discovery),
    rawEvidenceSha256: discovery.rawEvidenceSha256, coverageEvidenceSha256: discovery.coverageEvidenceSha256,
    groupingEvidenceSha256: record.groupingEvidenceSha256, variantSelectionEvidenceSha256,
    aliasEvidenceSha256: selected.aliasEvidenceSha256, capabilityEvidenceSha256: selected.capabilityEvidenceSha256,
    compatibilityEvidenceSha256: compatibility.evidenceSha256, hardEligibilityEvidenceSha256: hard.evidenceSha256,
    observedAt: discovery.observedAt, expiresAt: discovery.expiresAt,
    watermarkBefore: checkedWatermark.version, watermarkAfter, unassignedFamilyIds,
    authorityCeiling: "pure-selection-proposal",
  };
  return success("MODEL-FAMILY-SELECTION-PROPOSED", value);
}
