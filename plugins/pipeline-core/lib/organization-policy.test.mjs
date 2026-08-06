// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict"; import test from "node:test";
import { OrganizationPolicyError, resolveEffectiveOrganizationPolicy, validateOrganizationPolicyPack } from "./organization-policy.mjs";
function pack(overrides = {}) { return { schema: "pipeline.organization-policy-pack.v1", packId: "security-baseline", revision: "a".repeat(64), compatibility: { minimumCoreVersion: "0.4.0", maximumCoreVersion: "0.5.0" }, governanceFloors: { requireHumanDecisionLedger: true, allowExternalAuthority: false }, documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true }], ...overrides }; }
test("accepts a closed compatible policy pack", () => assert.equal(validateOrganizationPolicyPack(pack(), { coreVersion: "0.4.7" }).packId, "security-baseline"));
test("rejects floor weakening, duplicate document ownership, unknown fields, and incompatible core", () => {
  for (const value of [pack({ governanceFloors: { requireHumanDecisionLedger: false, allowExternalAuthority: false } }), pack({ documentClasses: [pack().documentClasses[0], pack().documentClasses[0]] }), { ...pack(), extra: true }]) assert.throws(() => validateOrganizationPolicyPack(value, { coreVersion: "0.4.7" }), (error) => error instanceof OrganizationPolicyError);
  assert.throws(() => validateOrganizationPolicyPack(pack(), { coreVersion: "9.0.0" }), (error) => error instanceof OrganizationPolicyError);
});
test("resolves compatible packs without last-write-wins and unions approval requirements", () => {
  const operations = pack({ packId: "operations-baseline", revision: "b".repeat(64), documentClasses: [{ class: "operations", mode: "projection", approvalRequired: false }] });
  const security = pack({ packId: "security-overlay", revision: "c".repeat(64), documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: false }] });
  const additionalSecurity = pack({ packId: "security-approval", revision: "d".repeat(64), documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true }] });
  const resolved = resolveEffectiveOrganizationPolicy({ coreVersion: "0.4.7", packs: [operations, security, additionalSecurity] });
  assert.equal(resolved.schema, "pipeline.effective-organization-policy.v1"); assert.equal(resolved.documentClasses.find((entry) => entry.class === "security").approvalRequired, true); assert.deepEqual(resolved.packs.map((entry) => entry.packId), ["operations-baseline", "security-approval", "security-overlay"]);
});
// P-AC-05: portable policy must exclude credentials, endpoints, private tenant
// or project coordinates, private actor mappings, and private signing keys. The
// pack has no such fields, so the guarantee rests on closed-key validation at
// every level rather than on a denylist; this proves that is actually enforced.
test("P-AC-05 refuses credential, endpoint, coordinate, actor-mapping and signing-key fields at every portable policy level", () => {
  const prohibited = [
    pack({ credentials: "redacted-fixture" }),
    pack({ endpoint: "internal-endpoint-fixture" }),
    pack({ signingKey: "redacted-fixture" }),
    pack({ compatibility: { ...pack().compatibility, tenantId: "tenant-fixture" } }),
    pack({ governanceFloors: { ...pack().governanceFloors, signingKey: "redacted-fixture" } }),
    pack({ documentClasses: [{ ...pack().documentClasses[0], actorMapping: "person-fixture" }] }),
  ];
  for (const value of prohibited) assert.throws(() => validateOrganizationPolicyPack(value, { coreVersion: "0.4.7" }), (error) => error instanceof OrganizationPolicyError);
  const accepted = validateOrganizationPolicyPack(pack(), { coreVersion: "0.4.7" });
  assert.deepEqual(Object.keys(accepted).sort(), ["compatibility", "documentClasses", "governanceFloors", "packId", "revision", "schema"]);
  assert.deepEqual(Object.keys(accepted.documentClasses[0]).sort(), ["approvalRequired", "class", "mode"]);
});
test("rejects duplicate pack bindings and incompatible modes instead of choosing a winner", () => {
  const first = pack(); const conflicting = pack({ packId: "other-pack", revision: "b".repeat(64), documentClasses: [{ class: "security", mode: "reference-only", approvalRequired: true }] });
  assert.throws(() => resolveEffectiveOrganizationPolicy({ coreVersion: "0.4.7", packs: [first, first] }), (error) => error.code === "OPP-RESOLVE-DUPLICATE");
  assert.throws(() => resolveEffectiveOrganizationPolicy({ coreVersion: "0.4.7", packs: [first, conflicting] }), (error) => error.code === "OPP-RESOLVE-CONFLICT");
});
