// SPDX-License-Identifier: SUL-1.0
// CYB-4A -- pure, closed threat-model applicability and identity boundary.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateFeatureTopology } from "./feature-package-topology.mjs";
import { createPoApprovalIntent, verifyPoApprovalProof } from "./po-approval-proof.mjs";

export const THREAT_MODEL_SCHEMA = "pipeline.threat-model.v1";
export const SECURITY_REQUIREMENT_SCHEMA = "pipeline.security-requirement.v1";
export const THREAT_APPROVAL_RECEIPT_SCHEMA = "pipeline.threat-model-approval-receipt.v1";
export const THREAT_MODEL_APPLICABILITY = Object.freeze(["required", "not-applicable", "deferred", "incomplete", "invalid"]);
export const THREAT_ENTITY_KINDS = Object.freeze(["asset", "boundary", "threat", "abuse-case", "requirement", "mitigation"]);
const RISK_INPUTS = Object.freeze(["assurance", "exposure", "data", "privilege", "dependencies", "architecture", "deployment", "agentEgress"]);
const own = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
const text = (value) => typeof value === "string" && value.trim() !== "";
const OID = /^[a-f0-9]{40,64}$/u;
const CLOSED_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const stableId = (kind, value) => `${kind}-${createHash("sha256").update(`${kind}\n${value}`).digest("hex").slice(0, 16)}`;
const SAFE_ENTITY_LABEL = /^[a-z][a-z0-9-]{0,63}$/u;
const ENTITY_ID = new RegExp(`^(${THREAT_ENTITY_KINDS.join("|")})-[a-f0-9]{16}$`, "u");
const candidate = (value) => own(value, ["commit", "tree"]) && OID.test(value.commit) && OID.test(value.tree) && value.commit !== value.tree;
const entityId = (value, kind = null) => ENTITY_ID.test(value ?? "") && (kind === null || value.startsWith(`${kind}-`));
const safeEntity = (entity) => own(entity, ["id", "kind", "label", "relationships"]) && entityId(entity.id, entity.kind) && THREAT_ENTITY_KINDS.includes(entity.kind) && SAFE_ENTITY_LABEL.test(entity.label) && Array.isArray(entity.relationships) && entity.relationships.every((relationship) => entityId(relationship)) && new Set(entity.relationships).size === entity.relationships.length && !entity.relationships.includes(entity.id);
const canonicalJson = (value) => Array.isArray(value) ? `[${value.map(canonicalJson).join(",")}]` : value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}` : JSON.stringify(value);

/** Closed machine authority: candidate and effective policy are inseparable. */
export function validateThreatModel(model) {
  if (!own(model, ["schema", "candidate", "policyRevision", "classification", "entities", "lifecycle"]) || model.schema !== THREAT_MODEL_SCHEMA || !candidate(model.candidate) || !CLOSED_ID.test(model.policyRevision) || !["public", "private"].includes(model.classification) || !Array.isArray(model.entities) || !model.entities.every(safeEntity) || new Set(model.entities.map((entity) => entity.id)).size !== model.entities.length || !["draft", "proposed", "approved", "implementing", "verified", "accepted-risk", "superseded", "retired"].includes(model.lifecycle)) return { valid: false, code: "THREAT-MODEL-INVALID" };
  const ids = new Set(model.entities.map((entity) => entity.id));
  if (!model.entities.every((entity) => entity.relationships.every((relationship) => ids.has(relationship)))) return { valid: false, code: "THREAT-MODEL-RELATIONSHIP-INVALID" };
  return { valid: true };
}

/** Deterministic model identity lets an external approval receipt bind exact contents. */
export function threatModelDigest(model) {
  if (!validateThreatModel(model).valid) return { ok: false, code: "THREAT-MODEL-DIGEST-INVALID" };
  return { ok: true, digest: createHash("sha256").update(canonicalJson(model)).digest("hex") };
}

/** Requirement proposals may link obligations, but cannot grant risk authority. */
export function validateSecurityRequirement(requirement) {
  if (!own(requirement, ["schema", "id", "candidate", "policyRevision", "links", "state"]) || requirement.schema !== SECURITY_REQUIREMENT_SCHEMA || !CLOSED_ID.test(requirement.id) || !candidate(requirement.candidate) || !CLOSED_ID.test(requirement.policyRevision) || !Array.isArray(requirement.links) || !requirement.links.every((link) => own(link, ["kind", "id"]) && ["threat", "baseline", "test", "evidence"].includes(link.kind) && CLOSED_ID.test(link.id)) || new Set(requirement.links.map((link) => `${link.kind}\0${link.id}`)).size !== requirement.links.length || !["draft", "proposed", "implementing", "verified", "superseded", "retired"].includes(requirement.state)) return { valid: false, code: "SECURITY-REQUIREMENT-INVALID" };
  return { valid: true };
}

/**
 * This legacy decision record is never sufficient on its own: the delivery
 * boundary also requires a detached proof verified against a separately
 * configured external authority. It remains a closed candidate binding, not
 * an agent-authored lifecycle assertion.
 */
export function validateThreatApprovalReceipt(receipt) {
  if (!own(receipt, ["schema", "receiptId", "authority", "decision", "candidate", "policyRevision", "modelDigest"]) || receipt.schema !== THREAT_APPROVAL_RECEIPT_SCHEMA || !CLOSED_ID.test(receipt.receiptId) || !["human", "policy"].includes(receipt.authority) || !["approved", "accepted-risk", "not-applicable"].includes(receipt.decision) || !candidate(receipt.candidate) || !CLOSED_ID.test(receipt.policyRevision) || !/^[a-f0-9]{64}$/u.test(receipt.modelDigest)) return { valid: false, code: "THREAT-APPROVAL-RECEIPT-INVALID" };
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
  if (!THREAT_ENTITY_KINDS.includes(kind) || !text(canonicalSource)) return { ok: false, code: "THREAT-ENTITY-INVALID" };
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
  if (!own(input, ["model", "changedSubjects", "links"]) || !validateThreatModel(input.model).valid || !Array.isArray(input.changedSubjects) || !input.changedSubjects.every((subject) => CLOSED_ID.test(subject)) || new Set(input.changedSubjects).size !== input.changedSubjects.length || !Array.isArray(input.links) || !input.links.every((link) => own(link, ["subject", "requirement"]) && CLOSED_ID.test(link.subject) && CLOSED_ID.test(link.requirement)) || new Set(input.links.map((link) => `${link.subject}\0${link.requirement}`)).size !== input.links.length) return { state: "invalid", code: "THREAT-IMPACT-INVALID" };
  const affected = [...new Set(input.links.filter((link) => input.changedSubjects.includes(link.subject)).map((link) => link.requirement))].sort();
  const known = new Set(input.model.entities.map((entity) => entity.id));
  const newBoundaries = input.changedSubjects.filter((subject) => subject.startsWith("boundary-") && !known.has(subject)).sort();
  if (newBoundaries.length > 0) return { state: "stale", code: "THREAT-IMPACT-NEW-BOUNDARY", affected, newBoundaries };
  return { state: affected.length === 0 ? "current" : "stale", code: affected.length === 0 ? "THREAT-IMPACT-NONE" : "THREAT-IMPACT-REVIEW", affected, newBoundaries: [] };
}

/** Named delivery boundaries accept only a fresh model bound to an external approval receipt. */
export function evaluateThreatBoundary(input) {
  if (!own(input, ["boundary", "deliveryCandidate", "applicability", "model", "approvalReceipt", "approvalProof", "approvalAuthority", "fresh", "impact"]) || !CLOSED_ID.test(input.boundary) || !candidate(input.deliveryCandidate) || !THREAT_MODEL_APPLICABILITY.includes(input.applicability) || typeof input.fresh !== "boolean" || !own(input.impact, ["state", "code", "affected", "newBoundaries"]) || !["current", "stale"].includes(input.impact.state) || !Array.isArray(input.impact.affected) || !input.impact.affected.every((id) => CLOSED_ID.test(id)) || !Array.isArray(input.impact.newBoundaries) || !input.impact.newBoundaries.every((id) => entityId(id, "boundary"))) return { allowed: false, code: "THREAT-BOUNDARY-INVALID" };
  if (!validateThreatModel(input.model).valid) return { allowed: false, code: "THREAT-BOUNDARY-MODEL-INVALID" };
  if (!validateThreatApprovalReceipt(input.approvalReceipt).valid) return { allowed: false, code: "THREAT-BOUNDARY-RECEIPT-INVALID" };
  const receipt = input.approvalReceipt; const model = input.model;
  if (input.deliveryCandidate.commit !== model.candidate.commit || input.deliveryCandidate.tree !== model.candidate.tree) return { allowed: false, code: "THREAT-BOUNDARY-CANDIDATE-MISMATCH" };
  if (receipt.candidate.commit !== model.candidate.commit || receipt.candidate.tree !== model.candidate.tree || receipt.policyRevision !== model.policyRevision) return { allowed: false, code: "THREAT-BOUNDARY-RECEIPT-MISMATCH" };
  let intent;
  try { intent = createPoApprovalIntent({ kind: "threat-model", featureId: input.approvalProof?.intent?.value?.featureId, planSha256: input.approvalProof?.intent?.value?.planSha256, specSha256: input.approvalProof?.intent?.value?.specSha256, candidate: model.candidate, policyRevision: model.policyRevision, subjectSha256: threatModelDigest(model).digest, decision: receipt.decision }); } catch { return { allowed: false, code: "THREAT-BOUNDARY-AUTHORIZATION-INVALID" }; }
  if (intent.sha256 !== input.approvalProof?.intent?.sha256) return { allowed: false, code: "THREAT-BOUNDARY-AUTHORIZATION-MISMATCH" };
  const proof = verifyPoApprovalProof({ intent, trustPolicy: input.approvalAuthority, proof: input.approvalProof?.proof });
  if (!proof.verified) return { allowed: false, code: "THREAT-BOUNDARY-EXTERNAL-AUTHORITY-REQUIRED", cause: proof.code };
  if (input.impact.state !== "current") return { allowed: false, code: "THREAT-BOUNDARY-IMPACT-STALE", affected: input.impact.affected, newBoundaries: input.impact.newBoundaries };
  if (input.applicability === "not-applicable") return receipt.decision === "not-applicable" ? { allowed: true, code: "THREAT-BOUNDARY-NOT-APPLICABLE" } : { allowed: false, code: "THREAT-BOUNDARY-UNAPPROVED" };
  if (input.applicability !== "required") return { allowed: false, code: "THREAT-BOUNDARY-INCOMPLETE" };
  if (!input.fresh) return { allowed: false, code: "THREAT-BOUNDARY-STALE" };
  if (receipt.modelDigest !== threatModelDigest(model).digest) return { allowed: false, code: "THREAT-BOUNDARY-RECEIPT-MISMATCH" };
  if (!((receipt.decision === "approved" && ["approved", "implementing", "verified"].includes(model.lifecycle)) || (receipt.decision === "accepted-risk" && model.lifecycle === "accepted-risk"))) return { allowed: false, code: "THREAT-BOUNDARY-UNAPPROVED" };
  return { allowed: true, code: "THREAT-BOUNDARY-ALLOWED" };
}

/** Resolve exactly one topology-declared threat model; no path is inferred. */
export function discoverThreatModel(rootDir, { featureId = null } = {}) {
  const root = resolve(rootDir); const topology = validateFeatureTopology(root);
  if (!topology.ok) return { ok: false, code: "THREAT-TOPOLOGY-INVALID", findings: topology.findings };
  const matches = topology.receipts.filter((receipt) => featureId === null || receipt.featureId === featureId).flatMap((receipt) => {
    try { const manifest = JSON.parse(readFileSync(join(root, receipt.manifest), "utf8")); return manifest.artifacts.filter((artifact) => artifact.class === "threat-model").map((artifact) => ({ featureId: receipt.featureId, path: artifact.path, sha256: artifact.sha256 })); } catch { return []; }
  });
  if (matches.length !== 1) return { ok: false, code: matches.length === 0 ? "THREAT-NOT-REGISTERED" : "THREAT-AMBIGUOUS-REGISTRATION" };
  return { ok: true, artifact: matches[0] };
}

/** Derive a safe public view; private disclosure stays outside canonical records. */
export function exportThreatModelView(model) {
  if (!validateThreatModel(model).valid) return { ok: false, code: "THREAT-EXPORT-INVALID" };
  if (model.classification === "private") return { ok: true, authoritative: false, classification: "private", entities: [] };
  return { ok: true, authoritative: false, classification: "public", entities: model.entities.map((entity) => ({ id: entity.id, kind: entity.kind, label: entity.label })) };
}

/** Migration remains a non-mutating observation until separately activated. */
export function previewThreatModelMigration({ hasCanonicalModel } = {}) {
  return { schema: "pipeline.threat-model-migration-preview.v1", status: hasCanonicalModel === true ? "current" : "incomplete", writes: [] };
}

/** Deterministic human view derived only from the validated machine authority. */
export function renderThreatModelView(model) {
  if (!validateThreatModel(model).valid) return { ok: false, code: "THREAT-VIEW-INVALID" };
  const names = model.entities.map((entity) => entity.label).sort();
  return { ok: true, authoritative: false, text: `Threat model ${model.candidate.commit}\nPolicy ${model.policyRevision}\nEntities\n${names.join("\n")}` };
}
