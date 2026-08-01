// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createThreatEntityId, evaluateThreatModelApplicability } from "./threat-model.mjs";
const complete = { applicability: "required", riskInputs: { assurance: true, exposure: true, data: true, privilege: true, dependencies: true, architecture: true, deployment: true, agentEgress: true } };
assert.deepEqual(evaluateThreatModelApplicability(complete), { state: "required", code: "THREAT-REQUIRED" });
assert.deepEqual(evaluateThreatModelApplicability({ ...complete, riskInputs: { ...complete.riskInputs, data: false } }), { state: "incomplete", code: "THREAT-RISK-INPUT-MISSING" });
assert.equal(evaluateThreatModelApplicability({ applicability: "not-applicable", riskInputs: complete.riskInputs }).state, "invalid");
assert.equal(createThreatEntityId("asset", "service:api").id, createThreatEntityId("asset", "service:api").id);
assert.equal(createThreatEntityId("asset", "service:api").id === createThreatEntityId("threat", "service:api").id, false);
console.log("5 threat-model checks passed");
