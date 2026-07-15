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

function isDispatchBinding(value) {
  return exactKeys(value, ["dispatchId", "queueRevision", "candidateCommit", "candidateTree"])
    && SAFE_ID.test(value.dispatchId ?? "")
    && Number.isSafeInteger(value.queueRevision) && value.queueRevision >= 0
    && GIT_OBJECT_ID.test(value.candidateCommit ?? "")
    && GIT_OBJECT_ID.test(value.candidateTree ?? "");
}

function isTrustedEvidenceBinding(value) {
  return exactKeys(value, ["source", "sha256"])
    && ["host", "cli"].includes(value.source)
    && SHA256.test(value.sha256 ?? "");
}

function sameDispatchBinding(receipt, binding) {
  return receipt.dispatchId === binding.dispatchId
    && receipt.queueRevision === binding.queueRevision
    && receipt.candidateCommit === binding.candidateCommit
    && receipt.candidateTree === binding.candidateTree;
}

function sameEvidenceBinding(receiptEvidence, trustedEvidence) {
  return receiptEvidence?.source === trustedEvidence.source
    && receiptEvidence?.sha256 === trustedEvidence.sha256;
}

function expectedEffectiveModelId(route) {
  if (route.selector.kind === "model-id") return route.selector.value;
  if (isTerraAlias(route)) return "gpt-5.6-terra";
  try {
    return projectRunnerAssignment(route.runner, {
      model: route.selector.value,
      effort: route.effort,
    }).model;
  } catch {
    return null;
  }
}

function isTerraAlias(route) {
  return route.selector.kind === "alias" && route.selector.value.toLowerCase() === "terra";
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
  const route = validateDirectRoute(projectedRoute);
  const structural = validateAgainstSchema(receipt, receiptSchema(dispatchBinding, trustedEvidence, schema));
  if (!route.ok || !structural.valid) return { ok: false, reason: route.ok ? "schema" : "route" };
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
    || !sameEvidenceBinding(receipt.resolutionEvidence, trustedEvidence)) {
    return { ok: false, reason: "trusted-binding-mismatch" };
  }
  if (isTerraAlias(route.route) && trustedEvidence.source !== "host") {
    return { ok: false, reason: "terra-requires-host-evidence" };
  }
  if (receipt.effectiveProvider !== expectedProviderForRunner(route.route.runner)
    || receipt.effectiveModelId !== expectedEffectiveModelId(route.route)
    || receipt.effectiveEffort !== route.route.effort) {
    return { ok: false, reason: "effective-route-drift" };
  }
  return { ok: true, effectiveRouteStatus: "attested" };
}
