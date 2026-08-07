// SPDX-License-Identifier: SUL-1.0
//
// CYB-1e -- reference catalog content + 5 stack fixtures (AC9).
//
// First real consumer of both CYB-1a's schema/lint exports
// (control-catalog-schema.mjs) and CYB-1b's resolver
// (security-policy-resolver.mjs) against a real (if intentionally small)
// reference catalog: governance/security-controls/catalog.json.
//
// catalog.json shape (this task's own authoring choice, not part of either
// closed contract): { controls: [...raw CYB-1a-schema control records...],
// moduleAttribution: [{ controlId, module, minAssuranceLevel }, ...] }.
// The module/minAssuranceLevel wrapper metadata that CYB-1b's resolver
// needs (its own `CatalogEntry` shape -- see security-policy-resolver.mjs's
// top-of-file "Resolver input/output shape" comment, design decisions 1/2)
// is NOT stored on the control records themselves -- that would add a field
// beyond CYB-1F section 8's closed list and trip validateControl's
// SCHEMA-UNKNOWN-FIELD check. It lives in this sibling `moduleAttribution`
// array instead, keyed by controlId, and is joined into CatalogEntry shape
// below, once, before building the 5 fixtures.
//
// Container/IaC fixture-grouping call (briefing field 1 point 2): CYB-1F
// section 6 registers `mod.container-deploy` and `mod.iac-cloud` as two
// separate module IDs, but this briefing's own DoD (AC9 checklist) names
// exactly 5 fixtures with "container/IaC" as ONE of the five -- so this task
// combines both modules into a single fixture (activatedModules includes
// both), rather than splitting into two fixtures and ending up with 6.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateControl,
  lintCatalogContent,
  lintStandardMappingsAndClaims,
} from "./control-catalog-schema.mjs";
import { resolveApplicableControls } from "./security-policy-resolver.mjs";
import { loadReferenceCatalog } from "./reference-catalog.mjs";

const catalog = loadReferenceCatalog();

// --- precondition: the catalog itself is schema-valid ----------------------
// Asserted here as a top-level (fail-fast at load time) check, not a
// separate registered verify suite (that is CYB-1h's job) and not wrapped in
// a named test() -- a malformed reference catalog must fail loudly right
// here, before any of the 5 fixtures below even get a chance to run, not
// surface as a confusing fixture-level failure downstream.

assert.ok(Array.isArray(catalog.controls) && catalog.controls.length > 0, "catalog.controls must be a non-empty array");
for (const control of catalog.controls) {
  const result = validateControl(control);
  assert.equal(result.valid, true, `control ${control && control.id} failed validateControl(): ${JSON.stringify(result.errors)}`);
}
const catalogLint = lintCatalogContent(catalog.controls);
assert.deepEqual(catalogLint, { valid: true }, `lintCatalogContent failed: ${JSON.stringify(catalogLint.errors)}`);
const mappingsLint = lintStandardMappingsAndClaims(catalog.controls);
assert.deepEqual(mappingsLint, { valid: true }, `lintStandardMappingsAndClaims failed: ${JSON.stringify(mappingsLint.errors)}`);

// --- join controls + moduleAttribution into CatalogEntry shape -------------
// (resolveApplicableControls's own documented `catalogEntries` input shape:
// Array<{ control, minAssuranceLevel, module }> -- read from
// security-policy-resolver.mjs's top-of-file JSDoc, not guessed.)

const controlsById = new Map(catalog.controls.map((c) => [c.id, c]));
assert.ok(Array.isArray(catalog.moduleAttribution) && catalog.moduleAttribution.length > 0, "catalog.moduleAttribution must be a non-empty array");

const catalogEntries = catalog.moduleAttribution.map(({ controlId, module, minAssuranceLevel }) => {
  const control = controlsById.get(controlId);
  assert.ok(control, `moduleAttribution references unknown controlId ${controlId}`);
  return { control, minAssuranceLevel, module };
});

// sanity: every catalog control is attributed exactly once (no orphans, no
// silently-unattributed controls that would never appear in any fixture).
assert.equal(catalogEntries.length, catalog.controls.length, "every catalog control must have exactly one moduleAttribution entry");

// --- the 5 named fixtures (AC9) ---------------------------------------------

const COMMON_APPLICABILITY_INPUTS = { "repo.gitHistory": true };

const FIXTURES = {
  "web-api": { activatedModules: ["mod.web-api"], applicabilityInputs: { "repo.hasPackageSources": true } },
  "cli-lib": { activatedModules: ["mod.cli-lib"], applicabilityInputs: { "repo.hasPackageSources": true } },
  "container-iac": { activatedModules: ["mod.container-deploy", "mod.iac-cloud"], applicabilityInputs: { "repo.hasPackageSources": true } },
  "ai-agent": { activatedModules: ["mod.ai-agent"], applicabilityInputs: { "repo.hasPackageSources": true } },
  "docs-only": { activatedModules: ["mod.docs-only"], applicabilityInputs: { "repo.hasPackageSources": false } },
};

assert.equal(Object.keys(FIXTURES).length, 5, "AC9 requires exactly 5 named fixtures");

const resolved = {};
for (const [name, { activatedModules, applicabilityInputs }] of Object.entries(FIXTURES)) {
  resolved[name] = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules,
    applicabilityInputs: { ...COMMON_APPLICABILITY_INPUTS, ...applicabilityInputs },
    catalogEntries,
  });
}

// --- per-fixture module-relevance checks (named, one per AC9 fixture) ------

test("AC9 fixture: web-api resolves its own mod.web-api stack control", () => {
  const r = resolved["web-api"];
  assert.ok(r.resolvedControls.some((c) => c.id === "ctl.stack.web-api.rate-limit-config" && c.contributingModule === "mod.web-api"));
});

test("AC9 fixture: cli-lib resolves its own mod.cli-lib stack control", () => {
  const r = resolved["cli-lib"];
  assert.ok(r.resolvedControls.some((c) => c.id === "ctl.stack.cli-lib.argument-injection-guard" && c.contributingModule === "mod.cli-lib"));
});

test("AC9 fixture: container-iac (combined per briefing field 1 point 2) resolves both mod.container-deploy and mod.iac-cloud stack controls", () => {
  const r = resolved["container-iac"];
  assert.ok(r.resolvedControls.some((c) => c.id === "ctl.stack.container.nonroot-user" && c.contributingModule === "mod.container-deploy"));
  assert.ok(r.resolvedControls.some((c) => c.id === "ctl.stack.iac-cloud.state-encryption" && c.contributingModule === "mod.iac-cloud"));
});

test("AC9 fixture: ai-agent resolves its own mod.ai-agent risk control", () => {
  const r = resolved["ai-agent"];
  assert.ok(r.resolvedControls.some((c) => c.id === "ctl.risk.ai-agent.tool-authority-manifest" && c.contributingModule === "mod.ai-agent"));
});

test("AC9 fixture: docs-only resolves only universal/base controls -- the CYB-1F section 6 lowest-precedence / not-applicable path for non-software repositories, confirmed against the resolver's actual output", () => {
  const r = resolved["docs-only"];
  const ids = r.resolvedControls.map((c) => c.id).sort();
  assert.deepEqual(ids, ["ctl.base.sca.dependency-lockfile", "ctl.base.secrets.no-committed-secrets"]);
  assert.equal(r.resolvedControls.find((c) => c.id === "ctl.base.sca.dependency-lockfile")?.applicability, "not-applicable");
  for (const c of r.resolvedControls) {
    assert.equal(c.contributingModule, null, `docs-only must not resolve any module-specific control, got contributingModule=${c.contributingModule} for ${c.id}`);
  }
});

// --- cross-fixture properties -----------------------------------------------

test("AC9: all 5 fixtures resolve genuinely distinct control-ID sets (pairwise, set-based)", () => {
  const idSets = Object.fromEntries(
    Object.entries(resolved).map(([name, r]) => [name, new Set(r.resolvedControls.map((c) => c.id))]),
  );
  const names = Object.keys(idSets);
  assert.equal(names.length, 5);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [names[i], names[j]];
      const same = idSets[a].size === idSets[b].size && [...idSets[a]].every((id) => idSets[b].has(id));
      assert.ok(!same, `fixtures "${a}" and "${b}" resolved to the identical control-ID set -- expected genuine distinctness (AC9)`);
    }
  }
});

test("AC9: docs-only is a strict subset of every module-activating fixture (lowest precedence, never adds tooling of its own)", () => {
  const docsOnlyIds = resolved["docs-only"].resolvedControls.map((c) => c.id).sort();
  for (const name of ["web-api", "cli-lib", "container-iac", "ai-agent"]) {
    const otherIds = new Set(resolved[name].resolvedControls.map((c) => c.id));
    for (const id of docsOnlyIds) {
      assert.ok(otherIds.has(id), `expected fixture "${name}" to retain the universal control ${id} that docs-only also resolves`);
    }
    assert.ok(otherIds.size > docsOnlyIds.length, `expected fixture "${name}" to resolve strictly more controls than docs-only`);
  }
});

console.log("reference-catalog: ok");
