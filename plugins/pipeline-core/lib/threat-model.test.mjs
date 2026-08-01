// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createThreatEntityId, evaluateThreatImpact, evaluateThreatModelApplicability, evaluateThreatTraceability, exportThreatModelView, previewThreatModelMigration } from "./threat-model.mjs";
const complete = { applicability: "required", riskInputs: { assurance: true, exposure: true, data: true, privilege: true, dependencies: true, architecture: true, deployment: true, agentEgress: true } };
assert.deepEqual(evaluateThreatModelApplicability(complete), { state: "required", code: "THREAT-REQUIRED" });
assert.deepEqual(evaluateThreatModelApplicability({ ...complete, riskInputs: { ...complete.riskInputs, data: false } }), { state: "incomplete", code: "THREAT-RISK-INPUT-MISSING" });
assert.equal(evaluateThreatModelApplicability({ applicability: "not-applicable", riskInputs: complete.riskInputs }).state, "invalid");
assert.equal(createThreatEntityId("asset", "service:api").id, createThreatEntityId("asset", "service:api").id);
assert.equal(createThreatEntityId("asset", "service:api").id === createThreatEntityId("threat", "service:api").id, false);
assert.deepEqual(evaluateThreatTraceability({ requirements: ["R1"], links: [{ requirement: "R1", subject: "T1", kind: "threat" }] }), { ok: true });
assert.deepEqual(evaluateThreatImpact({ changedSubjects: ["boundary:public"], links: [{ subject: "boundary:public", requirement: "R1" }, { subject: "asset:db", requirement: "R2" }] }), { state: "stale", code: "THREAT-IMPACT-REVIEW", affected: ["R1"] });
assert.deepEqual(exportThreatModelView({ classification: "private", entities: [{ id: "A1", name: "internal api", coordinate: "private/host" }] }).entities[0], { id: "A1", name: "redacted", coordinate: "redacted" });
assert.deepEqual(previewThreatModelMigration({ hasCanonicalModel: false }).writes, []);
console.log("9 threat-model checks passed");
