// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { validateControl, lintCatalogContent, lintStandardMappingsAndClaims } from "./control-catalog-schema.mjs";

function deepFreeze(v, seen = new Set()) {
  if (v && typeof v === "object" && !seen.has(v)) {
    seen.add(v);
    Object.values(v).forEach((x) => deepFreeze(x, seen));
    Object.freeze(v);
  }
  return v;
}

// --- fixtures -----------------------------------------------------------

const validControl = {
  id: "ctl.base.secrets.no-committed-secrets",
  revision: 1,
  status: "active",
  title: "No committed secrets",
  objective: "Prevent secret material from entering version control.",
  threat: "Leaked credentials enable unauthorized access.",
  class: "base",
  applicability: { expression: "always", requiredInputs: ["repo.gitHistory"] },
  phase: "pre-commit",
  boundary: "repository",
  owner: "security-team",
  approvalAuthority: "security-lead",
  verifierType: "gitleaks",
  capabilityRequirements: ["cap.secrets"],
  evidenceContract: { schemaRef: "pipeline.control-evidence.v1", freshnessRule: "24h", bindingRule: "commit-sha" },
  severity: "critical",
  defaultFailureMode: "block",
  remediation: "Rotate the credential and purge it from history.",
  waiver: null,
  supersedes: null,
  supersededBy: null,
  standardMappings: [{ standard: "NIST SSDF", version: "1.1" }],
};

const waivedControl = {
  ...validControl,
  id: "ctl.stack.container.nonroot-user",
  class: "stack",
  capabilityRequirements: ["cap.container", "cap.container.rootless"],
  waiver: { authority: "ciso", reason: "legacy image not yet migrated", expiry: "2026-12-31", revalidationTrigger: "image-rebuild" },
  supersedes: "ctl.stack.container.root-user-legacy",
};

// --- AC1: validateControl ------------------------------------------------

{
  // full valid record accepted
  assert.deepEqual(validateControl(validControl), { valid: true });
  // full valid record with populated waiver/supersedes accepted
  assert.deepEqual(validateControl(waivedControl), { valid: true });
}

{
  // missing required field -> typed, field-naming rejection
  const missing = { ...validControl };
  delete missing.objective;
  const result = validateControl(missing);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "objective" && e.code === "SCHEMA-MISSING-FIELD"));
}

{
  // class outside base|stack|risk
  const bad = { ...validControl, class: "exotic" };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "class" && e.code === "SCHEMA-INVALID-CLASS"));
}

{
  // capabilityRequirements entry not matching cap.<family>[.<technique>] grammar
  const bad = { ...validControl, capabilityRequirements: ["not-a-cap-id"] };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "capabilityRequirements[0]" && e.code === "SCHEMA-INVALID-CAPABILITY-REQUIREMENTS"));
}

{
  // capabilityRequirements entry matches grammar but references a non-frozen family root
  const bad = { ...validControl, capabilityRequirements: ["cap.quantum"] };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "capabilityRequirements[0]" && e.code === "SCHEMA-UNKNOWN-CAPABILITY-ROOT"));
}

{
  // unrecognized top-level field is rejected (closed schema)
  const bad = { ...validControl, bogusField: "not part of §8" };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "bogusField" && e.code === "SCHEMA-UNKNOWN-FIELD"));
}

{
  // id grammar violation
  const bad = { ...validControl, id: "not-an-id" };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "id" && e.code === "SCHEMA-INVALID-ID"));
}

{
  // revision must be a non-negative integer
  for (const revision of ["1", -1, 1.5, null]) {
    const bad = { ...validControl, revision };
    const result = validateControl(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.field === "revision" && e.code === "SCHEMA-INVALID-REVISION"));
  }
}

{
  // applicability missing requiredInputs
  const bad = { ...validControl, applicability: { expression: "always" } };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "applicability" && e.code === "SCHEMA-INVALID-APPLICABILITY"));
}

{
  // evidenceContract missing schemaRef
  const bad = { ...validControl, evidenceContract: { freshnessRule: "24h" } };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "evidenceContract" && e.code === "SCHEMA-INVALID-EVIDENCE-CONTRACT"));
}

{
  // evidenceContract with extra/loosely-shaped freshness/binding keys still passes
  // (only schemaRef is a hard requirement; §8's 2-vs-3 key shape is ambiguous)
  const permissive = { ...validControl, evidenceContract: { schemaRef: "pipeline.control-evidence.v1", freshnessAndBinding: "24h, commit-sha" } };
  assert.equal(validateControl(permissive).valid, true);
}

{
  // waiver missing revalidationTrigger
  const bad = { ...waivedControl, waiver: { authority: "ciso", reason: "legacy", expiry: "2026-12-31" } };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "waiver" && e.code === "SCHEMA-INVALID-WAIVER"));
}

{
  // supersedes must be null or a valid control ID
  const bad = { ...waivedControl, supersedes: "not-an-id" };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "supersedes" && e.code === "SCHEMA-INVALID-SUPERSEDES"));
}

{
  // supersededBy must be null or a valid control ID
  const bad = { ...validControl, supersededBy: "not-an-id" };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "supersededBy" && e.code === "SCHEMA-INVALID-SUPERSEDED-BY"));
}

{
  // standardMappings entry missing "standard"
  const bad = { ...validControl, standardMappings: [{ version: "1.1" }] };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "standardMappings[0]" && e.code === "SCHEMA-INVALID-STANDARD-MAPPINGS"));
}

{
  // non-object control records
  for (const bad of [null, undefined, [], "a-string", 42]) {
    const result = validateControl(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === "SCHEMA-NOT-OBJECT"));
  }
}

{
  // purity: no mutation of the input argument
  const before = JSON.stringify(validControl);
  validateControl(validControl);
  assert.equal(JSON.stringify(validControl), before);
  // purity: works against a deeply frozen input without throwing
  const frozen = deepFreeze(structuredClone(validControl));
  assert.doesNotThrow(() => validateControl(frozen));
  assert.equal(validateControl(frozen).valid, true);
}

// --- AC5: lintCatalogContent ---------------------------------------------

{
  // catalog where every control names all four fields
  const result = lintCatalogContent([validControl, waivedControl]);
  assert.deepEqual(result, { valid: true });
}

{
  // exactly one control missing exactly one of the four required fields
  for (const field of ["verifierType", "evidenceContract", "boundary", "defaultFailureMode"]) {
    const bad = { ...waivedControl };
    delete bad[field];
    const result = lintCatalogContent([validControl, bad]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.controlId === waivedControl.id && e.field === field && e.code === "CATALOG-LINT-MISSING-FIELD"));
    // the other, unaffected control must not be flagged
    assert.ok(!result.errors.some((e) => e.controlId === validControl.id));
  }
}

{
  // non-object entries in the controls array are flagged, not silently skipped
  const result = lintCatalogContent([validControl, null]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "CATALOG-LINT-NOT-OBJECT"));
}

{
  assert.throws(() => lintCatalogContent("not-an-array"), TypeError);
  assert.throws(() => lintCatalogContent({ length: 0 }), TypeError);
}

{
  // purity: no mutation, works against deeply frozen input
  const controls = [validControl, waivedControl];
  const before = JSON.stringify(controls);
  lintCatalogContent(controls);
  assert.equal(JSON.stringify(controls), before);
  const frozen = deepFreeze(structuredClone(controls));
  assert.doesNotThrow(() => lintCatalogContent(frozen));
  assert.equal(lintCatalogContent(frozen).valid, true);
}

// --- AC8: lintStandardMappingsAndClaims -----------------------------------

const goodControl = {
  ...validControl,
  standardMappings: [{ standard: "NIST SSDF", version: "1.1" }, { standard: "OWASP ASVS", version: "5.0" }],
};

{
  // every mapping versioned, no bare claims -> accepted
  assert.deepEqual(lintStandardMappingsAndClaims([goodControl]), { valid: true });
}

{
  // version-less mapping entry rejected
  const bad = { ...goodControl, standardMappings: [{ standard: "OWASP ASVS" }] };
  const result = lintStandardMappingsAndClaims([bad]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.controlId === bad.id && e.code === "CATALOG-LINT-MISSING-VERSION"));
}

{
  // bare unqualified "certified" in control prose
  const bad = { ...goodControl, objective: "This control is certified for production use." };
  const result = lintStandardMappingsAndClaims([bad]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.controlId === bad.id && e.field === "objective" && e.code === "CATALOG-LINT-BARE-CLAIM"));
}

{
  // bare unqualified "compliant" in control prose
  const bad = { ...goodControl, remediation: "Once patched the system is compliant." };
  const result = lintStandardMappingsAndClaims([bad]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.controlId === bad.id && e.field === "remediation" && e.code === "CATALOG-LINT-BARE-CLAIM"));
}

{
  // "certified"/"compliant" WITH a qualifying disclaimer in the same sentence is not flagged
  const qualified = { ...goodControl, objective: "This control is certified only insofar as it is informatively mapped to NIST SSDF." };
  assert.deepEqual(lintStandardMappingsAndClaims([qualified]), { valid: true });
  const qualified2 = { ...goodControl, threat: "Absence of this control is not a certification claim of any kind." };
  assert.deepEqual(lintStandardMappingsAndClaims([qualified2]), { valid: true });
}

{
  // bare claim in the optional catalogText parameter
  const result = lintStandardMappingsAndClaims([goodControl], "This catalog is fully compliant with all standards.");
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.controlId === null && e.field === "catalogText" && e.code === "CATALOG-LINT-BARE-CLAIM"));
}

{
  // catalogText with a disclaimer in the same sentence is not flagged
  const result = lintStandardMappingsAndClaims([goodControl], "This catalog is compliant in the sense that content is informatively mapped to NIST SSDF.");
  assert.deepEqual(result, { valid: true });
}

{
  assert.throws(() => lintStandardMappingsAndClaims("not-an-array"), TypeError);
  assert.throws(() => lintStandardMappingsAndClaims([goodControl], 42), TypeError);
}

{
  // non-object entries flagged, not silently skipped
  const result = lintStandardMappingsAndClaims([goodControl, "not-a-control"]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "CATALOG-LINT-NOT-OBJECT"));
}

{
  // purity: no mutation, works against deeply frozen input
  const controls = [goodControl];
  const before = JSON.stringify(controls);
  lintStandardMappingsAndClaims(controls, "informative text, no bare claims here.");
  assert.equal(JSON.stringify(controls), before);
  const frozen = deepFreeze(structuredClone(controls));
  assert.doesNotThrow(() => lintStandardMappingsAndClaims(frozen));
  assert.equal(lintStandardMappingsAndClaims(frozen).valid, true);
}

console.log("control-catalog-schema: ok");
