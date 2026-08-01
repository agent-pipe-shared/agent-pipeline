// SPDX-License-Identifier: SUL-1.0
// CYB-4A -- pure, closed threat-model applicability and identity boundary.
import { createHash } from "node:crypto";

export const THREAT_MODEL_SCHEMA = "pipeline.threat-model.v1";
export const SECURITY_REQUIREMENT_SCHEMA = "pipeline.security-requirement.v1";
export const THREAT_MODEL_APPLICABILITY = Object.freeze(["required", "not-applicable", "deferred", "incomplete", "invalid"]);
const RISK_INPUTS = Object.freeze(["assurance", "exposure", "data", "privilege", "dependencies", "architecture", "deployment", "agentEgress"]);
const own = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
const text = (value) => typeof value === "string" && value.trim() !== "";
const stableId = (kind, value) => `${kind}-${createHash("sha256").update(`${kind}\n${value}`).digest("hex").slice(0, 16)}`;

/** Closed machine authority: candidate and effective policy are inseparable. */
export function validateThreatModel(model) {
  if (!own(model, ["schema", "candidate", "policyRevision", "classification", "entities", "lifecycle"]) || model.schema !== THREAT_MODEL_SCHEMA || !own(model.candidate, ["commit", "tree"]) || !text(model.candidate.commit) || !text(model.candidate.tree) || !text(model.policyRevision) || !["public", "private"].includes(model.classification) || !Array.isArray(model.entities) || !["draft", "proposed", "approved", "implementing", "verified", "accepted-risk", "superseded", "retired"].includes(model.lifecycle)) return { valid: false, code: "THREAT-MODEL-INVALID" };
  return { valid: true };
}

/** Requirement proposals may link obligations, but cannot grant risk authority. */
export function validateSecurityRequirement(requirement) {
  if (!own(requirement, ["schema", "id", "candidate", "policyRevision", "links", "state"]) || requirement.schema !== SECURITY_REQUIREMENT_SCHEMA || !text(requirement.id) || !own(requirement.candidate, ["commit", "tree"]) || !text(requirement.candidate.commit) || !text(requirement.candidate.tree) || !text(requirement.policyRevision) || !Array.isArray(requirement.links) || !requirement.links.every((link) => own(link, ["kind", "id"]) && ["threat", "baseline", "test", "evidence"].includes(link.kind) && text(link.id)) || !["draft", "proposed", "implementing", "verified", "superseded", "retired"].includes(requirement.state)) return { valid: false, code: "SECURITY-REQUIREMENT-INVALID" };
  return { valid: true };
}

/** Missing observation never becomes a silent exemption. Input stays pure and closed. */
export function evaluateThreatModelApplicability(input) {
  if (!own(input, ["applicability", "riskInputs"]) || !["required", "not-applicable"].includes(input.applicability) || !own(input.riskInputs, RISK_INPUTS) || !RISK_INPUTS.every((key) => typeof input.riskInputs[key] === "boolean")) return { state: "invalid", code: "THREAT-APPLICABILITY-INVALID" };
  if (input.applicability === "not-applicable" && RISK_INPUTS.some((key) => input.riskInputs[key])) return { state: "invalid", code: "THREAT-NOT-APPLICABLE-CONTRADICTED" };
  if (input.applicability === "not-applicable") return { state: "not-applicable", code: "THREAT-NOT-APPLICABLE" };
  if (RISK_INPUTS.some((key) => !input.riskInputs[key])) return { state: "incomplete", code: "THREAT-RISK-INPUT-MISSING" };
  return { state: "required", code: "THREAT-REQUIRED" };
}

/** Stable entity IDs depend only on declared kind and canonical source identity. */
export function createThreatEntityId(kind, canonicalSource) {
  if (!["asset", "boundary", "threat", "abuse-case", "requirement", "mitigation"].includes(kind) || !text(canonicalSource)) return { ok: false, code: "THREAT-ENTITY-INVALID" };
  return { ok: true, id: stableId(kind, canonicalSource) };
}

/** Resolve required controls to exactly one threat or baseline obligation. */
export function evaluateThreatTraceability(input) {
  if (!own(input, ["requirements", "links"]) || !Array.isArray(input.requirements) || !Array.isArray(input.links) || !input.requirements.every(text) || !input.links.every((link) => own(link, ["requirement", "subject", "kind"]) && text(link.requirement) && text(link.subject) && ["threat", "baseline"].includes(link.kind))) return { ok: false, code: "THREAT-TRACEABILITY-INVALID" };
  const missing = input.requirements.filter((requirement) => input.links.filter((link) => link.requirement === requirement).length !== 1);
  return missing.length === 0 ? { ok: true } : { ok: false, code: "THREAT-TRACEABILITY-MISSING", missing };
}

/** Material deltas target only linked subjects; no blanket approval or mutation occurs. */
export function evaluateThreatImpact(input) {
  if (!own(input, ["changedSubjects", "links"]) || !Array.isArray(input.changedSubjects) || !input.changedSubjects.every(text) || !Array.isArray(input.links) || !input.links.every((link) => own(link, ["subject", "requirement"]) && text(link.subject) && text(link.requirement))) return { state: "invalid", code: "THREAT-IMPACT-INVALID" };
  const affected = [...new Set(input.links.filter((link) => input.changedSubjects.includes(link.subject)).map((link) => link.requirement))].sort();
  return { state: affected.length === 0 ? "current" : "stale", code: affected.length === 0 ? "THREAT-IMPACT-NONE" : "THREAT-IMPACT-REVIEW", affected };
}

/** Named delivery boundaries fail closed when a required model is not current and approved. */
export function evaluateThreatBoundary(input) {
  if (!own(input, ["boundary", "applicability", "lifecycle", "fresh"]) || !text(input.boundary) || !THREAT_MODEL_APPLICABILITY.includes(input.applicability) || typeof input.fresh !== "boolean" || !text(input.lifecycle)) return { allowed: false, code: "THREAT-BOUNDARY-INVALID" };
  if (input.applicability === "not-applicable") return { allowed: true, code: "THREAT-BOUNDARY-NOT-APPLICABLE" };
  if (input.applicability !== "required") return { allowed: false, code: "THREAT-BOUNDARY-INCOMPLETE" };
  if (!input.fresh) return { allowed: false, code: "THREAT-BOUNDARY-STALE" };
  if (!['approved', 'implementing', 'verified', 'accepted-risk'].includes(input.lifecycle)) return { allowed: false, code: "THREAT-BOUNDARY-UNAPPROVED" };
  return { allowed: true, code: "THREAT-BOUNDARY-ALLOWED" };
}

/** Derive a safe public view; canonical authority and private coordinates stay untouched. */
export function exportThreatModelView(model) {
  if (!own(model, ["classification", "entities"]) || !["public", "private"].includes(model.classification) || !Array.isArray(model.entities) || !model.entities.every((entity) => own(entity, ["id", "name", "coordinate"]) && text(entity.id) && text(entity.name) && text(entity.coordinate))) return { ok: false, code: "THREAT-EXPORT-INVALID" };
  const redact = model.classification === "private";
  return { ok: true, authoritative: false, entities: model.entities.map((entity) => redact ? { id: entity.id, name: "redacted", coordinate: "redacted" } : { ...entity }) };
}

/** Migration remains a non-mutating observation until separately activated. */
export function previewThreatModelMigration({ hasCanonicalModel } = {}) {
  return { schema: "pipeline.threat-model-migration-preview.v1", status: hasCanonicalModel === true ? "current" : "incomplete", writes: [] };
}

/** Deterministic human view derived only from the validated machine authority. */
export function renderThreatModelView(model) {
  if (!validateThreatModel(model).valid) return { ok: false, code: "THREAT-VIEW-INVALID" };
  const names = model.entities.map((entity) => text(entity?.name) ? entity.name : entity?.id).filter(text).sort();
  return { ok: true, authoritative: false, text: `Threat model ${model.candidate.commit}\nPolicy ${model.policyRevision}\nEntities\n${names.join("\n")}` };
}
