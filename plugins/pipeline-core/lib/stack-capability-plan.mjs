// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";

export const STACK_CAPABILITIES = Object.freeze(["cap.secrets", "cap.sca", "cap.sast", "cap.iac", "cap.container", "cap.ci-workflow", "cap.dast", "cap.fuzz", "cap.memsafety", "cap.authz", "cap.crypto", "cap.privacy", "cap.ai-agent"]);
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const oid = (value) => /^[a-f0-9]{40,64}$/u.test(value ?? "");

/** Builds an explainable, candidate-bound plan from observed (non-executable) inputs. */
export function buildStackCapabilityPlan(input) {
  if (!own(input, ["candidate", "observations", "policyRevision", "requirements"]) || !own(input.candidate, ["commit", "tree"]) || !oid(input.candidate.commit) || !oid(input.candidate.tree) || typeof input.policyRevision !== "string" || input.policyRevision === "" || !Array.isArray(input.observations) || !input.observations.every((item) => own(item, ["capability", "present"]) && STACK_CAPABILITIES.includes(item.capability) && typeof item.present === "boolean") || new Set(input.observations.map((item) => item.capability)).size !== input.observations.length || !Array.isArray(input.requirements) || !input.requirements.every((item) => own(item, ["capability", "required"]) && STACK_CAPABILITIES.includes(item.capability) && typeof item.required === "boolean") || new Set(input.requirements.map((item) => item.capability)).size !== input.requirements.length) return { ok: false, code: "STACK-PLAN-INVALID" };
  const observed = new Map(input.observations.map((item) => [item.capability, item.present]));
  const required = new Map(input.requirements.map((item) => [item.capability, item.required]));
  const entries = STACK_CAPABILITIES.map((capability) => {
    const needed = required.get(capability) === true;
    const present = observed.get(capability) === true;
    const status = needed && !present ? "required-unavailable" : needed ? "selected" : present ? "optional-selected" : "omitted";
    return { capability, status, reason: needed ? (present ? "policy-required-observed" : "policy-required-unavailable") : (present ? "observed-optional" : "not-required-not-observed") };
  });
  const digest = createHash("sha256").update(JSON.stringify({ candidate: input.candidate, policyRevision: input.policyRevision, entries })).digest("hex");
  return { ok: true, schema: "pipeline.stack-capability-plan.v1", candidate: structuredClone(input.candidate), policyRevision: input.policyRevision, entries, digest };
}

/** Required unavailable is a terminal block, never a silently green plan. */
export function evaluateStackCapabilityPlan(plan) {
  if (!plan || plan.ok !== true || !Array.isArray(plan.entries)) return { allowed: false, code: "STACK-PLAN-INVALID" };
  const unavailable = plan.entries.filter((entry) => entry.status === "required-unavailable").map((entry) => entry.capability);
  return unavailable.length === 0 ? { allowed: true, code: "STACK-PLAN-ALLOWED" } : { allowed: false, code: "STACK-REQUIRED-UNAVAILABLE", unavailable };
}
