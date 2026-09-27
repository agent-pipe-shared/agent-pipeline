// SPDX-License-Identifier: SUL-1.0
/** #9-owned, provider-neutral admission of one signed inherited ADR reference set. */
import { createHash } from "node:crypto";
import { canonical, verifyPoApprovalProof } from "./po-approval-proof.mjs";

export const ORGANIZATION_ARCHITECTURE_SOURCE_SCHEMA = "pipeline.organization-architecture-source.v1";
export const EFFECTIVE_ORGANIZATION_ARCHITECTURE_SOURCES_SCHEMA = "pipeline.effective-organization-architecture-sources.v1";
const SHA = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._-]{1,96}$/u;
const SOURCE_ID = /^[a-z][a-z0-9-]{2,63}$/u;
const MODULE = /^[a-z][a-z0-9-]{0,79}$/u;
const LAYERS = new Set(["organization", "team"]);
const CLASSES = new Set(["governed-default", "advisory"]);
const STATUSES = new Set(["accepted", "superseded"]);
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function validDecision(value) {
  const keys = ["id", "digest", "status", "moduleIds", "authorityClass"];
  if (Object.hasOwn(value ?? {}, "supersedes")) keys.push("supersedes");
  if (Object.hasOwn(value ?? {}, "conflictsWith")) keys.push("conflictsWith");
  return own(value, keys) && ID.test(value.id) && SHA.test(value.digest)
    && STATUSES.has(value.status) && CLASSES.has(value.authorityClass)
    && Array.isArray(value.moduleIds) && value.moduleIds.length > 0 && value.moduleIds.length <= 64
    && value.moduleIds.every((id) => typeof id === "string" && MODULE.test(id))
    && value.moduleIds.join("\0") === [...new Set(value.moduleIds)].sort().join("\0")
    && (!Object.hasOwn(value, "supersedes") || (ID.test(value.supersedes) && value.supersedes !== value.id))
    && (!Object.hasOwn(value, "conflictsWith") || (Array.isArray(value.conflictsWith)
      && value.conflictsWith.length > 0 && value.conflictsWith.length <= 64
      && value.conflictsWith.every((id) => ID.test(id) && id !== value.id)
      && value.conflictsWith.join("\0") === [...new Set(value.conflictsWith)].sort().join("\0")));
}

function validSource(source) {
  if (!own(source, ["schema", "sourceId", "layer", "observedAt", "expiresAt", "decisions"])
    || source.schema !== ORGANIZATION_ARCHITECTURE_SOURCE_SCHEMA || !SOURCE_ID.test(source.sourceId)
    || !LAYERS.has(source.layer) || !validDate(source.observedAt) || !validDate(source.expiresAt)
    || source.observedAt >= source.expiresAt || !Array.isArray(source.decisions)
    || source.decisions.length > 256 || !source.decisions.every(validDecision)) return false;
  const ids = source.decisions.map((decision) => decision.id);
  if (ids.join("\0") !== [...new Set(ids)].sort().join("\0")) return false;
  const byId = new Map(source.decisions.map((decision) => [decision.id, decision]));
  for (const decision of source.decisions) {
    if (decision.status === "accepted" && decision.supersedes) {
      const former = byId.get(decision.supersedes);
      if (!former || former.status !== "superseded") return false;
    }
    if (decision.status === "superseded"
      && !source.decisions.some((successor) => successor.status === "accepted"
        && successor.supersedes === decision.id)) return false;
  }
  return true;
}

/**
 * `trustAnchors` must come from independently configured authority, never from
 * the source/proof itself. A signed digest proves the admitted references are
 * unchanged; it does not prove the remote provider's model or private ADR prose.
 */
export function admitOrganizationArchitectureSource({ source, proof, trustAnchors, now } = {}) {
  if (!validSource(source)) return { ok: false, code: "ORG-ARCH-SOURCE-INVALID" };
  if (!validDate(now)) return { ok: false, code: "ORG-ARCH-CLOCK-INVALID" };
  if (now < source.observedAt || now > source.expiresAt) {
    return { ok: false, code: "ORG-ARCH-SOURCE-STALE" };
  }
  if (!Array.isArray(trustAnchors) || trustAnchors.length === 0 || trustAnchors.length > 16) {
    return { ok: false, code: "ORG-ARCH-TRUST-UNAVAILABLE" };
  }
  const sourceSha256 = digest(source);
  const verified = trustAnchors.some((trustPolicy) => verifyPoApprovalProof({
    intent: { sha256: sourceSha256 }, trustPolicy, proof,
  }).verified);
  if (!verified) return { ok: false, code: "ORG-ARCH-AUTHORITY-UNVERIFIED" };
  return { ok: true, code: "ORG-ARCH-SOURCE-ADMITTED", sourceId: source.sourceId,
    layer: source.layer, sourceSha256, expiresAt: source.expiresAt,
    decisions: source.decisions.filter((decision) => decision.status === "accepted")
      .map((decision) => ({ ...decision, moduleIds: [...decision.moduleIds] })) };
}

/**
 * Resolve #9's already trusted configuration. The caller must independently
 * validate that the descriptor set itself was PO-authorized; this function
 * verifies each source payload, not who chose mandatory vs optional sources.
 */
export function resolveOrganizationArchitectureSources({ configured, now } = {}) {
  if (!validDate(now) || !Array.isArray(configured) || configured.length > 16) {
    return { schema: EFFECTIVE_ORGANIZATION_ARCHITECTURE_SOURCES_SCHEMA,
      status: "blocked", code: "ORG-ARCH-CONFIGURATION-INVALID", decisions: [],
      sourceBindings: [], findings: [{ code: "configuration-invalid", sourceId: null }] };
  }
  const ids = new Set();
  const findings = [];
  const sourceBindings = [];
  const decisions = [];
  for (const item of configured) {
    if (!own(item, ["sourceId", "layer", "required", "source", "proof", "trustAnchors"])
      || !SOURCE_ID.test(item.sourceId) || !LAYERS.has(item.layer) || typeof item.required !== "boolean"
      || ids.has(item.sourceId)) {
      findings.push({ code: "configuration-invalid", sourceId: null });
      continue;
    }
    ids.add(item.sourceId);
    const admitted = admitOrganizationArchitectureSource({ source: item.source,
      proof: item.proof, trustAnchors: item.trustAnchors, now });
    if (!admitted.ok || admitted.sourceId !== item.sourceId || admitted.layer !== item.layer) {
      findings.push({ code: item.required ? "mandatory-source-unavailable" : "optional-source-unavailable",
        sourceId: item.sourceId });
      sourceBindings.push({ sourceId: item.sourceId, layer: item.layer, required: item.required,
        status: "unavailable" });
      continue;
    }
    sourceBindings.push({ sourceId: item.sourceId, layer: item.layer, required: item.required,
      status: "consumed", sourceSha256: admitted.sourceSha256, expiresAt: admitted.expiresAt });
    for (const decision of admitted.decisions) decisions.push({ ...decision,
      layer: item.layer, sourceId: item.sourceId, sourceSha256: admitted.sourceSha256 });
  }
  const byId = new Map();
  for (const decision of decisions) {
    const prior = byId.get(decision.id);
    if (prior && (prior.digest !== decision.digest || canonical(prior.moduleIds) !== canonical(decision.moduleIds)
      || prior.authorityClass !== decision.authorityClass)) {
      findings.push({ code: "inherited-decision-conflict", sourceId: decision.sourceId });
    } else if (!prior) byId.set(decision.id, decision);
  }
  for (const decision of decisions) {
    for (const otherId of decision.conflictsWith ?? []) {
      if (byId.has(otherId)) {
        findings.push({ code: "inherited-decision-conflict", sourceId: decision.sourceId });
      }
    }
  }
  const blocked = findings.some((item) => item.code !== "optional-source-unavailable");
  const status = blocked ? "blocked" : findings.length > 0 ? "advisory" : "ready";
  const orderedBindings = sourceBindings.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const orderedFindings = findings.sort((left, right) => (left.sourceId ?? "").localeCompare(right.sourceId ?? "")
    || left.code.localeCompare(right.code));
  return { schema: EFFECTIVE_ORGANIZATION_ARCHITECTURE_SOURCES_SCHEMA, status,
    code: status === "blocked" ? "ORG-ARCH-SOURCES-UNRESOLVED"
      : status === "advisory" ? "ORG-ARCH-SOURCES-OPTIONAL-UNAVAILABLE"
        : configured.length === 0 ? "ORG-ARCH-SOURCES-NONE" : "ORG-ARCH-SOURCES-READY",
    decisions: blocked ? [] : decisions.sort((left, right) => left.id.localeCompare(right.id)
      || left.sourceId.localeCompare(right.sourceId)), sourceBindings: orderedBindings,
    findings: orderedFindings };
}
