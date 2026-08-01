// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createThreatEntityId, evaluateThreatBoundary, evaluateThreatImpact, evaluateThreatModelApplicability, previewThreatModelMigration, threatModelDigest } from "./threat-model.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const required = { applicability: "required", riskInputs: { assurance: true, exposure: true, data: true, privilege: true, dependencies: true, architecture: true, deployment: true, agentEgress: true } };
const absentRisk = Object.fromEntries(Object.keys(required.riskInputs).map((key) => [key, false]));
const model = (lifecycle) => ({ schema: "pipeline.threat-model.v1", candidate, policyRevision: "policy-v1", classification: "public", entities: [], lifecycle });
const receipt = (subject, decision) => ({ schema: "pipeline.threat-model-approval-receipt.v1", receiptId: `receipt-${decision}`, authority: "human", decision, candidate, policyRevision: "policy-v1", modelDigest: threatModelDigest(subject).digest });
const impact = (subject, changedSubjects, links) => evaluateThreatImpact({ model: subject, changedSubjects, links });
const assetCli = createThreatEntityId("asset", "cli").id;
const publicBoundary = createThreatEntityId("boundary", "public").id;
const image = createThreatEntityId("asset", "image").id;
const data = createThreatEntityId("asset", "customer-data").id;
const egress = createThreatEntityId("asset", "agent-egress").id;
const trustedBoundary = createThreatEntityId("boundary", "trusted-public").id;
const dependency = createThreatEntityId("asset", "dependency-auth").id;
const cases = [
  { name: "low-risk CLI/library", input: required, state: "required", changedSubjects: [assetCli], links: [], impactState: "current" },
  { name: "externally exposed API", input: required, state: "required", changedSubjects: [publicBoundary], links: [{ subject: publicBoundary, requirement: "requirement-api" }], impactState: "stale" },
  { name: "container/IaC deployment", input: required, state: "required", changedSubjects: [image], links: [{ subject: image, requirement: "requirement-image" }], impactState: "stale" },
  { name: "sensitive-data system", input: required, state: "required", changedSubjects: [data], links: [{ subject: data, requirement: "requirement-data" }], impactState: "stale" },
  { name: "AI/agent system with tools and egress", input: required, state: "required", changedSubjects: [egress], links: [{ subject: egress, requirement: "requirement-egress" }], impactState: "stale" },
  { name: "architecture delta crossing a trust boundary", input: required, state: "required", changedSubjects: [trustedBoundary], links: [{ subject: trustedBoundary, requirement: "requirement-boundary" }, { subject: data, requirement: "requirement-data" }], impactState: "stale" },
  { name: "stale and superseded threat models", input: required, state: "required", changedSubjects: [dependency], links: [{ subject: dependency, requirement: "requirement-auth" }], impactState: "stale", lifecycle: "superseded" },
  { name: "valid not-applicable decision", input: { applicability: "not-applicable", riskInputs: absentRisk }, state: "not-applicable", changedSubjects: [], links: [], impactState: "current", lifecycle: "retired" },
];
for (const fixture of cases) {
  const subject = model(fixture.lifecycle ?? "approved");
  const result = impact(subject, fixture.changedSubjects, fixture.links);
  assert.equal(evaluateThreatModelApplicability(fixture.input).state, fixture.state, fixture.name);
  assert.equal(result.state, fixture.impactState, fixture.name);
  if (fixture.lifecycle === "superseded") assert.equal(evaluateThreatBoundary({ boundary: "release", applicability: "required", model: subject, approvalReceipt: receipt(subject, "approved"), fresh: false, impact: result }).allowed, false, fixture.name);
  if (fixture.lifecycle === "retired") assert.equal(evaluateThreatBoundary({ boundary: "release", applicability: "not-applicable", model: subject, approvalReceipt: receipt(subject, "not-applicable"), fresh: false, impact: result }).allowed, true, fixture.name);
}
assert.deepEqual(previewThreatModelMigration({ hasCanonicalModel: false }), { schema: "pipeline.threat-model-migration-preview.v1", status: "incomplete", writes: [] });
console.log(`${cases.length} threat-model fixture classes passed`);
