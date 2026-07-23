// SPDX-License-Identifier: SUL-1.0
/**
 * Route-receipt validation is deliberately provider-neutral. It records the
 * requested route separately from an observed effective model and never turns
 * an alias or an agent self-report into attestation.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgainstSchema } from "./schema-lite.mjs";
import { expectedProviderForRunner, projectRunnerAssignment, validateDirectRoute } from "./routing-projection.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, "..", "scripts", "route-receipt.schema.json");
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OBJECT_ID = /^[a-f0-9]{40,64}$/;
const EFFORTS = ["low", "medium", "high", "xhigh", "max", "not-applicable"];
const PROVIDERS = ["anthropic", "openai"];
const RUNNERS = ["claude", "codex"];
const P3B_DIRECT_TERRA_RECEIPT_ADAPTER_SCHEMA = "pipeline.route-receipt-adapter.p3b-direct-terra.v1";

export const P3B_DIRECT_TERRA_RECEIPT_ADAPTER = Object.freeze({
  schema: P3B_DIRECT_TERRA_RECEIPT_ADAPTER_SCHEMA,
});

export function loadRouteReceiptSchema(path = SCHEMA_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sameSelector(left, right) {
  return left?.kind === right?.kind && left?.value === right?.value;
}

function exactKeys(value, names) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === names.length
    && names.every((name) => Object.prototype.hasOwnProperty.call(value, name));
}

function isDuty(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function isWorktype(value) {
  return value === null || (typeof value === "string" && SAFE_ID.test(value));
}

function isModelId(value) {
  return typeof value === "string" && MODEL_ID.test(value);
}

function isObservedModelSelector(value) {
  return exactKeys(value, ["kind", "value"])
    && value.kind === "model-id"
    && isModelId(value.value);
}

function isDispatchBinding(value) {
  return exactKeys(value, ["dispatchId", "queueRevision", "candidateCommit", "candidateTree", "requestedDuty", "requestedWorktype"])
    && SAFE_ID.test(value.dispatchId ?? "")
    && Number.isSafeInteger(value.queueRevision) && value.queueRevision >= 0
    && GIT_OBJECT_ID.test(value.candidateCommit ?? "")
    && GIT_OBJECT_ID.test(value.candidateTree ?? "")
    && isDuty(value.requestedDuty)
    && isWorktype(value.requestedWorktype);
}

function isTrustedEvidenceBinding(value) {
  return exactKeys(value, [
    "source",
    "sha256",
    "resultSha256",
    "effectiveDuty",
    "effectiveWorktype",
    "effectiveRunner",
    "effectiveSelector",
    "effectiveProvider",
    "effectiveModelId",
    "effectiveEffort",
  ])
    && ["host", "cli"].includes(value.source)
    && SHA256.test(value.sha256 ?? "")
    && SHA256.test(value.resultSha256 ?? "")
    && isDuty(value.effectiveDuty)
    && isWorktype(value.effectiveWorktype)
    && RUNNERS.includes(value.effectiveRunner)
    && isObservedModelSelector(value.effectiveSelector)
    && PROVIDERS.includes(value.effectiveProvider)
    && isModelId(value.effectiveModelId)
    && EFFORTS.includes(value.effectiveEffort);
}

function sameDispatchBinding(receipt, binding) {
  return receipt.dispatchId === binding.dispatchId
    && receipt.queueRevision === binding.queueRevision
    && receipt.candidateCommit === binding.candidateCommit
    && receipt.candidateTree === binding.candidateTree
    && receipt.requestedDuty === binding.requestedDuty
    && receipt.requestedWorktype === binding.requestedWorktype;
}

function sameEvidenceBinding(receiptEvidence, trustedEvidence) {
  return receiptEvidence?.source === trustedEvidence.source
    && receiptEvidence?.sha256 === trustedEvidence.sha256;
}

function sameObservedEffectiveRoute(receipt, trustedEvidence) {
  return sameEvidenceBinding(receipt.resolutionEvidence, trustedEvidence)
    && receipt.resultSha256 === trustedEvidence.resultSha256
    && receipt.effectiveDuty === trustedEvidence.effectiveDuty
    && receipt.effectiveWorktype === trustedEvidence.effectiveWorktype
    && receipt.effectiveRunner === trustedEvidence.effectiveRunner
    && sameSelector(receipt.effectiveSelector, trustedEvidence.effectiveSelector)
    && receipt.effectiveProvider === trustedEvidence.effectiveProvider
    && receipt.effectiveModelId === trustedEvidence.effectiveModelId
    && receipt.effectiveEffort === trustedEvidence.effectiveEffort;
}

function isTerraAlias(route) {
  return route.selector.kind === "alias" && route.selector.value.toLowerCase() === "terra";
}

function isP3bDirectTerraAdapter(adapter) {
  return exactKeys(adapter, ["schema"])
    && adapter.schema === P3B_DIRECT_TERRA_RECEIPT_ADAPTER_SCHEMA;
}

function isP3bDirectTerraRoute(route) {
  return exactKeys(route, ["runner", "selector", "effort", "unavailability", "evidenceRequirement"])
    && route.runner === "codex"
    && sameSelector(route.selector, { kind: "model-id", value: "gpt-5.6-terra" })
    && route.effort === "xhigh"
    && route.unavailability === "defer"
    && route.evidenceRequirement === "dispatch-receipt";
}

function expectedConfiguredCodexAlias(route) {
  if (route.runner !== "codex" || route.selector.kind !== "alias" || isTerraAlias(route)) return null;
  return projectRunnerAssignment(route.runner, {
    model: route.selector.value,
    effort: route.effort,
  });
}

function looksLikeSchema(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && typeof value.$schema === "string" && typeof value.type === "string";
}

function receiptSchema(dispatchBinding, trustedEvidence, schema) {
  // The former third optional schema parameter remains structurally supported,
  // but it supplies neither of the required trust bindings.
  if (looksLikeSchema(dispatchBinding)) return dispatchBinding;
  if (looksLikeSchema(trustedEvidence)) return trustedEvidence;
  return schema ?? loadRouteReceiptSchema();
}

/**
 * Validate a receipt against an exact projected route and caller-held trust
 * bindings. Passing the historical third schema argument alone can never
 * attest a route because it cannot stand in for either binding.
 */
export function validateRouteReceipt(receipt, projectedRoute, dispatchBinding, trustedEvidence, schema, adapter) {
  let route;
  let structural;
  const p3bDirectTerra = isP3bDirectTerraAdapter(adapter) && isP3bDirectTerraRoute(projectedRoute);
  try {
    route = validateDirectRoute(projectedRoute);
    if (route?.ok !== true) {
      if (!p3bDirectTerra) return { ok: false, reason: "route" };
      route = { ok: true, route: { ...projectedRoute } };
    }
    structural = validateAgainstSchema(receipt, receiptSchema(dispatchBinding, trustedEvidence, schema));
  } catch {
    return { ok: false, reason: "schema" };
  }
  if (structural?.valid !== true) return { ok: false, reason: "schema" };
  if (!SAFE_ID.test(receipt.dispatchId ?? "")
    || !Number.isSafeInteger(receipt.queueRevision) || receipt.queueRevision < 0
    || !GIT_OBJECT_ID.test(receipt.candidateCommit ?? "")
    || !GIT_OBJECT_ID.test(receipt.candidateTree ?? "")
    || !SHA256.test(receipt.resultSha256 ?? "")
    || receipt.requestedRunner !== route.route.runner
    || receipt.requestedProvider !== expectedProviderForRunner(route.route.runner)
    || !sameSelector(receipt.requestedSelector, route.route.selector)
    || receipt.requestedEffort !== route.route.effort) {
    return { ok: false, reason: "requested-route-drift" };
  }
  if (receipt.effectiveRouteStatus !== "attested" || receipt.attestationAvailable !== true) {
    return { ok: false, reason: "unattested" };
  }
  if (!isDispatchBinding(dispatchBinding) || !isTrustedEvidenceBinding(trustedEvidence)) {
    return { ok: false, reason: "missing-trusted-binding" };
  }
  if (!sameDispatchBinding(receipt, dispatchBinding)
    || !sameObservedEffectiveRoute(receipt, trustedEvidence)) {
    return { ok: false, reason: "trusted-binding-mismatch" };
  }
  if (receipt.effectiveDuty !== receipt.requestedDuty
    || receipt.effectiveWorktype !== receipt.requestedWorktype
    || receipt.effectiveRunner !== receipt.requestedRunner
    || receipt.effectiveRunner !== route.route.runner
    || receipt.effectiveProvider !== receipt.requestedProvider
    || receipt.effectiveProvider !== expectedProviderForRunner(route.route.runner)
    || receipt.effectiveEffort !== receipt.requestedEffort
    || receipt.effectiveEffort !== route.route.effort) {
    return { ok: false, reason: "effective-route-drift" };
  }
  if (receipt.effectiveSelector.kind !== "model-id"
    || receipt.effectiveSelector.value !== receipt.effectiveModelId) {
    return { ok: false, reason: "effective-model-identity-drift" };
  }
  if (route.route.selector.kind === "model-id"
    && receipt.effectiveModelId !== route.route.selector.value) {
    return { ok: false, reason: "requested-model-identity-drift" };
  }
  if (p3bDirectTerra && trustedEvidence.source !== "host") {
    return { ok: false, reason: "terra-requires-host-evidence" };
  }
  if (isTerraAlias(route.route) && trustedEvidence.source !== "host") {
    return { ok: false, reason: "terra-requires-host-evidence" };
  }
  let configuredAlias;
  try {
    configuredAlias = expectedConfiguredCodexAlias(route.route);
  } catch {
    return { ok: false, reason: "unsupported-codex-alias" };
  }
  if (configuredAlias !== null
    && (receipt.effectiveModelId !== configuredAlias.model
      || receipt.effectiveEffort !== configuredAlias.effort)) {
    return { ok: false, reason: "configured-codex-alias-route-drift" };
  }
  return { ok: true, effectiveRouteStatus: "attested" };
}
