// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { activateOrganizationPolicy, planOrganizationPolicyActivation } from "./organization-policy-activation.mjs";

function pack() { return { schema: "pipeline.organization-policy-pack.v1", packId: "security-baseline", revision: "a".repeat(64), compatibility: { minimumCoreVersion: "0.4.0", maximumCoreVersion: "0.5.0" }, governanceFloors: { requireHumanDecisionLedger: true, allowExternalAuthority: false }, documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true }] }; }
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
