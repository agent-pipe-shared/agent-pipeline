// SPDX-License-Identifier: SUL-1.0
//
// CYB-1f -- three views over the single reference catalog
// (governance/security-controls/catalog.json, CYB-1e), per the CYB-1
// feature-spec §5 and AC12: "generated from or validated against" the same
// catalog, never three independently-maintained documents.
//
// Exports (stable):
//   renderOperatorView(catalog = loadReferenceCatalog())
//     -> { decisionPoints: [{ id, question, options: [...] }, ...] }
//   renderDeveloperView({ assuranceLevel, activatedModules, applicabilityInputs, catalog })
//     -> { assuranceLevel, activatedModules, controls: [{ id, title, remediation,
//          severity, contributingModule, applicability, missingInputs }, ...] }
//   renderAuditorView(catalog = loadReferenceCatalog())
//     -> { framing: string, controls: [...full unmodified CYB-1a-schema
//          control records, all closed-schema fields present] }
//   renderAuditorViewNarrative(catalog = loadReferenceCatalog())
//     -> string (prose rendering of renderAuditorView's data, used as the
//        "rendered text" input to CYB-1a's lintStandardMappingsAndClaims in
//        this task's own test file)
//
// ---------------------------------------------------------------------------
// PER-VIEW STRATEGY (briefing field 1 -- "generated from" vs "validated
// against", document the choice): all three views use the SAME strategy --
// **generated directly from the catalog document on every call** -- rather
// than a separately-authored artifact plus a drift-detecting validator.
// Reasoning: a hand-authored second copy (even one with an automated
// validator) is exactly the "three independently maintained documents"
// posture AC12 exists to prevent; a pure function of the loaded catalog
// document has no second copy to drift FROM in the first place. Each
// exported render* function takes the catalog document itself (or the
// individual per-view resolution inputs, for the developer view) and
// derives its output solely from that data plus the closed
// CYB-1a/1b contracts (control-catalog-schema.mjs's field set,
// security-policy-resolver.mjs's resolution). No view caches or hand-types
// any control-derived content. This task's own test file
// (reference-catalog-views.test.mjs) demonstrates the practical
// drift-detection consequence of that design: mutating an in-memory copy of
// the catalog and re-rendering a view changes the rendered output
// accordingly (never silently stale) -- see the "drift" tests there.
//
// View-specific notes:
//   - Operator view groups by DECISION POINT (assurance-level choice, then
//     module choice), not by a raw control-ID list (feature-spec §5 "decision
//     tree framing, not a field-by-field schema dump"). Assurance-level
//     enum/order comes from security-policy-resolver.mjs's ASSURANCE_LEVELS
//     (CYB-1b, closed); per-level control counts and the module list/options
//     come from catalog.moduleAttribution + catalog.controls (CYB-1e
//     content) -- both are catalog-derived, not hardcoded.
//   - Developer view calls CYB-1b's resolveApplicableControls() against a
//     catalogEntries join of catalog.controls + catalog.moduleAttribution,
//     using the exact join pattern established by CYB-1e's own
//     reference-catalog.test.mjs (controlsById map, catalogEntries =
//     moduleAttribution.map(...)). A control whose module isn't activated or
//     whose assurance threshold isn't met is never in resolvedControls
//     (resolver's own documented behavior, AC10) -- so "only the resolved
//     controls appear" is a structural property of the resolver's output,
//     not something this module re-filters. This module's own signature
//     accepts ARBITRARY resolution input ({ assuranceLevel, activatedModules,
//     applicabilityInputs }); it is not hardcoded to any one of CYB-1e's 5
//     named fixtures. The test file supplies fixture-derived module sets
//     (e.g. CYB-1e's "web-api" -> ["mod.web-api"]) purely as concrete,
//     catalog-tied example inputs, not because the function requires them.
//   - Auditor view returns every one of the CYB-1a §8 closed 22 fields for
//     every control, unmodified (a shallow copy of each raw control record),
//     framed explicitly as traceability -- never a certification claim
//     (feature-spec §6 non-goal). The `framing` string and
//     renderAuditorViewNarrative's prose deliberately avoid the bare
//     "certified"/"compliant" claim words that CYB-1a's
//     lintStandardMappingsAndClaims (AC8) flags; standard mappings are
//     phrased as "mapped to <standard> v<version>", not "compliant with".
//
// Purity: every export is a pure function of its arguments -- no network
// access; reading catalog.json via loadReferenceCatalog()'s default
// parameter is the one documented exception (per this task's own DoD,
// reading the catalog through the existing loader is expected, not a
// purity violation). No export mutates the catalog document or any nested
// value it is given.

import { loadReferenceCatalog } from "./reference-catalog.mjs";
import {
  ASSURANCE_LEVELS,
  MODULE_PRECEDENCE_ORDER,
  resolveApplicableControls,
} from "./security-policy-resolver.mjs";

// Join catalog.controls + catalog.moduleAttribution into the
// `catalogEntries` shape security-policy-resolver.mjs's resolveApplicableControls
// documents as its input -- same join CYB-1e's reference-catalog.test.mjs
// performs, reimplemented here (not imported from that test file) so this
// module has no dependency on test-only code.
function toCatalogEntries(catalog) {
  const controlsById = new Map(catalog.controls.map((c) => [c.id, c]));
  return catalog.moduleAttribution.map(({ controlId, module, minAssuranceLevel }) => {
    const control = controlsById.get(controlId);
    if (!control) {
      throw new Error(`reference-catalog-views: moduleAttribution references unknown controlId ${JSON.stringify(controlId)}`);
    }
    return { control, minAssuranceLevel, module };
  });
}

// --- 1. Operator view -------------------------------------------------------
//
// Decision-tree framing for someone selecting an assurance level and modules
// for a NEW repository. Two decision points, in the order a new adopter would
// actually face them: (1) which assurance level, (2) which modules apply to
// this repo's tech stack. Neither decision point is a flat control-ID list.

export function renderOperatorView(catalog = loadReferenceCatalog()) {
  const controlsById = new Map(catalog.controls.map((c) => [c.id, c]));

  const countsByLevel = Object.fromEntries(ASSURANCE_LEVELS.map((level) => [level, 0]));
  for (const entry of catalog.moduleAttribution) {
    countsByLevel[entry.minAssuranceLevel] = (countsByLevel[entry.minAssuranceLevel] ?? 0) + 1;
  }

  const modulesPresent = new Set(catalog.moduleAttribution.map((e) => e.module).filter((m) => m !== null));
  const orderedModules = MODULE_PRECEDENCE_ORDER.filter((m) => modulesPresent.has(m));

  const moduleOptions = orderedModules.map((module) => {
    const activatesControls = catalog.moduleAttribution
      .filter((e) => e.module === module)
      .map((e) => ({ id: e.controlId, title: controlsById.get(e.controlId).title }));
    return { module, activatesControls };
  });

  return {
    decisionPoints: [
      {
        id: "assurance-level",
        question: "Which assurance level does this repository need (baseline / elevated / critical)?",
        options: ASSURANCE_LEVELS.map((level) => ({
          value: level,
          controlCountAtThisThreshold: countsByLevel[level],
        })),
      },
      {
        id: "modules",
        question: "Which technology-stack modules apply to this repository?",
        options: moduleOptions,
      },
    ],
  };
}

// --- 2. Developer view ------------------------------------------------------
//
// Only the controls applicable to a resolved module set, with remediation
// guidance surfaced (AC10 made human-readable). Resolution input is
// arbitrary -- see PER-VIEW STRATEGY note above.

export function renderDeveloperView({
  assuranceLevel = "baseline",
  activatedModules = [],
  applicabilityInputs = {},
  catalog = loadReferenceCatalog(),
} = {}) {
  const catalogEntries = toCatalogEntries(catalog);
  const resolved = resolveApplicableControls({ assuranceLevel, activatedModules, applicabilityInputs, catalogEntries });
  return {
    assuranceLevel: resolved.assuranceLevel,
    activatedModules: resolved.activatedModules,
    controls: resolved.resolvedControls.map((rc) => ({
      id: rc.id,
      title: rc.control.title,
      remediation: rc.control.remediation,
      severity: rc.control.severity,
      contributingModule: rc.contributingModule,
      applicability: rc.applicability,
      missingInputs: rc.missingInputs,
    })),
  };
}

// --- 3. Auditor view --------------------------------------------------------
//
// Full field set per control (all CYB-1a §8 closed fields, unmodified),
// explicitly framed as traceability -- which control maps to which
// standard/evidence -- never as a certification claim (feature-spec §6).

const AUDITOR_FRAMING =
  "Traceability view: shows which control is informatively mapped to which " +
  "named standard, and which evidence contract backs it. This view records " +
  "mappings for cross-reference only -- it is not a certification claim, and " +
  "it does not assert that any repository is certified or compliant with " +
  "any external framework.";

export function renderAuditorView(catalog = loadReferenceCatalog()) {
  return {
    framing: AUDITOR_FRAMING,
    controls: catalog.controls.map((control) => ({ ...control })),
  };
}

export function renderAuditorViewNarrative(catalog = loadReferenceCatalog()) {
  const view = renderAuditorView(catalog);
  const lines = [view.framing, ""];
  for (const control of view.controls) {
    const mappings = (control.standardMappings ?? [])
      .map((m) => `${m.standard} v${m.version}`)
      .join(", ");
    lines.push(
      `- ${control.id} (${control.title}): mapped to ${mappings || "no standards on record"}. ` +
        `Evidence contract: ${control.evidenceContract.schemaRef} ` +
        `(freshness ${control.evidenceContract.freshnessRule}, bound by ${control.evidenceContract.bindingRule}). ` +
        `Remediation: ${control.remediation}`,
    );
  }
  return lines.join("\n");
}
