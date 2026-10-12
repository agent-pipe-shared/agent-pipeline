// SPDX-License-Identifier: SUL-1.0
// Shared declarative suite schema/loader. The harness and installed runtime use
// this one plugin-local implementation; loading it does not run Verify.
import {existsSync,readFileSync} from 'node:fs';
import {validateVerifyOwningControllerMetadata} from './verify-owning-controller-route.mjs';

export function validateDeclarativeVerifySuites(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "root must be an object" };
  }
  const allowedRootKeys = new Set(["schema", "suites"]);
  for (const key of Object.keys(data)) {
    if (!allowedRootKeys.has(key)) {
      return { ok: false, error: `unexpected root property "${key}"` };
    }
  }
  if (data.schema !== "pipeline.verify-suites.v1") {
    return { ok: false, error: `schema must be "pipeline.verify-suites.v1", got ${JSON.stringify(data.schema)}` };
  }
  if (!Array.isArray(data.suites)) {
    return { ok: false, error: "suites must be an array" };
  }
  for (let i = 0; i < data.suites.length; i++) {
    const suite = data.suites[i];
    if (!suite || typeof suite !== "object" || Array.isArray(suite)) {
      return { ok: false, error: `suites[${i}] must be an object` };
    }
    const allowedKeys = new Set(["name", "file", "caseCompletion", "durationMs", "invariantPinned", "nonOverlapNote", "owningController", "owningControllerSupport"]);
    for (const key of Object.keys(suite)) {
      if (!allowedKeys.has(key)) {
        return { ok: false, error: `suites[${i}] has unexpected property "${key}"` };
      }
    }
    const owningRoute = validateVerifyOwningControllerMetadata(suite);
    if (!owningRoute.ok) return { ok: false, error: `suites[${i}] ${owningRoute.error}` };
    if (typeof suite.name !== "string" || suite.name.length === 0) {
      return { ok: false, error: `suites[${i}].name must be a non-empty string` };
    }
    if (typeof suite.file !== "string" || suite.file.length === 0) {
      return { ok: false, error: `suites[${i}].file must be a non-empty string` };
    }
        if (suite.durationMs !== undefined && typeof suite.durationMs !== "number") {
      return { ok: false, error: `suites[${i}].durationMs must be a number` };
    }
    if (suite.invariantPinned !== undefined && (typeof suite.invariantPinned !== "string" || suite.invariantPinned.trim().length === 0)) {
      return { ok: false, error: `suites[${i}].invariantPinned must be a non-empty string` };
    }
    if (suite.nonOverlapNote !== undefined && (typeof suite.nonOverlapNote !== "string" || suite.nonOverlapNote.trim().length === 0)) {
      return { ok: false, error: `suites[${i}].nonOverlapNote must be a non-empty string` };
    }
    if (suite.caseCompletion !== undefined) {
      const cc = suite.caseCompletion;
      if (!cc || typeof cc !== "object" || Array.isArray(cc)) {
        return { ok: false, error: `suites[${i}].caseCompletion must be an object` };
      }
      const allowedCCKeys = new Set(["schema", "caseIds", "maxBytes"]);
      for (const key of Object.keys(cc)) {
        if (!allowedCCKeys.has(key)) {
          return { ok: false, error: `suites[${i}].caseCompletion has unexpected property "${key}"` };
        }
      }
      if (cc.schema !== "pipeline.verify-case-completion-policy.v1") {
        return { ok: false, error: `suites[${i}].caseCompletion.schema must be "pipeline.verify-case-completion-policy.v1"` };
      }
      if (!Array.isArray(cc.caseIds) || !cc.caseIds.every((id) => typeof id === "string")) {
        return { ok: false, error: `suites[${i}].caseCompletion.caseIds must be an array of strings` };
      }
      if (!Number.isSafeInteger(cc.maxBytes) || cc.maxBytes < 512) {
        return { ok: false, error: `suites[${i}].caseCompletion.maxBytes must be an integer >= 512` };
      }
    }
  }
  return { ok: true };
}

export function loadDeclarativeVerifySuites(declarativePath) {
  if (!existsSync(declarativePath)) {
    return { ok: true, exists: false, suites: [] };
  }
  let raw;
  try {
    raw = readFileSync(declarativePath, "utf8");
  } catch (error) {
    return { ok: false, exists: true, errorType: "READ-ERROR", error: `could not read ${declarativePath} (${error.code ?? error.message})` };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    return { ok: false, exists: true, errorType: "PARSE-ERROR", error: `could not parse ${declarativePath} (${error.message})` };
  }
  const validation = validateDeclarativeVerifySuites(data);
  if (!validation.ok) {
    return { ok: false, exists: true, errorType: "SCHEMA-ERROR", error: `${declarativePath} does not conform to pipeline.verify-suites.v1: ${validation.error}` };
  }
  return { ok: true, exists: true, suites: data.suites };
}
