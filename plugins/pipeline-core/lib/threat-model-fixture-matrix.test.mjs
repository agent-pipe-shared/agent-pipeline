// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { evaluateThreatBoundary, evaluateThreatImpact, evaluateThreatModelApplicability, previewThreatModelMigration } from "./threat-model.mjs";
const required = { applicability: "required", riskInputs: { assurance: true, exposure: true, data: true, privilege: true, dependencies: true, architecture: true, deployment: true, agentEgress: true } };
const absentRisk = Object.fromEntries(Object.keys(required.riskInputs).map((key) => [key, false]));
const model = (lifecycle) => ({ schema: "pipeline.threat-model.v1", candidate: { commit: "a", tree: "b" }, policyRevision: "p", classification: "public", entities: [], lifecycle });
const receipt = (decision) => ({ schema: "pipeline.threat-model-approval-receipt.v1", receiptId: `receipt-${decision}`, authority: "human", decision, candidate: { commit: "a", tree: "b" }, policyRevision: "p" });
const cases = [
  { name: "low-risk CLI/library", input: required, state: "required", impact: { changedSubjects: ["asset:cli"], links: [] }, impactState: "current" },
  { name: "externally exposed API", input: required, state: "required", impact: { changedSubjects: ["boundary:public"], links: [{ subject: "boundary:public", requirement: "R-api" }] }, impactState: "stale" },
  { name: "container/IaC deployment", input: required, state: "required", impact: { changedSubjects: ["deployment:image"], links: [{ subject: "deployment:image", requirement: "R-image" }] }, impactState: "stale" },
  { name: "sensitive-data system", input: required, state: "required", impact: { changedSubjects: ["data:customer"], links: [{ subject: "data:customer", requirement: "R-data" }] }, impactState: "stale" },
  { name: "AI/agent system with tools and egress", input: required, state: "required", impact: { changedSubjects: ["agent:egress"], links: [{ subject: "agent:egress", requirement: "R-egress" }] }, impactState: "stale" },
  { name: "architecture delta crossing trust boundary", input: required, state: "required", impact: { changedSubjects: ["boundary:trusted-to-public"], links: [{ subject: "boundary:trusted-to-public", requirement: "R-boundary" }, { subject: "asset:db", requirement: "R-db" }] }, impactState: "stale" },
  { name: "stale and superseded threat models", input: required, state: "required", impact: { changedSubjects: ["dependency:auth"], links: [{ subject: "dependency:auth", requirement: "R-auth" }] }, impactState: "stale", boundary: { boundary: "release", applicability: "required", model: model("superseded"), approvalReceipt: receipt("approved"), fresh: false } },
  { name: "valid not-applicable decision", input: { applicability: "not-applicable", riskInputs: absentRisk }, state: "not-applicable", impact: { changedSubjects: [], links: [] }, impactState: "current", boundary: { boundary: "release", applicability: "not-applicable", model: model("retired"), approvalReceipt: receipt("not-applicable"), fresh: false } },
];
for (const fixture of cases) {
  assert.equal(evaluateThreatModelApplicability(fixture.input).state, fixture.state, fixture.name);
  assert.equal(evaluateThreatImpact(fixture.impact).state, fixture.impactState, fixture.name);
  if (fixture.boundary) assert.equal(evaluateThreatBoundary(fixture.boundary).allowed, fixture.name === "valid not-applicable decision", fixture.name);
}
assert.deepEqual(previewThreatModelMigration({ hasCanonicalModel: false }), { schema: "pipeline.threat-model-migration-preview.v1", status: "incomplete", writes: [] });
console.log(`${cases.length} threat-model fixture classes passed`);
