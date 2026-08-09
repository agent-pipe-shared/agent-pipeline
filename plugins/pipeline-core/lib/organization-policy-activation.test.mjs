// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { activateOrganizationPolicy, planOrganizationPolicyActivation } from "./organization-policy-activation.mjs";

// WP-P-AC03: mechanical, non-behavioral change -- documentClasses becomes an
// optional parameter (defaulting to the original fixed entry) so P-AC-03's
// tests below can construct transitions with targetBinding-scoped classes
// without touching any pre-existing zero-argument pack() call site.
function pack(documentClasses = [{ class: "security", mode: "controlled-publication", approvalRequired: true }]) { return { schema: "pipeline.organization-policy-pack.v1", packId: "security-baseline", revision: "a".repeat(64), compatibility: { minimumCoreVersion: "0.4.0", maximumCoreVersion: "0.5.0" }, governanceFloors: { requireHumanDecisionLedger: true, allowExternalAuthority: false }, documentClasses }; }
test("activates exactly the planned effective policy only after a bound authority readback", async () => {
  const root = mkdtempSync(join(tmpdir(), "organization-policy-activation-")); const plan = await planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack()], activationId: "activate-security" });
  const receipt = await activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 1, authorize: async (request) => ({ granted: true, decisionId: "decision-security", ...request }) });
  assert.equal(receipt.status, "activated"); assert.equal(JSON.parse(readFileSync(join(root, "governance/organization-policy-active.json"))).effectivePolicySha256, plan.effectivePolicySha256);
});
test("rejects an unbound authority response and stale plan preimage", async () => {
  const root = mkdtempSync(join(tmpdir(), "organization-policy-activation-")); const plan = await planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack()], activationId: "activate-security" });
  await assert.rejects(() => activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 1, authorize: async () => ({ granted: true }) }), (error) => error.code === "OPA-AUTHORITY");
  await activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 2, authorize: async (request) => ({ granted: true, decisionId: "decision-security", ...request }) });
  await assert.rejects(() => activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 3, authorize: async (request) => ({ granted: true, decisionId: "decision-security", ...request }) }), (error) => error.code === "OPA-PREIMAGE");
});
// P-AC-03: the three preview fields must be computed from the transition
// itself (prior active state vs. this plan's newly resolved effectivePolicy)
// -- never left for a caller to supply. This activates a baseline pack with
// an artifact-bound "operations" class, then plans a second transition that
// points that same class at a different artifact, newly binds "security" to
// an external system, and moves "security" into controlled-publication for
// the first time, and asserts all three fields on both plans.
test("P-AC-03 computes newlyRequiredArtifacts, externalEffects, and backfillRange deterministically from the transition", async () => {
  const root = mkdtempSync(join(tmpdir(), "organization-policy-activation-"));
  const baselineClasses = [{ class: "operations", mode: "projection", approvalRequired: false, targetBinding: { targetClass: "artifact", targetRef: "ops-baseline-artifact" } }];
  const baselinePlan = await planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack(baselineClasses)], activationId: "activate-baseline" });
  assert.deepEqual(baselinePlan.newlyRequiredArtifacts, [{ class: "operations", targetRef: "ops-baseline-artifact" }]);
  assert.deepEqual(baselinePlan.externalEffects, []);
  assert.equal(baselinePlan.backfillRange, null);
  await activateOrganizationPolicy({ repositoryRoot: root, plan: baselinePlan, nowEpochMs: 100, authorize: async (request) => ({ granted: true, decisionId: "decision-baseline", ...request }) });

  const nextClasses = [
    { class: "operations", mode: "projection", approvalRequired: false, targetBinding: { targetClass: "artifact", targetRef: "ops-next-artifact" } },
    { class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "external-system", targetRef: "incident-webhook" } },
  ];
  const nextPlan = await planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack(nextClasses)], activationId: "activate-next" });
  assert.deepEqual(nextPlan.newlyRequiredArtifacts, [{ class: "operations", targetRef: "ops-next-artifact" }]);
  assert.deepEqual(nextPlan.externalEffects, [{ class: "security", targetRef: "incident-webhook", effect: "activated" }]);
  assert.deepEqual(nextPlan.backfillRange, { classes: ["security"], fromEpochMs: 100 });
});
// P-AC-03: assertPlan (the trust boundary activateOrganizationPolicy passes a
// caller-supplied plan through) must fail closed on a hand-tampered preview
// field exactly like it already fails closed on a tampered effectivePolicy --
// the preview is derived data, never something a caller may substitute.
test("P-AC-03 rejects a plan whose preview fields were tampered instead of trusting caller-supplied data", async () => {
  const root = mkdtempSync(join(tmpdir(), "organization-policy-activation-"));
  const plan = await planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack()], activationId: "activate-security" });
  const tampered = Object.freeze({ ...plan, newlyRequiredArtifacts: [{ class: "security", targetRef: "forged-artifact", extra: true }] });
  await assert.rejects(() => activateOrganizationPolicy({ repositoryRoot: root, plan: tampered, nowEpochMs: 1, authorize: async (request) => ({ granted: true, decisionId: "decision-security", ...request }) }), (error) => error.code === "OPA-PREVIEW");
});
