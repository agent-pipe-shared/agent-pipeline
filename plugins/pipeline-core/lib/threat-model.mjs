// SPDX-License-Identifier: SUL-1.0
// CYB-4A -- pure, closed threat-model applicability and identity boundary.
import { createHash } from "node:crypto";

export const THREAT_MODEL_SCHEMA = "pipeline.threat-model.v1";
export const THREAT_MODEL_APPLICABILITY = Object.freeze(["required", "not-applicable", "deferred", "incomplete", "invalid"]);
const RISK_INPUTS = Object.freeze(["assurance", "exposure", "data", "privilege", "dependencies", "architecture", "deployment", "agentEgress"]);
const own = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
const text = (value) => typeof value === "string" && value.trim() !== "";
const stableId = (kind, value) => `${kind}-${createHash("sha256").update(`${kind}\n${value}`).digest("hex").slice(0, 16)}`;

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
