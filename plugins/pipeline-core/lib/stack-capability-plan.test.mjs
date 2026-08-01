// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildStackCapabilityPlan, evaluateStackCapabilityPlan, STACK_CAPABILITIES } from "./stack-capability-plan.mjs";
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const observations = [];
const discovery = { ok: true, schema: "pipeline.stack-discovery.v1", candidate, observations, digest: createHash("sha256").update(JSON.stringify({ candidate, observations })).digest("hex") };
const input = { candidate, discovery, policyRevision: "policy-1", observations: STACK_CAPABILITIES.map((capability) => ({ capability, present: capability !== "cap.dast" && capability !== "cap.fuzz" })), requirements: [{ capability: "cap.sast", required: true }, { capability: "cap.dast", required: true }] };
const first = buildStackCapabilityPlan(input);
assert.deepEqual(first, buildStackCapabilityPlan(input));
assert.equal(first.entries.every((entry) => typeof entry.reason === "string" && entry.reason !== ""), true);
assert.deepEqual(evaluateStackCapabilityPlan(first), { allowed: false, code: "STACK-REQUIRED-UNAVAILABLE", unavailable: ["cap.dast"] });
assert.equal(buildStackCapabilityPlan({ ...input, observations: [{ capability: "cap.sast", present: "yes" }] }).code, "STACK-PLAN-INVALID");
assert.equal(buildStackCapabilityPlan({ ...input, requirements: [{ capability: "cap.sast", required: true }, { capability: "cap.sast", required: false }] }).code, "STACK-PLAN-INVALID");
assert.deepEqual(evaluateStackCapabilityPlan(buildStackCapabilityPlan({ ...input, requirements: [{ capability: "cap.sast", required: true }] })), { allowed: true, code: "STACK-PLAN-ALLOWED" });
assert.equal(buildStackCapabilityPlan({ ...input, discovery: { ...discovery, digest: "f".repeat(64) } }).code, "STACK-PLAN-INVALID");
assert.deepEqual(evaluateStackCapabilityPlan(buildStackCapabilityPlan({ ...input, observations: input.observations.map((entry) => entry.capability === "cap.fuzz" ? { ...entry, present: true } : entry), requirements: [{ capability: "cap.fuzz", required: true }] })), { allowed: false, code: "STACK-VERIFICATION-REQUIRED", verification: ["cap.fuzz"] });
console.log("6 stack capability plan checks passed");
