// SPDX-License-Identifier: SUL-1.0
//
// CYB-1f -- tests for the three catalog views (reference-catalog-views.mjs),
// AC12. Structure:
//   1. Operator view: decision-tree grouping (structural, not eyeballed) +
//      drift-detection (mutate an in-memory catalog copy, assert the
//      regenerated view changes).
//   2. Developer view: only-resolved-controls (an excluded control must not
//      appear) + remediation surfaced + drift-detection.
//   3. Auditor view: full 22-field set per control + non-certification
//      wording (reusing CYB-1a's own lintStandardMappingsAndClaims, AC8, per
//      briefing field 3) + drift-detection.
// All fixtures/scenarios here are permanent regression coverage (briefing's
// NEW-FEATURE module), not scratch checks.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadReferenceCatalog } from "./reference-catalog.mjs";
import { lintStandardMappingsAndClaims } from "./control-catalog-schema.mjs";
import {
  renderOperatorView,
  renderDeveloperView,
  renderAuditorView,
  renderAuditorViewNarrative,
} from "./reference-catalog-views.mjs";

const catalog = loadReferenceCatalog();

function cloneCatalog() {
  return JSON.parse(JSON.stringify(catalog));
}

// ============================================================================
// 1. Operator view
// ============================================================================

test("operator view: groups by decision point (assurance level, then modules), not a raw control-ID list", () => {
  const view = renderOperatorView(catalog);
  assert.ok(Array.isArray(view.decisionPoints), "operator view must expose decisionPoints");
  assert.ok(!Array.isArray(view.controls), "operator view must NOT expose a flat top-level control list");
  assert.ok(!Array.isArray(view.resolvedControls), "operator view must NOT expose a flat resolved-control list");

  const byId = Object.fromEntries(view.decisionPoints.map((dp) => [dp.id, dp]));
  assert.ok(byId["assurance-level"], "must have an assurance-level decision point");
  assert.ok(byId["modules"], "must have a modules decision point");

  const levelOption = byId["assurance-level"].options;
  assert.deepEqual(levelOption.map((o) => o.value), ["baseline", "elevated", "critical"]);

  const moduleOptions = byId["modules"].options;
  assert.ok(moduleOptions.length > 0, "at least one module option expected from this catalog");
  for (const opt of moduleOptions) {
    assert.equal(typeof opt.module, "string");
    assert.ok(Array.isArray(opt.activatesControls) && opt.activatesControls.length > 0);
    for (const c of opt.activatesControls) {
      assert.equal(typeof c.id, "string");
      assert.equal(typeof c.title, "string");
    }
  }
  // web-api module must be one of the surfaced options, tied to real catalog content.
  const webApi = moduleOptions.find((o) => o.module === "mod.web-api");
  assert.ok(webApi);
  assert.ok(webApi.activatesControls.some((c) => c.id === "ctl.stack.web-api.rate-limit-config"));
});

test("operator view drift: a new moduleAttribution entry for an existing module changes that module's option", () => {
  const before = renderOperatorView(catalog);
  const beforeWebApi = before.decisionPoints.find((dp) => dp.id === "modules").options.find((o) => o.module === "mod.web-api");

  const mutated = cloneCatalog();
  mutated.controls.push({
    ...mutated.controls.find((c) => c.id === "ctl.stack.web-api.rate-limit-config"),
    id: "ctl.stack.web-api.cors-policy-config",
    title: "CORS policy configured",
  });
  mutated.moduleAttribution.push({ controlId: "ctl.stack.web-api.cors-policy-config", module: "mod.web-api", minAssuranceLevel: "baseline" });

  const after = renderOperatorView(mutated);
  const afterWebApi = after.decisionPoints.find((dp) => dp.id === "modules").options.find((o) => o.module === "mod.web-api");

  assert.notEqual(afterWebApi.activatesControls.length, beforeWebApi.activatesControls.length);
  assert.ok(afterWebApi.activatesControls.some((c) => c.id === "ctl.stack.web-api.cors-policy-config"));
  assert.ok(!beforeWebApi.activatesControls.some((c) => c.id === "ctl.stack.web-api.cors-policy-config"));
});

test("operator view drift: raising a control's minAssuranceLevel changes the assurance-level counts", () => {
  const before = renderOperatorView(catalog);
  const beforeCounts = Object.fromEntries(before.decisionPoints.find((dp) => dp.id === "assurance-level").options.map((o) => [o.value, o.controlCountAtThisThreshold]));

  const mutated = cloneCatalog();
  const entry = mutated.moduleAttribution.find((e) => e.controlId === "ctl.stack.web-api.rate-limit-config");
  entry.minAssuranceLevel = "elevated";

  const after = renderOperatorView(mutated);
  const afterCounts = Object.fromEntries(after.decisionPoints.find((dp) => dp.id === "assurance-level").options.map((o) => [o.value, o.controlCountAtThisThreshold]));

  assert.notEqual(afterCounts.baseline, beforeCounts.baseline);
  assert.notEqual(afterCounts.elevated, beforeCounts.elevated);
});

// ============================================================================
// 2. Developer view
// ============================================================================

// Concrete example resolutions, deliberately reusing two of CYB-1e's 5 named
// fixtures' activatedModules sets (reference-catalog.test.mjs) as catalog-tied
// examples -- renderDeveloperView itself accepts arbitrary resolution input,
// it is not hardcoded to these.
const COMMON_APPLICABILITY_INPUTS = { "repo.gitHistory": true };

test("developer view: only resolved controls appear -- an unresolved module's control must NOT appear", () => {
  const view = renderDeveloperView({
    assuranceLevel: "baseline",
    activatedModules: ["mod.web-api"],
    applicabilityInputs: COMMON_APPLICABILITY_INPUTS,
    catalog,
  });
  const ids = view.controls.map((c) => c.id);
  assert.ok(ids.includes("ctl.stack.web-api.rate-limit-config"), "expected the activated module's own control to appear");
  assert.ok(!ids.includes("ctl.stack.cli-lib.argument-injection-guard"), "cli-lib control must NOT appear when only mod.web-api is activated");
  assert.ok(!ids.includes("ctl.risk.ai-agent.tool-authority-manifest"), "ai-agent control must NOT appear when only mod.web-api is activated");
});

test("developer view: remediation guidance is surfaced for every resolved control", () => {
  const view = renderDeveloperView({
    assuranceLevel: "baseline",
    activatedModules: ["mod.cli-lib"],
    applicabilityInputs: COMMON_APPLICABILITY_INPUTS,
    catalog,
  });
  assert.ok(view.controls.length > 0);
  for (const c of view.controls) {
    assert.equal(typeof c.remediation, "string");
    assert.ok(c.remediation.trim().length > 0, `control ${c.id} must have non-empty remediation in the developer view`);
  }
});

test("developer view: docs-only-style empty module set resolves only the universal base controls (cross-check against CYB-1e's own docs-only fixture result)", () => {
  const view = renderDeveloperView({
    assuranceLevel: "baseline",
    activatedModules: ["mod.docs-only"],
    applicabilityInputs: COMMON_APPLICABILITY_INPUTS,
    catalog,
  });
  const ids = view.controls.map((c) => c.id).sort();
  assert.deepEqual(ids, ["ctl.base.sca.dependency-lockfile", "ctl.base.secrets.no-committed-secrets"]);
});

test("developer view drift: mutating a resolved control's remediation text changes the rendered view", () => {
  const before = renderDeveloperView({
    assuranceLevel: "baseline",
    activatedModules: ["mod.web-api"],
    applicabilityInputs: COMMON_APPLICABILITY_INPUTS,
    catalog,
  });
  const beforeRemediation = before.controls.find((c) => c.id === "ctl.stack.web-api.rate-limit-config").remediation;

  const mutated = cloneCatalog();
  const control = mutated.controls.find((c) => c.id === "ctl.stack.web-api.rate-limit-config");
  control.remediation = "Rotate rate-limit middleware config and redeploy (test-only mutated remediation).";

  const after = renderDeveloperView({
    assuranceLevel: "baseline",
    activatedModules: ["mod.web-api"],
    applicabilityInputs: COMMON_APPLICABILITY_INPUTS,
    catalog: mutated,
  });
  const afterRemediation = after.controls.find((c) => c.id === "ctl.stack.web-api.rate-limit-config").remediation;

  assert.notEqual(afterRemediation, beforeRemediation, "a mismatch here would indicate a stale/hand-typed developer view that failed to pick up the catalog edit");
  assert.equal(afterRemediation, control.remediation);
});

// ============================================================================
// 3. Auditor view
// ============================================================================

const EXPECTED_FIELD_COUNT = 22; // CYB-1F §8 closed field set (control-catalog-schema.mjs top comment)

test("auditor view: every control carries its full closed field set (incl. standardMappings, evidenceContract), unmodified", () => {
  const view = renderAuditorView(catalog);
  assert.equal(view.controls.length, catalog.controls.length);
  for (const control of view.controls) {
    const original = catalog.controls.find((c) => c.id === control.id);
    assert.deepEqual(control, original, `auditor view entry for ${control.id} must be an unmodified copy of the raw catalog control record`);
    assert.equal(Object.keys(control).length, EXPECTED_FIELD_COUNT, `control ${control.id} must expose exactly the ${EXPECTED_FIELD_COUNT} closed schema fields`);
    assert.ok("standardMappings" in control, "standardMappings must be present");
    assert.ok("evidenceContract" in control, "evidenceContract must be present");
  }
});

test("auditor view: framing and narrative are traceability-only, never a certification claim (AC8, reusing CYB-1a's lintStandardMappingsAndClaims)", () => {
  const view = renderAuditorView(catalog);
  const narrative = renderAuditorViewNarrative(catalog);
  assert.ok(narrative.includes(view.framing), "narrative must include the view's own framing text");

  const framingLint = lintStandardMappingsAndClaims([], view.framing);
  assert.deepEqual(framingLint, { valid: true }, `auditor view framing must not read as a bare certification claim: ${JSON.stringify(framingLint.errors)}`);

  const narrativeLint = lintStandardMappingsAndClaims([], narrative);
  assert.deepEqual(narrativeLint, { valid: true }, `auditor view narrative must not read as a bare certification claim: ${JSON.stringify(narrativeLint.errors)}`);
});

test("auditor view: lintStandardMappingsAndClaims genuinely has teeth -- a naive bare claim sentence IS flagged (negative control, proves the check above is not vacuous)", () => {
  const badSentence = "This repository is certified compliant with NIST SSDF.";
  const result = lintStandardMappingsAndClaims([], badSentence);
  assert.equal(result.valid, false, "a bare certified/compliant claim without a qualifying disclaimer must be flagged");
  assert.ok(result.errors.some((e) => e.code === "CATALOG-LINT-BARE-CLAIM"));
});

test("auditor view drift: mutating a control's standardMappings/evidenceContract changes both the object view and the narrative text", () => {
  const beforeView = renderAuditorView(catalog);
  const beforeNarrative = renderAuditorViewNarrative(catalog);
  const beforeControl = beforeView.controls.find((c) => c.id === "ctl.base.secrets.no-committed-secrets");

  const mutated = cloneCatalog();
  const control = mutated.controls.find((c) => c.id === "ctl.base.secrets.no-committed-secrets");
  control.standardMappings = [{ standard: "NIST SSDF", version: "9.9" }];
  control.evidenceContract = { ...control.evidenceContract, freshnessRule: "1h" };

  const afterView = renderAuditorView(mutated);
  const afterNarrative = renderAuditorViewNarrative(mutated);
  const afterControl = afterView.controls.find((c) => c.id === "ctl.base.secrets.no-committed-secrets");

  assert.notDeepEqual(afterControl.standardMappings, beforeControl.standardMappings);
  assert.notEqual(afterControl.evidenceContract.freshnessRule, beforeControl.evidenceContract.freshnessRule);
  assert.notEqual(afterNarrative, beforeNarrative, "a mismatch here would indicate a stale/hand-typed auditor narrative that failed to pick up the catalog edit");
  assert.ok(afterNarrative.includes("NIST SSDF v9.9"));
});

// ============================================================================
// Purity: no export mutates the catalog document it is given.
// ============================================================================

test("all three view generators are pure -- none mutates the input catalog", () => {
  const snapshot = cloneCatalog();
  renderOperatorView(catalog);
  renderDeveloperView({ assuranceLevel: "baseline", activatedModules: ["mod.ai-agent"], applicabilityInputs: COMMON_APPLICABILITY_INPUTS, catalog });
  renderAuditorView(catalog);
  renderAuditorViewNarrative(catalog);
  assert.deepEqual(catalog, snapshot, "catalog document must be unchanged after rendering all views");
});

console.log("reference-catalog-views: ok");
