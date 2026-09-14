#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";

export const VERIFY_SELECTION_SCHEMA = "pipeline.verify-selection.v1";
export const VERIFY_SELECTION_MODES = Object.freeze(["work", "critic", "push", "candidate", "release"]);
const FULL_ONLY_MODES = new Set(["release"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function digestVerifySelection(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function normalizePaths(paths) {
  if (!Array.isArray(paths)) throw new TypeError("VERIFY-SELECTION-PATHS");
  return [...new Set(paths.map((path) => {
    if (typeof path !== "string") throw new TypeError("VERIFY-SELECTION-PATH");
    const normalized = path.replaceAll("\\", "/").replace(/^\.\//u, "");
    if (normalized === "" || normalized.startsWith("/") || normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
      throw new TypeError("VERIFY-SELECTION-PATH");
    }
    return normalized;
  }))].sort();
}

function matches(pattern, path) {
  if (pattern === "**") return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return path.startsWith(`${prefix}/`) && !path.slice(prefix.length + 1).includes("/");
  }
  return path === pattern;
}

// A narrower matched path owns that path's test selection.  This lets a
// policy retain one conservative catch-all implementation area while naming a
// reviewed, smaller area for a well-understood recovery corridor.  Equal
// specificity remains additive: two equally specific contracts may both be
// required, but a catch-all never silently turns a classified local change
// back into a full run.
function specificity(pattern) {
  return pattern.replaceAll("**", "").replaceAll("*", "").length;
}

function normalizePolicy(policy, registeredIds) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy) || policy.schema !== VERIFY_SELECTION_SCHEMA) {
    throw new TypeError("VERIFY-SELECTION-POLICY");
  }
  const baseline = [...new Set(policy.baseline ?? [])].sort();
  if (!baseline.every((id) => ID.test(id) && registeredIds.has(id))) throw new TypeError("VERIFY-SELECTION-BASELINE");
  if (!Array.isArray(policy.areas) || policy.areas.length === 0) throw new TypeError("VERIFY-SELECTION-AREAS");
  const areaIds = new Set();
  const coveredSuites = new Set(baseline);
  const areas = policy.areas.map((area) => {
    if (!area || typeof area !== "object" || Array.isArray(area) || !ID.test(area.id) || areaIds.has(area.id)) throw new TypeError("VERIFY-SELECTION-AREA");
    areaIds.add(area.id);
    const paths = normalizePaths(area.paths);
    const suites = [...new Set(area.suites ?? [])].sort();
    if (paths.length === 0 || suites.length === 0 || !suites.every((id) => ID.test(id) && registeredIds.has(id))) throw new TypeError("VERIFY-SELECTION-AREA");
    suites.forEach((id) => coveredSuites.add(id));
    return { id: area.id, paths, suites };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return { schema: VERIFY_SELECTION_SCHEMA, baseline, areas, coveredSuites };
}

export function planVerifySelection({ mode, baseCommit = null, candidateCommit, changedPaths = null, registeredSuiteIds, policy, forceFullReason = null }) {
  if (!VERIFY_SELECTION_MODES.includes(mode) || !Array.isArray(registeredSuiteIds) || registeredSuiteIds.length === 0) throw new TypeError("VERIFY-SELECTION-INPUT");
  const registered = [...new Set(registeredSuiteIds)].sort();
  if (registered.length !== registeredSuiteIds.length || !registered.every((id) => ID.test(id))) throw new TypeError("VERIFY-SELECTION-REGISTRY");
  const registeredIds = new Set(registered);
  const normalizedPolicy = normalizePolicy(policy, registeredIds);
  const normalizedChanges = changedPaths === null ? null : normalizePaths(changedPaths);
  let fallbackReason = typeof forceFullReason === "string" && forceFullReason !== "" ? forceFullReason : null;
  if (FULL_ONLY_MODES.has(mode)) fallbackReason = "full-boundary";
  else if (fallbackReason === null) {
    if (typeof baseCommit !== "string" || baseCommit === "" || typeof candidateCommit !== "string" || candidateCommit === "") fallbackReason = "missing-binding";
    else if (baseCommit === candidateCommit) fallbackReason = "invalid-base";
    else if (normalizedChanges === null) fallbackReason = "changed-paths-unavailable";
    else if (normalizedPolicy.coveredSuites.size !== registered.length) fallbackReason = "unclassified-suite";
  }

  const selected = new Set(normalizedPolicy.baseline);
  const matchedAreas = new Set();
  const unmatchedPaths = [];
  if (normalizedChanges !== null) {
    for (const path of normalizedChanges) {
      const matchesForPath = normalizedPolicy.areas.filter((area) => area.paths.some((pattern) => matches(pattern, path)));
      if (matchesForPath.length === 0) unmatchedPaths.push(path);
      const strongest = Math.max(...matchesForPath.flatMap((area) => area.paths
        .filter((pattern) => matches(pattern, path)).map(specificity)));
      for (const area of matchesForPath.filter((area) => area.paths
        .filter((pattern) => matches(pattern, path)).some((pattern) => specificity(pattern) === strongest))) {
        matchedAreas.add(area.id);
        area.suites.forEach((id) => selected.add(id));
      }
    }
    if (fallbackReason === null && unmatchedPaths.length > 0) fallbackReason = "unclassified-change";
  }
  if (fallbackReason !== null) registered.forEach((id) => selected.add(id));
  const selectedSuiteIds = [...selected].sort();
  const omittedSuiteIds = registered.filter((id) => !selected.has(id));
  const rule = { schema: normalizedPolicy.schema, baseline: normalizedPolicy.baseline, areas: normalizedPolicy.areas };
  const result = {
    schema: VERIFY_SELECTION_SCHEMA,
    mode,
    execution: fallbackReason === null ? "impacted" : "full",
    baseCommit,
    candidateCommit,
    changedPaths: normalizedChanges,
    registeredSuiteIds: registered,
    selectedSuiteIds,
    omittedSuiteIds,
    matchedAreaIds: [...matchedAreas].sort(),
    unmatchedPaths,
    fallbackReason,
    ruleSha256: digestVerifySelection(rule),
    changedInputSha256: digestVerifySelection({ baseCommit, candidateCommit, changedPaths: normalizedChanges }),
  };
  return Object.freeze({ ...result, selectionSha256: digestVerifySelection(result) });
}

export function validateVerifySelection(selection) {
  const keys = ["schema", "mode", "execution", "baseCommit", "candidateCommit", "changedPaths", "registeredSuiteIds", "selectedSuiteIds", "omittedSuiteIds", "matchedAreaIds", "unmatchedPaths", "fallbackReason", "ruleSha256", "changedInputSha256", "selectionSha256"];
  if (!selection || typeof selection !== "object" || Array.isArray(selection)
    || Object.keys(selection).length !== keys.length || Object.keys(selection).some((key) => !keys.includes(key))
    || selection.schema !== VERIFY_SELECTION_SCHEMA || !VERIFY_SELECTION_MODES.includes(selection.mode)
    || !["impacted", "full"].includes(selection.execution) || typeof selection.candidateCommit !== "string"
    || !Array.isArray(selection.registeredSuiteIds) || !Array.isArray(selection.selectedSuiteIds) || !Array.isArray(selection.omittedSuiteIds)
    || !Array.isArray(selection.matchedAreaIds) || !Array.isArray(selection.unmatchedPaths)
    || !/^[a-f0-9]{64}$/u.test(selection.ruleSha256) || !/^[a-f0-9]{64}$/u.test(selection.changedInputSha256)
    || !/^[a-f0-9]{64}$/u.test(selection.selectionSha256)) return false;
  const sortedUniqueIds = (values) => values.every((value, index) => ID.test(value) && (index === 0 || values[index - 1] < value));
  if (![selection.registeredSuiteIds, selection.selectedSuiteIds, selection.omittedSuiteIds, selection.matchedAreaIds].every(sortedUniqueIds)) return false;
  const selected = new Set(selection.selectedSuiteIds);
  const omitted = new Set(selection.omittedSuiteIds);
  if (selection.registeredSuiteIds.some((id) => selected.has(id) === omitted.has(id))) return false;
  if (selection.selectedSuiteIds.some((id) => !selection.registeredSuiteIds.includes(id)) || selection.omittedSuiteIds.some((id) => !selection.registeredSuiteIds.includes(id))) return false;
  if (selection.execution === "full" && selection.omittedSuiteIds.length !== 0) return false;
  if (selection.execution === "impacted" && selection.fallbackReason !== null) return false;
  if (selection.mode === "release" && selection.execution !== "full") return false;
  const { selectionSha256, ...body } = selection;
  return digestVerifySelection(body) === selectionSha256;
}

export function verifyEvidenceSatisfiesBoundary(evidence, boundary) {
  const selection = evidence?.selection;
  if (!validateVerifySelection(selection) || selection.candidateCommit !== evidence?.commit || evidence?.exitCode !== 0) return false;
  if (boundary === "release") return selection.mode === "release" && selection.execution === "full" && selection.omittedSuiteIds.length === 0;
  const completeFallback = selection.execution === "full" && selection.omittedSuiteIds.length === 0;
  const classifiedImpact = selection.unmatchedPaths.length === 0;
  if (boundary === "push") return selection.mode === "push" && (classifiedImpact || completeFallback);
  if (boundary === "critic") return selection.mode === "critic" && (classifiedImpact || completeFallback);
  if (boundary === "candidate") return selection.mode === "candidate" && (classifiedImpact || completeFallback);
  return selection.mode === "work" && (classifiedImpact || completeFallback);
}
