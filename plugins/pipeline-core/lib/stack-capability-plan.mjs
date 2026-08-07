// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { validateStackDiscovery } from "./stack-discovery.mjs";

export const STACK_CAPABILITIES = Object.freeze(["cap.secrets", "cap.sca", "cap.sast", "cap.iac", "cap.container", "cap.ci-workflow", "cap.dast", "cap.fuzz", "cap.memsafety", "cap.authz", "cap.crypto", "cap.privacy", "cap.ai-agent"]);
export const STACK_HIGH_RISK_CAPABILITIES = Object.freeze(["cap.dast", "cap.fuzz"]);
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const oid = (value) => /^[a-f0-9]{40,64}$/u.test(value ?? "");
const digest = (candidate, discoveryDigest, policyRevision, threatModelDigest, entries) => createHash("sha256").update(JSON.stringify({ candidate, discoveryDigest, policyRevision, threatModelDigest, entries })).digest("hex");
const threat = (value, candidate) => own(value, ["candidate", "digest"]) && own(value.candidate, ["commit", "tree"]) && value.candidate.commit === candidate.commit && value.candidate.tree === candidate.tree && /^[a-f0-9]{64}$/u.test(value.digest);
const entries = (value) => Array.isArray(value) && value.length === STACK_CAPABILITIES.length && value.every((entry) => own(entry, ["capability", "status", "reason"]) && STACK_CAPABILITIES.includes(entry.capability) && ["required-unavailable", "selected", "optional-selected", "omitted"].includes(entry.status) && typeof entry.reason === "string" && entry.reason !== "") && new Set(value.map((entry) => entry.capability)).size === value.length;

/** Builds an explainable, candidate-bound plan from observed (non-executable) inputs. */
export function buildStackCapabilityPlan(input) {
  if (!own(input, ["candidate", "discovery", "observations", "policyRevision", "threatModel", "requirements"]) || !own(input.candidate, ["commit", "tree"]) || !oid(input.candidate.commit) || !oid(input.candidate.tree) || input.candidate.commit === input.candidate.tree || !validateStackDiscovery(input.discovery).valid || JSON.stringify(input.candidate) !== JSON.stringify(input.discovery.candidate) || typeof input.policyRevision !== "string" || input.policyRevision === "" || !threat(input.threatModel, input.candidate) || !Array.isArray(input.observations) || !input.observations.every((item) => own(item, ["capability", "present"]) && STACK_CAPABILITIES.includes(item.capability) && typeof item.present === "boolean") || new Set(input.observations.map((item) => item.capability)).size !== input.observations.length || !Array.isArray(input.requirements) || !input.requirements.every((item) => own(item, ["capability", "required"]) && STACK_CAPABILITIES.includes(item.capability) && typeof item.required === "boolean") || new Set(input.requirements.map((item) => item.capability)).size !== input.requirements.length) return { ok: false, code: "STACK-PLAN-INVALID" };
  const observed = new Map(input.observations.map((item) => [item.capability, item.present]));
  const required = new Map(input.requirements.map((item) => [item.capability, item.required]));
  const entries = STACK_CAPABILITIES.map((capability) => {
    const needed = required.get(capability) === true;
    const present = observed.get(capability) === true;
    const status = needed && !present ? "required-unavailable" : needed ? "selected" : present ? "optional-selected" : "omitted";
    return { capability, status, reason: needed ? (present ? "policy-required-observed" : "policy-required-unavailable") : (present ? "observed-optional" : "not-required-not-observed") };
  });
  const planDigest = digest(input.candidate, input.discovery.digest, input.policyRevision, input.threatModel.digest, entries);
  return { ok: true, schema: "pipeline.stack-capability-plan.v1", candidate: structuredClone(input.candidate), discoveryDigest: input.discovery.digest, policyRevision: input.policyRevision, threatModelDigest: input.threatModel.digest, entries, digest: planDigest };
}

/** Only a complete, self-digesting plan can authorize a stack adapter exchange. */
export function validateStackCapabilityPlan(plan) {
  if (!own(plan, ["ok", "schema", "candidate", "discoveryDigest", "policyRevision", "threatModelDigest", "entries", "digest"]) || plan.ok !== true || plan.schema !== "pipeline.stack-capability-plan.v1" || !own(plan.candidate, ["commit", "tree"]) || !oid(plan.candidate.commit) || !oid(plan.candidate.tree) || plan.candidate.commit === plan.candidate.tree || !/^[a-f0-9]{64}$/u.test(plan.discoveryDigest) || typeof plan.policyRevision !== "string" || plan.policyRevision === "" || !/^[a-f0-9]{64}$/u.test(plan.threatModelDigest) || !entries(plan.entries) || !/^[a-f0-9]{64}$/u.test(plan.digest) || plan.digest !== digest(plan.candidate, plan.discoveryDigest, plan.policyRevision, plan.threatModelDigest, plan.entries)) return { valid: false, code: "STACK-PLAN-INVALID" };
  return { valid: true };
}

/** Required unavailable is a terminal block, never a silently green plan. */
export function evaluateStackCapabilityPlan(plan) {
  if (!validateStackCapabilityPlan(plan).valid) return { allowed: false, code: "STACK-PLAN-INVALID" };
  const unavailable = plan.entries.filter((entry) => entry.status === "required-unavailable").map((entry) => entry.capability);
  if (unavailable.length > 0) return { allowed: false, code: "STACK-REQUIRED-UNAVAILABLE", unavailable };
  const verification = plan.entries.filter((entry) => STACK_HIGH_RISK_CAPABILITIES.includes(entry.capability) && ["selected", "optional-selected"].includes(entry.status)).map((entry) => entry.capability);
  return verification.length === 0 ? { allowed: true, code: "STACK-PLAN-ALLOWED" } : { allowed: false, code: "STACK-VERIFICATION-REQUIRED", verification };
}
