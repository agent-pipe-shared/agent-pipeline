// SPDX-License-Identifier: SUL-1.0
// C20 w252 (G20-5, Claude greenfield on Windows, 2026-11-07): after a signed approve-plan, `set-phase --phase
// implementation` was refused with GUARD-ARCHITECTURE-ADOPTION-UNRESOLVED and "Record one PO-owned approved-scoped or
// partial adoption decision". The approved PRD carried a valid architecture design block, so the sanctioned next step
// was the agent-run `pipeline-state.mjs materialize-architecture`. Following the text, the session took the brownfield
// adoption route: a PO adoption signature, two human-override ceremonies, about eight PO terminal commands, and then
// ARCHITECTURE-DESIGN-EXISTING-ESTATE because the adoption record now sat beside the scaffold.
//
// Pinned here: the adoption disposition, the guard and the adoption CLI name the materialization step for an approved
// greenfield design, and every other disposition keeps its previous text.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  STATE_MATERIALIZATION_REQUIRED,
  checkPlanningAdoptionDisposition,
  greenfieldMaterializationPending,
} from "../../scripts/architecture-adoption.mjs";
import { architectureAdoptionAuthorityVerdict } from "../guard/entry-gates.mjs";
import { ARCHITECTURE_ADOPTION_DENIAL_CODE, PIPELINE_STATE_SCRIPT } from "../guard/constants.mjs";
import { observeArchitectureAdoptionOrientation } from "../architecture-adoption-orientation.mjs";

const COMMAND = `node '${PIPELINE_STATE_SCRIPT}' set-phase --phase implementation`;
const PLAN = "specs/f/prd.md";
const pending = () => ({ ok: true, status: "materialization-required", targets: [], receipt: null, scope: ["src/"] });

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "c20-w252-g20-5-"));
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("checkPlanningAdoptionDisposition names materialize-architecture for an approved greenfield design", () => withRoot((root) => {
  const result = checkPlanningAdoptionDisposition(root, PLAN, new Date(), { inspectArchitectureDesign: pending });
  assert.equal(result.ok, false, "an unmaterialized design is still no implementation authority");
  assert.equal(result.disposition, STATE_MATERIALIZATION_REQUIRED);
  assert.match(result.error, /materialize-architecture/u);
  assert.match(result.error, /no separate PO adoption decision/u);
  assert.ok(result.error.includes(PIPELINE_STATE_SCRIPT), "the exact writer path is named");
}));

test("checkPlanningAdoptionDisposition keeps adoption-required for a repository without an approved design", () => withRoot((root) => {
  const notRequired = () => ({ ok: true, status: "not-required" });
  const result = checkPlanningAdoptionDisposition(root, PLAN, new Date(), { inspectArchitectureDesign: notRequired });
  assert.equal(result.ok, false);
  assert.equal(result.disposition, "adoption-required");
  assert.doesNotMatch(result.error, /materialize-architecture/u);
}));

test("the guard denial names the materialization step and drops the PO adoption line for that disposition only", () => withRoot((root) => {
  const base = { activeFeaturePlanningScopeFn: () => PLAN };
  const materialize = architectureAdoptionAuthorityVerdict(root, COMMAND, { ...base,
    checkPlanningAdoptionDispositionFn: (r, s) => checkPlanningAdoptionDisposition(r, s, new Date(), { inspectArchitectureDesign: pending }) });
  assert.equal(materialize.exitCode, 2, "still a denial: implementation authority needs the materialized design");
  assert.match(materialize.stderr, new RegExp(ARCHITECTURE_ADOPTION_DENIAL_CODE, "u"));
  assert.match(materialize.stderr, /materialize-architecture/u);
  assert.match(materialize.stderr, /This is not an adoption decision/u);
  assert.doesNotMatch(materialize.stderr, /Record one PO-owned/u);

  const brownfield = architectureAdoptionAuthorityVerdict(root, COMMAND, { ...base,
    checkPlanningAdoptionDispositionFn: () => ({ ok: false, disposition: "adoption-required", error: "Architecture adoption disposition is unresolved (adoption-required)." }) });
  assert.equal(brownfield.exitCode, 2);
  assert.match(brownfield.stderr, /Record one PO-owned approved-scoped or partial adoption decision/u, "the brownfield text is unchanged");
  assert.doesNotMatch(brownfield.stderr, /This is not an adoption decision/u);

  const resolved = architectureAdoptionAuthorityVerdict(root, COMMAND, { ...base,
    checkPlanningAdoptionDispositionFn: () => ({ ok: true, disposition: "approved-scoped" }) });
  assert.equal(resolved, null, "a resolved disposition is still admitted");
}));

test("the adoption CLI refuses prepare/apply only while an approved greenfield design awaits materialization", () => withRoot((root) => {
  assert.equal(greenfieldMaterializationPending(root, { inspectArchitectureDesign: pending }), true);
  for (const other of [
    () => ({ ok: true, status: "not-required" }),
    () => ({ ok: true, status: "materialized" }),
    () => ({ ok: false, status: "design-required", code: "ARCHITECTURE-DESIGN-EXISTING-ESTATE" }),
    () => { throw new Error("inspection failed"); },
  ]) assert.equal(greenfieldMaterializationPending(root, { inspectArchitectureDesign: other }), false, "every other state keeps the adoption route");
}));

test("the design-pending orientation names the materialization step and warns off the adoption route", () => withRoot((root) => {
  const readback = observeArchitectureAdoptionOrientation({ rootDir: root, deps: {
    resolveAdoptionState: () => ({ state: "adoption-required" }),
    hasExactGreenfieldDesignPendingScaffold: () => true,
  } });
  assert.equal(readback.status, "design-pending");
  assert.match(readback.guidance, /materialize-architecture/u);
  assert.match(readback.guidance, /no separate PO decision/u);
  assert.match(readback.guidance, /Do not use architecture-adoption\.mjs prepare\/apply/u);
  assert.doesNotMatch(readback.guidance, /then record a scoped architecture disposition/u, "the sentence that sent the session down the brownfield route is gone");
}));
