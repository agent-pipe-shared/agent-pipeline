/**
 * Route-receipt validation is deliberately provider-neutral. It records the
 * requested route separately from an observed effective model and never turns
 * an alias or an agent self-report into attestation.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgainstSchema } from "./schema-lite.mjs";
import { validateDirectRoute } from "./routing-projection.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, "..", "scripts", "route-receipt.schema.json");
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export function loadRouteReceiptSchema(path = SCHEMA_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sameSelector(left, right) {
  return left?.kind === right?.kind && left?.value === right?.value;
}

/**
 * Validate a receipt against the exact projected route. `host` and `cli` are
 * the only accepted evidence origins; an agent cannot self-attest a model.
 */
export function validateRouteReceipt(receipt, projectedRoute, schema = loadRouteReceiptSchema()) {
  const route = validateDirectRoute(projectedRoute);
  const structural = validateAgainstSchema(receipt, schema);
  if (!route.ok || !structural.valid) return { ok: false, reason: route.ok ? "schema" : "route" };
  if (!SAFE_ID.test(receipt.dispatchId ?? "")
    || !Number.isSafeInteger(receipt.queueRevision) || receipt.queueRevision < 0
    || !SHA256.test(receipt.resultSha256 ?? "")
    || receipt.requestedRunner !== route.route.runner
    || !sameSelector(receipt.requestedSelector, route.route.selector)
    || receipt.requestedEffort !== route.route.effort) {
    return { ok: false, reason: "requested-route-drift" };
  }
  if (receipt.effectiveRouteStatus === "attested") {
    if (receipt.attestationAvailable !== true
      || typeof receipt.resolvedModelId !== "string" || receipt.resolvedModelId.length === 0
      || receipt.resolutionEvidence === null
      || !["host", "cli"].includes(receipt.resolutionEvidence.source)
      || !SHA256.test(receipt.resolutionEvidence.sha256 ?? "")) {
      return { ok: false, reason: "attestation" };
    }
    return { ok: true, effectiveRouteStatus: "attested" };
  }
  if (receipt.effectiveRouteStatus === "unresolved-alias") {
    if (route.route.selector.kind !== "alias" || receipt.attestationAvailable !== false
      || receipt.resolvedModelId !== null || receipt.resolutionEvidence !== null) {
      return { ok: false, reason: "unresolved-alias" };
    }
    return { ok: true, effectiveRouteStatus: "unresolved-alias" };
  }
  if (receipt.effectiveRouteStatus === "unavailable") {
    if (receipt.attestationAvailable !== false || receipt.resolvedModelId !== null || receipt.resolutionEvidence !== null) {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, effectiveRouteStatus: "unavailable" };
  }
  return { ok: false, reason: "status" };
}
