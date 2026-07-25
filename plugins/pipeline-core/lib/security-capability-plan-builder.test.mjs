// SPDX-License-Identifier: SUL-1.0
//
// CYB-2C -- test suite for the L2 capability-plan builder
// (security-capability-plan-builder.mjs). Reuses CYB-1b's applicability
// resolver and the real reference catalog (governance/security-controls/
// catalog.json, CYB-1e) to build this builder's own inputs -- never a
// hand-authored plan bypassing resolveApplicableControls().
//
// NOTE on a briefing-citation defect (report this, do not silently resolve
// it): this task's dispatching briefing attributes "the 5 named fixtures
// (web-api, cli-lib, container-iac, ai-agent, docs-only)" to
// security-policy-resolver.test.mjs (CYB-1b). They do not live there --
// that file only has generic AC2/AC3/AC4/AC10 test blocks with anonymous
// catalog entries. The 5 named fixtures actually live in
// reference-catalog.test.mjs (CYB-1e, AC9), built from the same
// loadReferenceCatalog() + resolveApplicableControls() calls. Their names,
// shapes, and the "container-iac combines mod.container-deploy +
// mod.iac-cloud" note match the briefing's description exactly -- only the
// file attribution was off. This suite replicates that same construction
// (import-only reuse of loadReferenceCatalog()/resolveApplicableControls();
// reference-catalog.test.mjs/.mjs themselves are read-only context here,
// never modified) rather than treating the citation error as a blocking
// contradiction.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveApplicableControls } from "./security-policy-resolver.mjs";
import { loadReferenceCatalog } from "./reference-catalog.mjs";
import { buildCapabilityPlan } from "./security-capability-plan-builder.mjs";

function deepFreeze(v, seen = new Set()) {
  if (v && typeof v === "object" && !seen.has(v)) {
    seen.add(v);
    Object.values(v).forEach((x) => deepFreeze(x, seen));
    Object.freeze(v);
  }
  return v;
}

// --- build the 5 named AC9 fixtures' ResolvedPolicy objects, exactly as
// reference-catalog.test.mjs does (same catalog + moduleAttribution join,
// same activatedModules per fixture name) -----------------------------------

const catalog = loadReferenceCatalog();
const controlsById = new Map(catalog.controls.map((c) => [c.id, c]));
const catalogEntries = catalog.moduleAttribution.map(({ controlId, module, minAssuranceLevel }) => {
  const control = controlsById.get(controlId);
  assert.ok(control, `moduleAttribution references unknown controlId ${controlId}`);
  return { control, minAssuranceLevel, module };
});

const COMMON_APPLICABILITY_INPUTS = { "repo.gitHistory": true };

const NAMED_FIXTURES = {
  "web-api": { activatedModules: ["mod.web-api"] },
  "cli-lib": { activatedModules: ["mod.cli-lib"] },
  "container-iac": { activatedModules: ["mod.container-deploy", "mod.iac-cloud"] },
  "ai-agent": { activatedModules: ["mod.ai-agent"] },
  "docs-only": { activatedModules: ["mod.docs-only"] },
};

const resolvedByName = {};
for (const [name, { activatedModules }] of Object.entries(NAMED_FIXTURES)) {
  resolvedByName[name] = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules,
    applicabilityInputs: COMMON_APPLICABILITY_INPUTS,
    catalogEntries,
  });
}

// Expected required/optional per fixture, against today's live catalog
// (every control's defaultFailureMode is "block", so `optional` is
// legitimately empty for all 5 -- see design decision 1 in the builder's
// own top-of-file comment for why this is a fact about the catalog, not a
// builder defect).
const EXPECTED = {
  "web-api": { required: ["cap.dast", "cap.sca", "cap.secrets"], optional: [] },
  "cli-lib": { required: ["cap.sast", "cap.sca", "cap.secrets"], optional: [] },
  "container-iac": { required: ["cap.container", "cap.iac", "cap.sca", "cap.secrets"], optional: [] },
  "ai-agent": { required: ["cap.ai-agent", "cap.sca", "cap.secrets"], optional: [] },
  "docs-only": { required: ["cap.sca", "cap.secrets"], optional: [] },
};

for (const name of Object.keys(NAMED_FIXTURES)) {
  test(`AC9 fixture "${name}": capability plan derived entirely from resolveApplicableControls() output`, () => {
    const plan = buildCapabilityPlan(resolvedByName[name]);
    assert.deepEqual(plan.required, EXPECTED[name].required, `fixture "${name}" required mismatch`);
    assert.deepEqual(plan.optional, EXPECTED[name].optional, `fixture "${name}" optional mismatch`);
    assert.equal(typeof plan.planDigest, "string");
    assert.ok(plan.planDigest.startsWith("sha256:"), "planDigest must use the sha256: prefix convention (reused from CYB-1b's digest scheme)");
  });
}

test("docs-only's required set is a strict subset of every module-activating fixture's required set", () => {
  const docsOnlyRequired = new Set(buildCapabilityPlan(resolvedByName["docs-only"]).required);
  for (const name of ["web-api", "cli-lib", "container-iac", "ai-agent"]) {
    const otherRequired = new Set(buildCapabilityPlan(resolvedByName[name]).required);
    for (const cap of docsOnlyRequired) {
      assert.ok(otherRequired.has(cap), `expected fixture "${name}" to retain baseline capability ${cap}`);
    }
    assert.ok(otherRequired.size > docsOnlyRequired.size, `expected fixture "${name}" to require strictly more capabilities than docs-only`);
  }
});

// --- mixed failure-mode signals for the same capability root: required
// wins ties (DoD: assert with a fixture, not just prose). Synthetic
// catalogEntries, matching CYB-1b's own test-file precedent of building
// small synthetic CatalogEntry fixtures -------------------------------------

test("a capability root named by two differently-attributed resolved controls with mixed failure-mode signals ends up required (required wins ties)", () => {
  const mixedCatalogEntries = [
    {
      control: {
        id: "ctl.stack.web-api.custom-dast-block",
        revision: 1,
        status: "active",
        title: "Custom DAST check (block)",
        class: "stack",
        capabilityRequirements: ["cap.dast"],
        defaultFailureMode: "block",
      },
      minAssuranceLevel: "baseline",
      module: "mod.web-api",
    },
    {
      control: {
        id: "ctl.stack.container.custom-dast-warn",
        revision: 1,
        status: "active",
        title: "Custom DAST check (warn)",
        class: "stack",
        capabilityRequirements: ["cap.dast"],
        defaultFailureMode: "warn",
      },
      minAssuranceLevel: "baseline",
      module: "mod.container-deploy",
    },
    {
      control: {
        id: "ctl.stack.iac-cloud.custom-fuzz-warn-only",
        revision: 1,
        status: "active",
        title: "Custom fuzz check (warn only, never block-attributed)",
        class: "stack",
        capabilityRequirements: ["cap.fuzz"],
        defaultFailureMode: "warn",
      },
      minAssuranceLevel: "baseline",
      module: "mod.iac-cloud",
    },
  ];

  const resolvedPolicy = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules: ["mod.web-api", "mod.container-deploy", "mod.iac-cloud"],
    applicabilityInputs: {},
    catalogEntries: mixedCatalogEntries,
  });

  // sanity: three distinct resolved controls, two of them (different ids,
  // different modules) both name cap.dast.
  assert.equal(resolvedPolicy.resolvedControls.length, 3);
  assert.equal(
    resolvedPolicy.resolvedControls.filter((c) => c.control.capabilityRequirements.includes("cap.dast")).length,
    2,
    "expected exactly two differently-attributed resolved controls naming cap.dast",
  );

  const plan = buildCapabilityPlan(resolvedPolicy);
  assert.deepEqual(plan.required, ["cap.dast"]);
  assert.deepEqual(plan.optional, ["cap.fuzz"]);
});

// --- capability-root normalization: a cap.<family>.<technique> entry folds
// into its cap.<family> root (no live catalog control uses a technique
// suffix today -- this is the "sixth, unseen input" case) -------------------

test("a capability id with a .<technique> suffix folds into its cap.<family> root", () => {
  const catalogEntriesWithTechnique = [
    {
      control: {
        id: "ctl.stack.web-api.taint-check",
        revision: 1,
        status: "active",
        title: "Taint-flow SAST check",
        class: "stack",
        capabilityRequirements: ["cap.sast.taint-flow"],
        defaultFailureMode: "block",
      },
      minAssuranceLevel: "baseline",
      module: "mod.web-api",
    },
  ];

  const resolvedPolicy = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules: ["mod.web-api"],
    applicabilityInputs: {},
    catalogEntries: catalogEntriesWithTechnique,
  });

  const plan = buildCapabilityPlan(resolvedPolicy);
  assert.deepEqual(plan.required, ["cap.sast"]);
  assert.deepEqual(plan.optional, []);
});

// --- applicability "unknown" still contributes its capability to the plan
// (design decision 4: applicability is not consulted by this builder) ------

test('a resolved control with applicability "unknown" (missing runtime input) still contributes its capability to the plan', () => {
  const gatedCatalogEntries = [
    {
      control: {
        id: "ctl.base.secrets.rotation-evidence",
        revision: 1,
        status: "active",
        title: "Secrets rotation evidence",
        class: "base",
        applicability: { expression: "always", requiredInputs: ["repo.secretsScanCoverage"] },
        capabilityRequirements: ["cap.secrets"],
        defaultFailureMode: "block",
      },
      minAssuranceLevel: "baseline",
      module: null,
    },
  ];

  const resolvedPolicy = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules: [],
    applicabilityInputs: {}, // repo.secretsScanCoverage deliberately absent
    catalogEntries: gatedCatalogEntries,
  });

  assert.equal(resolvedPolicy.resolvedControls.length, 1);
  assert.equal(resolvedPolicy.resolvedControls[0].applicability, "unknown");

  const plan = buildCapabilityPlan(resolvedPolicy);
  assert.deepEqual(plan.required, ["cap.secrets"]);
});

// --- plan digest: determinism + sensitivity to a changed resolved policy ---

test("plan digest is identical for identical resolved-policy input, and differs when the resolved control set differs", () => {
  const planA1 = buildCapabilityPlan(resolvedByName["web-api"]);
  const planA2 = buildCapabilityPlan(resolvedByName["web-api"]);
  assert.equal(planA1.planDigest, planA2.planDigest);
  assert.deepEqual(planA1, planA2);

  const planB = buildCapabilityPlan(resolvedByName["cli-lib"]);
  assert.notEqual(planA1.planDigest, planB.planDigest, "a different activatedModules set (different resolved control set) must change the plan digest");
});

// --- purity: no mutation of resolvedPolicy, works against deeply frozen input

test("buildCapabilityPlan is pure: never mutates its resolvedPolicy input, tolerates deeply frozen input", () => {
  const resolvedPolicy = resolvedByName["web-api"];
  const before = JSON.stringify(resolvedPolicy);
  buildCapabilityPlan(resolvedPolicy);
  assert.equal(JSON.stringify(resolvedPolicy), before, "resolvedPolicy must not be mutated");

  const frozen = deepFreeze(structuredClone(resolvedPolicy));
  assert.doesNotThrow(() => buildCapabilityPlan(frozen));
  const plan = buildCapabilityPlan(frozen);
  assert.deepEqual(plan.required, EXPECTED["web-api"].required);
});

// --- malformed input is rejected with a typed error, not guessed at -------

test("malformed resolvedPolicy input throws TypeError rather than being guessed at", () => {
  assert.throws(() => buildCapabilityPlan(null), TypeError);
  assert.throws(() => buildCapabilityPlan("not-an-object"), TypeError);
  assert.throws(() => buildCapabilityPlan([]), TypeError);
  assert.throws(() => buildCapabilityPlan({ resolvedControls: [], digest: "" }), TypeError);
  assert.throws(() => buildCapabilityPlan({ resolvedControls: "not-an-array", digest: "sha256:x" }), TypeError);
  assert.throws(() => buildCapabilityPlan({
    resolvedControls: [{ control: { capabilityRequirements: "not-an-array", defaultFailureMode: "block" } }],
    digest: "sha256:x",
  }), TypeError);
});

console.log("security-capability-plan-builder: ok");
