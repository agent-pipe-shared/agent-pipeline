// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { evaluateThreatImpact, evaluateThreatModelApplicability, previewThreatModelMigration } from "./threat-model.mjs";
const required = { applicability: "required", riskInputs: { assurance: true, exposure: true, data: true, privilege: true, dependencies: true, architecture: true, deployment: true, agentEgress: true } };
const cases = ["low-risk CLI/library", "externally exposed API", "container/IaC deployment", "sensitive-data system", "AI/agent system with tools and egress", "architecture delta crossing trust boundary", "stale and superseded threat models", "valid not-applicable decision"];
for (const name of cases) { if (name === "valid not-applicable decision") assert.equal(evaluateThreatModelApplicability({ ...required, applicability: "not-applicable", riskInputs: Object.fromEntries(Object.keys(required.riskInputs).map((key) => [key, false])) }).state, "not-applicable"); else assert.equal(evaluateThreatModelApplicability(required).state, "required"); }
assert.equal(evaluateThreatImpact({ changedSubjects: ["boundary"], links: [{ subject: "boundary", requirement: "R" }] }).state, "stale");
assert.deepEqual(previewThreatModelMigration({ hasCanonicalModel: false }), { schema: "pipeline.threat-model-migration-preview.v1", status: "incomplete", writes: [] });
console.log(`${cases.length} threat-model fixture classes passed`);
