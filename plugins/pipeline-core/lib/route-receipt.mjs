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
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OBJECT_ID = /^[a-f0-9]{40,64}$/;
const EFFORTS = ["low", "medium", "high", "xhigh", "max", "not-applicable"];
const PROVIDERS = ["anthropic", "openai"];
const RUNNERS = ["claude", "codex"];

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

function isSelector(value) {
  return exactKeys(value, ["kind", "value"])
    && ["alias", "model-id"].includes(value.kind)
    && typeof value.value === "string" && value.value.length > 0;
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
    && isSelector(value.effectiveSelector)
    && PROVIDERS.includes(value.effectiveProvider)
    && typeof value.effectiveModelId === "string" && value.effectiveModelId.length > 0
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

function expectedConfiguredFableModel(route) {
  if (!isFableAlias(route)) return null;
  try {
    const assignment = projectRunnerAssignment(route.runner, {
      model: route.selector.value,
      effort: route.effort,
    });
    return assignment.model === "gpt-5.6-sol" ? assignment.model : null;
  } catch {
    return null;
  }
}

function isTerraAlias(route) {
  return route.selector.kind === "alias" && route.selector.value.toLowerCase() === "terra";
}

function isFableAlias(route) {
  return route.selector.kind === "alias" && route.selector.value.toLowerCase() === "fable";
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
export function validateRouteReceipt(receipt, projectedRoute, dispatchBinding, trustedEvidence, schema) {
  let route;
  let structural;
  try {
    route = validateDirectRoute(projectedRoute);
    if (route?.ok !== true) return { ok: false, reason: "route" };
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
  if (isTerraAlias(route.route) && trustedEvidence.source !== "host") {
    return { ok: false, reason: "terra-requires-host-evidence" };
  }
  if (route.route.runner === "codex"
    && route.route.selector.kind === "alias"
    && !isTerraAlias(route.route)
    && !isFableAlias(route.route)) {
    return { ok: false, reason: "unsupported-codex-alias" };
  }
  const fableModel = expectedConfiguredFableModel(route.route);
  if (fableModel !== null
    && (trustedEvidence.effectiveModelId !== fableModel
      || trustedEvidence.effectiveEffort !== route.route.effort)) {
    return { ok: false, reason: "configured-fable-route-drift" };
  }
  return { ok: true, effectiveRouteStatus: "attested" };
}
