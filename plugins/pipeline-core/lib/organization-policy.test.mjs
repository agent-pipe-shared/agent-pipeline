// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict"; import test from "node:test";
import { OrganizationPolicyError, resolveEffectiveOrganizationPolicy, validateOrganizationPolicyPack } from "./organization-policy.mjs";
// WP-P-AC11: targetBinding is an OPTIONAL closed field (see
// organization-policy.mjs); this fixture default declares one so most tests
// below exercise the scoped path, and dedicated tests cover omission,
// rejection, conflict and revision-readback separately.
function pack(overrides = {}) { return { schema: "pipeline.organization-policy-pack.v1", packId: "security-baseline", revision: "a".repeat(64), compatibility: { minimumCoreVersion: "0.4.0", maximumCoreVersion: "0.5.0" }, governanceFloors: { requireHumanDecisionLedger: true, allowExternalAuthority: false }, documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact" } }], ...overrides }; }
test("accepts a closed compatible policy pack", () => assert.equal(validateOrganizationPolicyPack(pack(), { coreVersion: "0.4.7" }).packId, "security-baseline"));
test("rejects floor weakening, duplicate document ownership, unknown fields, and incompatible core", () => {
  for (const value of [pack({ governanceFloors: { requireHumanDecisionLedger: false, allowExternalAuthority: false } }), pack({ documentClasses: [pack().documentClasses[0], pack().documentClasses[0]] }), { ...pack(), extra: true }]) assert.throws(() => validateOrganizationPolicyPack(value, { coreVersion: "0.4.7" }), (error) => error instanceof OrganizationPolicyError);
  assert.throws(() => validateOrganizationPolicyPack(pack(), { coreVersion: "9.0.0" }), (error) => error instanceof OrganizationPolicyError);
});
test("resolves compatible packs without last-write-wins and unions approval requirements", () => {
  const operations = pack({ packId: "operations-baseline", revision: "b".repeat(64), documentClasses: [{ class: "operations", mode: "projection", approvalRequired: false, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact" } }] });
  const security = pack({ packId: "security-overlay", revision: "c".repeat(64), documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: false, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact" } }] });
  const additionalSecurity = pack({ packId: "security-approval", revision: "d".repeat(64), documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact" } }] });
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
  // WP-P-AC11: mechanical, non-behavioral update -- this fixture's
  // documentClasses entry now declares the optional targetBinding key, so
  // the expected key set grows from three to four; the assertion still
  // proves the entry is closed (no stray credential/actor/endpoint field),
  // same precedent as C-AC-12's reviewPolicy addition.
  assert.deepEqual(Object.keys(accepted.documentClasses[0]).sort(), ["approvalRequired", "class", "mode", "targetBinding"]);
});
test("rejects duplicate pack bindings and incompatible modes instead of choosing a winner", () => {
  const first = pack(); const conflicting = pack({ packId: "other-pack", revision: "b".repeat(64), documentClasses: [{ class: "security", mode: "reference-only", approvalRequired: true, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact" } }] });
  assert.throws(() => resolveEffectiveOrganizationPolicy({ coreVersion: "0.4.7", packs: [first, first] }), (error) => error.code === "OPP-RESOLVE-DUPLICATE");
  assert.throws(() => resolveEffectiveOrganizationPolicy({ coreVersion: "0.4.7", packs: [first, conflicting] }), (error) => error.code === "OPP-RESOLVE-CONFLICT");
});
// P-AC-11: mode is part of the closed scoping vocabulary a document-class
// entry may declare; an unrecognized mode must be rejected rather than
// silently accepted as an undefined fourth publication boundary.
test("P-AC-11 rejects a document class mode outside the closed reference-only/projection/controlled-publication set", () => {
  assert.throws(() => validateOrganizationPolicyPack(pack({ documentClasses: [{ class: "security", mode: "public-broadcast", approvalRequired: true, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact" } }] }), { coreVersion: "0.4.7" }), (error) => error instanceof OrganizationPolicyError && error.code === "OPP-DOCUMENT");
});
// P-AC-11: approval is the other scoping dimension this pack schema actually
// carries (approvalRequired); a later, laxer pack must never downgrade an
// earlier pack's required approval for the same document class.
test("P-AC-11 unions approval requirements so a later pack cannot downgrade an earlier pack's required approval", () => {
  const strict = pack({ packId: "security-strict", revision: "e".repeat(64), documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact" } }] });
  const lax = pack({ packId: "security-lax", revision: "f".repeat(64), documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: false, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact" } }] });
  const resolved = resolveEffectiveOrganizationPolicy({ coreVersion: "0.4.7", packs: [strict, lax] });
  assert.equal(resolved.documentClasses.find((entry) => entry.class === "security").approvalRequired, true);
});
// P-AC-11: target class/binding is a closed, provider-neutral reference (a
// target class enum plus a bounded identifier) scoping WHAT the entry
// governs -- never a literal file path, URL, or credential.
test("P-AC-11 represents a closed provider-neutral targetBinding and rejects a non-closed value", () => {
  const accepted = validateOrganizationPolicyPack(pack({ documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "repository-path-pattern", targetRef: "governed-docs-tree" } }] }), { coreVersion: "0.4.7" });
  assert.deepEqual(accepted.documentClasses[0].targetBinding, { targetClass: "repository-path-pattern", targetRef: "governed-docs-tree" });
  const malformed = [
    pack({ documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "unknown-target-class", targetRef: "governed-docs-tree" } }] }),
    pack({ documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "artifact", targetRef: "/etc/governed-docs" } }] }),
    pack({ documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact", endpoint: "https://internal.example/hook" } }] }),
    pack({ documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: "primary-artifact" }] }),
  ];
  for (const value of malformed) assert.throws(() => validateOrganizationPolicyPack(value, { coreVersion: "0.4.7" }), (error) => error instanceof OrganizationPolicyError && error.code === "OPP-DOCUMENT");
});
// P-AC-11: targetBinding is OPTIONAL, not mandatory (deliberate design
// decision -- see organization-policy.mjs's header comment for why: it keeps
// every pre-existing three-key documentClasses entry, including packs built
// before this dispatch, valid unchanged). A pack that omits it must still
// validate and resolve, and the omission must stay an omission (no stray
// empty targetBinding key) all the way through to the resolved output.
test("P-AC-11 leaves targetBinding an optional key: a document class without one still validates and resolves with no targetBinding key present", () => {
  const unscoped = pack({ documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true }] });
  const accepted = validateOrganizationPolicyPack(unscoped, { coreVersion: "0.4.7" });
  assert.deepEqual(Object.keys(accepted.documentClasses[0]).sort(), ["approvalRequired", "class", "mode"]);
  const resolved = resolveEffectiveOrganizationPolicy({ coreVersion: "0.4.7", packs: [unscoped] });
  assert.equal(Object.hasOwn(resolved.documentClasses[0], "targetBinding"), false);
});
// P-AC-11: targetBinding is never merged across packs (same "different
// boundaries, no safe union" rule as mode) -- a mismatched target for the
// same document class must fail closed under OPP-RESOLVE-CONFLICT even when
// mode and approval both agree, exactly like mode's own conflict test above.
test("P-AC-11 refuses to merge a mismatched targetBinding for the same document class instead of choosing one", () => {
  const artifactScoped = pack({ packId: "security-artifact", revision: "1".repeat(64), documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact" } }] });
  const externalScoped = pack({ packId: "security-external", revision: "2".repeat(64), documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "external-system", targetRef: "primary-artifact" } }] });
  assert.throws(() => resolveEffectiveOrganizationPolicy({ coreVersion: "0.4.7", packs: [artifactScoped, externalScoped] }), (error) => error.code === "OPP-RESOLVE-CONFLICT");
});
// P-AC-11: one pack declaring a target and another leaving it undeclared for
// the same document class is itself a mismatch (undeclared is its own
// distinct state, not a wildcard) -- silently picking either could scope
// permission onto a target the PO never reviewed, so this also fails closed.
test("P-AC-11 refuses to merge a declared targetBinding with an undeclared one for the same document class", () => {
  const scoped = pack({ packId: "security-scoped", revision: "5".repeat(64), documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact" } }] });
  const unscoped = pack({ packId: "security-unscoped", revision: "6".repeat(64), documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true }] });
  assert.throws(() => resolveEffectiveOrganizationPolicy({ coreVersion: "0.4.7", packs: [scoped, unscoped] }), (error) => error.code === "OPP-RESOLVE-CONFLICT");
});
// P-AC-11: revision readback -- a caller consulting one effective
// documentClasses entry must be able to determine which pack(s) and which of
// their revisions contributed it, not just the flat packIds list.
test("P-AC-11 records which pack(s) and revision(s) contributed each effective document class", () => {
  const baseline = pack({ packId: "security-baseline", revision: "3".repeat(64), documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: false, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact" } }] });
  const overlay = pack({ packId: "security-overlay-2", revision: "4".repeat(64), documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "artifact", targetRef: "primary-artifact" } }] });
  const resolved = resolveEffectiveOrganizationPolicy({ coreVersion: "0.4.7", packs: [baseline, overlay] });
  const entry = resolved.documentClasses.find((candidate) => candidate.class === "security");
  assert.deepEqual(entry.revisions, [
    { packId: "security-baseline", revision: "3".repeat(64) },
    { packId: "security-overlay-2", revision: "4".repeat(64) },
  ]);
  assert.deepEqual(entry.packIds, ["security-baseline", "security-overlay-2"]);
});
// P-AC-10: a compliance/regulatory-assessment claim has no field anywhere in
// this closed pack schema; injecting one must be rejected exactly like any
// other unknown field, so a portable policy pack can never carry that claim.
test("P-AC-10 rejects a compliance or regulatory-assessment claim field on a portable policy pack", () => {
  assert.throws(() => validateOrganizationPolicyPack(pack({ complianceCertification: "SOC2-attested" }), { coreVersion: "0.4.7" }), (error) => error instanceof OrganizationPolicyError && error.code === "OPP-SHAPE");
});
