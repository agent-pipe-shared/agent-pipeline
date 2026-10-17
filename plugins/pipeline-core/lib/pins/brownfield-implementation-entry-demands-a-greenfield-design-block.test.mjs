// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.brownfield-implementation-entry-demands-a-greenfield-design-block (AC-119).
// PARTIAL (interim): covers the draft-time applicability predicate and the entry-readiness
// fall-through to the adoption disposition through the real modules. The implementation-entry
// inspector itself is pinned by lib/architecture-design.test.mjs (hotfix 9 cases) and is not
// re-pinned here; the net-new ratchet point is NOT covered (see the dispatch report).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { inspectArchitectureDesignDraft } from "../architecture-design.mjs";
import { initialGreenfieldMapTargets } from "../architecture-map-scaffold.mjs";
import { ARCHITECTURE_ENTRY_SCOPE, inspectArchitectureEntryReadiness } from "../architecture-entry-readiness.mjs";

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const PLAN = "specs/f/prd.md";
const PRD = "# Brownfield plan\n\nNo greenfield architecture design block.\n";
const sha = (text) => createHash("sha256").update(text).digest("hex");

function fixture(name, scaffold) {
  const root = join(repoRoot, "scratch", `p21-01-${name}-${process.pid}`);
  rmSync(root, { recursive: true, force: true });
  const put = (rel, text) => { const p = join(root, ...rel.split("/")); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };
  put(PLAN, PRD);
  for (const target of initialGreenfieldMapTargets("fresh")) {
    if (scaffold === "exact") put(target.path, target.bytes);
    if (scaffold === "edited") put(target.path, `${target.bytes}\n<!-- brownfield edit -->\n`);
  }
  return root;
}

test("a repository without the fresh greenfield scaffold needs no design block at draft time", () => {
  for (const scaffold of ["none", "edited"]) {
    const root = fixture(scaffold, scaffold);
    try {
      assert.deepEqual(inspectArchitectureDesignDraft({ rootDir: root, planPath: PLAN, expectedPlanSha256: sha(PRD) }),
        { ok: true, required: false }, scaffold);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("greenfield stays strict: the byte-exact fresh scaffold still demands the design block", () => {
  const root = fixture("exact", "exact");
  try {
    const result = inspectArchitectureDesignDraft({ rootDir: root, planPath: PLAN, expectedPlanSha256: sha(PRD) });
    assert.equal(result.ok, false);
    assert.equal(result.required, true);
    assert.equal(result.code, "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a not-required design result falls through to the adoption disposition (deferred stays ready, report-only)", () => {
  let dispositionReads = 0;
  const result = inspectArchitectureEntryReadiness({
    rootDir: repoRoot,
    // Only already-existing paths: a deferral covers those; net-new paths are ratcheted (case (c)).
    planningSurface: { planPath: PLAN, paths: ["CLAUDE.md"] },
    deps: {
      evaluateArchitectureFitness: () => ({ overallStatus: "blocked", outcomes: tenOutcomes(true), summary: {} }),
      inspectArchitectureDesign: () => ({ ok: true, status: "not-required", required: false, scope: null }),
      readCheckpointArchitectureDebt: () => ({ ok: true, debt: [], resolvedDebt: [] }),
      checkPlanningAdoptionDisposition: () => { dispositionReads += 1; return { ok: true, disposition: "deferred", scope: [ARCHITECTURE_ENTRY_SCOPE], expiresAt: "2099-01-01" }; },
    },
  });
  assert.equal(dispositionReads, 1, "the adoption disposition path is consulted");
  assert.equal(result.status, "ready", JSON.stringify(result));
  assert.notEqual(result.code, "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED");
  assert.equal(result.fitness.blockingOverallStatus, "deferred");
});

test("a missing design block on a greenfield result still blocks with its exact PRD action", () => {
  const result = inspectArchitectureEntryReadiness({
    rootDir: repoRoot,
    deps: { inspectArchitectureDesign: () => ({ ok: false, status: "design-required", code: "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED", prdPath: PLAN }) },
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.code, "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED");
  assert.equal(result.nextAction.prdPath, PLAN);
});

// ---- (a) implementation-entry exemption in inspectArchitectureDesign (staged-stub pattern of lib/architecture-design.test.mjs hotfix 9) ----
import { mkdtempSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { architectureFitnessAuthorityVerdict } from "../guard/entry-gates.mjs";
import { PIPELINE_STATE_SCRIPT } from "../guard/constants.mjs";

const LIB = fileURLToPath(new URL("../", import.meta.url));
const STUBS = new Map([["./plan-spec-state-v2.mjs", "stub-lifecycle.mjs"], ["./po-gate-authority.mjs", "stub-authority.mjs"],
  ["./design-workflow-package.mjs", "stub-dwp.mjs"], ["./design-workflow-approval.mjs", "stub-dwa.mjs"], ["./critical-human-proof-policy.mjs", "stub-policy.mjs"]]);
const STUB_SOURCES = {
  "stub-lifecycle.mjs": `export function derivePlanLifecycle() { return { ok: true, status: "approved" }; }\n`,
  "stub-authority.mjs": `import { readFileSync } from "node:fs";\nimport { join } from "node:path";\nexport function validatePoGateAuthorityForRepository({ repoRoot }) {\n  const state = JSON.parse(readFileSync(join(repoRoot, "project", "pipeline-state.json"), "utf8"));\n  return { ok: true, value: state.planApproval.poGateAuthority };\n}\n`,
  "stub-dwp.mjs": `export function readDesignWorkflowPackageFromRepository() { return { ok: false, code: "TEST-DWP-UNUSED" }; }\nexport function rereadApprovedDesignWorkflowPackage() { return { ok: false, code: "TEST-DWP-UNUSED" }; }\n`,
  "stub-dwa.mjs": `export function verifyStoredDesignWorkflowPackageSignature() { return { ok: false, code: "TEST-DWA-UNUSED" }; }\n`,
  "stub-policy.mjs": `export function readCriticalHumanProofPolicy() { return { ok: false, code: "TEST-POLICY-UNUSED" }; }\n`,
};
const SPEC = "specs/f/spec.md";
const NOT_REQUIRED = { ok: true, status: "not-required", required: false, scope: null };
let staged;
async function loadStaged() {
  staged ??= (async () => {
    const stage = mkdtempSync(join(tmpdir(), "p21-01b-"));
    process.on("exit", () => { try { rmSync(stage, { recursive: true, force: true }); } catch { /* best effort */ } });
    for (const [file, source] of Object.entries(STUB_SOURCES)) writeFileSync(join(stage, file), source);
    const out = readFileSync(join(LIB, "architecture-design.mjs"), "utf8").replace(/(["'])(\.{1,2}\/[^"']+)\1/gu, (_m, q, spec) =>
      `${q}${pathToFileURL(STUBS.has(spec) ? join(stage, STUBS.get(spec)) : resolve(LIB, spec)).href}${q}`);
    writeFileSync(join(stage, "architecture-design-staged.mjs"), out);
    return import(pathToFileURL(join(stage, "architecture-design-staged.mjs")).href);
  })();
  return staged;
}
const roots = [];
process.on("exit", () => { for (const r of roots) { try { rmSync(r, { recursive: true, force: true }); } catch { /* best effort */ } } });
function entryFixture(scaffold, { receipt = false } = {}) {
  // A plain directory with the neutral project-authority files and no git: the stubbed lifecycle/authority
  // modules below make the shared aggregate fixture (which needs the unavailable State authority route) unnecessary.
  const root = join(repoRoot, "scratch", `p22-04-entry-${scaffold}-${receipt ? "r" : "n"}-${process.pid}`);
  rmSync(root, { recursive: true, force: true });
  roots.push(root);
  const put = (rel, text) => { const p = join(root, ...rel.split("/")); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };
  const baseline = JSON.stringify({ schema: "pipeline.project.v1", project: "p22-04", verify: null, autonomy: "gated", handover: "docs/state.md" });
  put("project/pipeline.json", baseline); put(".claude/pipeline.json", baseline);
  put("project/pipeline.yaml", "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n"); put(".claude/pipeline.yaml", "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n");
  put(PLAN, PRD); put(SPEC, "# Spec\n");
  put("project/pipeline-state.json", JSON.stringify({ activeFeature: { id: "feat-1", planPath: PLAN },
    planApproval: { poGateAuthority: { planPath: PLAN, specPath: SPEC } },
    continuity: { featureId: "feat-1", authority: { prd: { path: PLAN, sha256: sha(PRD) }, spec: { path: SPEC, sha256: sha("# Spec\n") } } } }));
  const [index, inventory] = initialGreenfieldMapTargets("fresh");
  const edited = (t) => ({ ...t, bytes: `${t.bytes}\n<!-- brownfield edit -->\n` });
  for (const t of { none: [], exact: [index, inventory], edited: [edited(index), edited(inventory)], partial: [index] }[scaffold]) put(t.path, t.bytes);
  if (receipt) put("architecture/design-materialization.json", "{}\n");
  return root;
}

test("implementation entry exempts a non-greenfield repository from the design block, as the draft inspector does", async () => {
  const mod = await loadStaged();
  for (const scaffold of ["none", "edited"]) {
    assert.deepEqual(mod.inspectArchitectureDesign(entryFixture(scaffold), PLAN, {}), NOT_REQUIRED, scaffold);
  }
});

test("implementation entry stays strict for the byte-exact scaffold, a partial scaffold and a materialization receipt", async () => {
  const mod = await loadStaged();
  const exact = mod.inspectArchitectureDesign(entryFixture("exact"), PLAN, {});
  assert.equal(exact.code, "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED");
  assert.equal(exact.prdPath, PLAN);
  assert.match(mod.inspectArchitectureDesign(entryFixture("partial"), PLAN, {}).code, /ENOENT/u, "partial scaffold fails closed");
  assert.equal(mod.inspectArchitectureDesign(entryFixture("none", { receipt: true }), PLAN, {}).code, "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED");
});

// ---- (b) second gate: hooks/guard-lifecycle-ready.mjs -> lib/guard/lifecycle-gate.mjs -> lib/guard/entry-gates.mjs architectureFitnessAuthorityVerdict ----
const SURFACE = { planPath: PLAN, paths: ["docs/adr/0001-x.md", "schemas/x.json", "architecture/map/index.md", "src/brand-new.mjs"] };
const tenOutcomes = (finding) => Array.from({ length: 10 }, (_, i) => ({ classId: i + 1, outcome: finding && i === 0 ? "finding" : "pass" }));
const COMMAND = `node '${PIPELINE_STATE_SCRIPT}' set-phase --phase implementation`;
const guardDeps = (over) => ({ activeFeaturePlanningScopeFn: () => PLAN, activeFeaturePlanningSurfaceFn: () => SURFACE,
  checkPlanningAdoptionDispositionFn: () => ({ ok: true, disposition: "deferred" }),
  evaluateArchitectureFitnessFn: () => ({ overallStatus: "blocked", outcomes: tenOutcomes(true) }), ...over });

test("under a PO deferral the guard defers to the library entry verdict for the same root and task scope", () => {
  const seen = [];
  const ready = architectureFitnessAuthorityVerdict(repoRoot, COMMAND, guardDeps({ inspectArchitectureEntryReadinessFn: (input) => { seen.push(input); return { status: "ready" }; } }));
  assert.equal(ready, null);
  assert.deepEqual(seen, [{ rootDir: repoRoot, taskScope: PLAN }]);
  const blocked = architectureFitnessAuthorityVerdict(repoRoot, COMMAND, guardDeps({ inspectArchitectureEntryReadinessFn: () => ({ status: "blocked" }) }));
  assert.equal(blocked.exitCode, 2);
  assert.match(blocked.stderr, /GUARD-ARCHITECTURE-FITNESS-NON-GREEN/u);
});

test("the guard feeds the fitness evaluator the same touchedContracts as the library (lib/guard/entry-gates.mjs architectureFitnessAuthorityVerdict re-derives with isContractPath, lib/architecture-entry-readiness.mjs inspectArchitectureEntryReadiness uses its own regex)", () => {
  let guardTouched; let libraryTouched;
  architectureFitnessAuthorityVerdict(repoRoot, COMMAND, guardDeps({ evaluateArchitectureFitnessFn: (input) => { guardTouched = input.touchedContracts; return { overallStatus: "pass", outcomes: tenOutcomes(false) }; } }));
  inspectArchitectureEntryReadiness({ rootDir: repoRoot, planningSurface: SURFACE, deps: {
    inspectArchitectureDesign: () => ({ ok: true, status: "not-required", required: false, scope: null }),
    readCheckpointArchitectureDebt: () => ({ ok: true, debt: [], resolvedDebt: [] }),
    checkPlanningAdoptionDisposition: () => ({ ok: true, disposition: "approved-scoped", scope: [ARCHITECTURE_ENTRY_SCOPE] }),
    evaluateArchitectureFitness: (input) => { libraryTouched = input.touchedContracts; return { overallStatus: "pass", outcomes: tenOutcomes(false), summary: {} }; } } });
  assert.ok(Array.isArray(guardTouched) && Array.isArray(libraryTouched), "both evaluators were reached");
  assert.deepEqual(guardTouched, libraryTouched);
});

// ---- (c) model gap: an established project under a PO deferral must not admit a net-new implementation path unratcheted ----
test("a deferred established project is NOT admitted, not ready, for a net-new target path (fix site: lib/architecture-entry-readiness.mjs inspectArchitectureEntryReadiness, `disposition.disposition === \"deferred\"` branch)", () => {
  const result = inspectArchitectureEntryReadiness({ rootDir: repoRoot, planningSurface: { planPath: PLAN, paths: ["src/brand-new.mjs"] }, deps: {
    inspectArchitectureDesign: () => ({ ok: true, status: "not-required", required: false, scope: null }),
    readCheckpointArchitectureDebt: () => ({ ok: true, debt: [], resolvedDebt: [] }),
    checkPlanningAdoptionDisposition: () => ({ ok: true, disposition: "deferred", scope: [ARCHITECTURE_ENTRY_SCOPE], expiresAt: "2099-01-01" }),
    evaluateArchitectureFitness: () => ({ overallStatus: "blocked", outcomes: tenOutcomes(true), summary: {} }) } });
  assert.notEqual(result.status, "ready", "net-new path with a blocking finding is admitted under deferral");
});
