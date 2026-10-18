// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.claude-windows-greenfield-lifecycle-not-walkable (AC-127), slice
// ALF-H1-PF20-PENDING-FITNESS-ALLOWANCE.
//
// A real greenfield project cannot enter implementation: after approve-plan and a successful
// materialize-architecture, inspectArchitectureEntryReadiness answers "ready" with a deferred fitness over
// pendingPhysicalSurfaces, but the guard's planning-mode evaluator reports every declared-but-unwritten
// verification entry point as a finding, and test files may not be written before implementation.
// greenfieldPendingFitnessAllowance (lib/architecture-entry-readiness.mjs) is the decision the guard will call.
//
// The tree below is built through the REAL modules: the design block is parsed and its targets rendered by
// lib/architecture-design.mjs, the receipt is the one inspectArchitectureDesign derives, readiness is the real
// inspectArchitectureEntryReadiness, and the fitness result is the real evaluateArchitectureFitness in planning
// mode with the inputs the guard passes. Only the five PO-approval modules are replaced by test stubs (staged-stub
// pattern of brownfield-implementation-entry-demands-a-greenfield-design-block.test.mjs): a throwaway fixture cannot
// hold real signatures, and nothing the predicate decides depends on them.
//
// The new function is reached through the module namespace so a missing export is a failing assertion with the
// real evaluator output attached, not a link error that hides it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import * as readinessModule from "../architecture-entry-readiness.mjs";
import { initialGreenfieldAgentEntryTarget, initialGreenfieldMapTargets } from "../architecture-map-scaffold.mjs";
import { evaluateArchitectureFitness } from "../../scripts/architecture-fitness.mjs";

const { architectureTouchedContracts, deriveArchitecturePlanningSurface, inspectArchitectureEntryReadiness } = readinessModule;
const LIB = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const sha = (text) => createHash("sha256").update(text).digest("hex");

const PLAN = "specs/f/prd.md";
const SPEC = "specs/f/spec.md";
const SPEC_TEXT = "# Spec\n";
const ADR = "docs/adr/0001-application-boundary.md";
const CONTRACT = "docs/contract.md";
const IMPLEMENTATION = "src/application.mjs";
const ENTRY_POINT = "tests/application.test.mjs";

const DESIGN = {
  schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield",
  disposition: { decision: "approved-scoped", scope: ["src/", "tests/", "docs/", "architecture/", "specs/"], rationale: "Explicit design scope" },
  modules: [{ id: "application", responsibility: "Local application", nonResponsibilities: ["Network"],
    ownedPaths: ["src/**", "tests/**", CONTRACT], publicContracts: [CONTRACT], allowedDependencies: [],
    authorityEffects: [], verificationEntryPoints: [ENTRY_POINT], adrReferences: [] }],
  implementationSurface: [IMPLEMENTATION],
  fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "local", revision: 1,
    modules: [{ id: "application", ownedPaths: ["src/**", "tests/**", CONTRACT], allowedDependencies: [], authorityEffects: [], verificationEntryPoints: [ENTRY_POINT] }],
    allowedBoundaryCrossings: [], antiFragmentationPolicy: { rejectTrivialFacades: true } },
  baseline: { schema: "pipeline.architecture-baseline.v1", baselineRevision: 1, acceptedViolations: [],
    ratchetMetrics: { totalAcceptedViolations: 0, cycleCount: 0, boundaryCrossingsCount: 0 } },
};
const PRD = `# Design\n\nDecision record: ${ADR}\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(DESIGN)}\n\`\`\`\n`;

// ---- staged architecture-design.mjs with ONLY the five approval modules stubbed ----
const STUBS = new Map([["./plan-spec-state-v2.mjs", "stub-lifecycle.mjs"], ["./po-gate-authority.mjs", "stub-authority.mjs"],
  ["./design-workflow-package.mjs", "stub-dwp.mjs"], ["./design-workflow-approval.mjs", "stub-dwa.mjs"], ["./critical-human-proof-policy.mjs", "stub-policy.mjs"]]);
const STUB_SOURCES = {
  "stub-lifecycle.mjs": `export function derivePlanLifecycle() { return { ok: true, status: "approved" }; }\n`,
  "stub-authority.mjs": `import { readFileSync } from "node:fs";\nimport { join } from "node:path";\nexport function validatePoGateAuthorityForRepository({ repoRoot }) {\n  const state = JSON.parse(readFileSync(join(repoRoot, "project", "pipeline-state.json"), "utf8"));\n  return { ok: true, value: state.planApproval.poGateAuthority };\n}\n`,
  "stub-dwp.mjs": `export function readDesignWorkflowPackageFromRepository() { return { ok: false, code: "TEST-DWP-UNUSED" }; }\nexport function rereadApprovedDesignWorkflowPackage() { return { ok: false, code: "TEST-DWP-UNUSED" }; }\n`,
  "stub-dwa.mjs": `export function verifyStoredDesignWorkflowPackageSignature() { return { ok: false, code: "TEST-DWA-UNUSED" }; }\n`,
  "stub-policy.mjs": `export function readCriticalHumanProofPolicy() { return { ok: false, code: "TEST-POLICY-UNUSED" }; }\n`,
};
let staged;
function loadStaged() {
  staged ??= (async () => {
    const stage = mkdtempSync(join(tmpdir(), "alf-h1-pf20-"));
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

/**
 * A materialized greenfield tree: scaffold -> real design inspection -> every fixed target and the receipt
 * written exactly as the materializer publishes them. ADR, public contract and the AGENTS.md pointer are
 * present; the declared verification entry point (and, by default, the implementation file) is absent.
 */
async function greenfieldTree(name, { entryPoint = false, implementation = false } = {}) {
  const mod = await loadStaged();
  const root = join(repoRoot, "scratch", `alf-h1-pf20-${name}-${process.pid}`);
  rmSync(root, { recursive: true, force: true });
  roots.push(root);
  const put = (rel, text) => { const p = join(root, ...rel.split("/")); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };
  const project = JSON.stringify({ schema: "pipeline.project.v1", project: "alf-h1-pf20", verify: null, autonomy: "gated", handover: "docs/state.md" });
  const manifest = "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n";
  put("project/pipeline.json", project); put(".claude/pipeline.json", project);
  put("project/pipeline.yaml", manifest); put(".claude/pipeline.yaml", manifest);
  put(PLAN, PRD); put(SPEC, SPEC_TEXT);
  put("project/pipeline-state.json", JSON.stringify({ activeFeature: { id: "feat-1", planPath: PLAN },
    planApproval: { poGateAuthority: { planPath: PLAN, specPath: SPEC } },
    continuity: { featureId: "feat-1", authority: { prd: { path: PLAN, sha256: sha(PRD) }, spec: { path: SPEC, sha256: sha(SPEC_TEXT) } } } }));
  for (const target of initialGreenfieldMapTargets("fresh")) put(target.path, target.bytes);
  const designed = mod.inspectArchitectureDesign(root, PLAN, {});
  assert.equal(designed.status, "materialization-required", JSON.stringify(designed));
  for (const target of designed.targets) put(target.path, target.bytes);
  put("architecture/design-materialization.json", `${JSON.stringify(designed.receipt, null, 2)}\n`);
  const agent = initialGreenfieldAgentEntryTarget("fresh");
  put(agent.path, agent.bytes);
  put(ADR, "# 0001: The application module owns the local boundary\n\nStatus: accepted\n");
  put(CONTRACT, "# Contract\n\nThe application exposes one local entry.\n");
  if (entryPoint) put(ENTRY_POINT, "import test from \"node:test\";\ntest(\"application\", () => {});\n");
  if (implementation) put(IMPLEMENTATION, "export const ready = true;\n");
  return { root, mod };
}

/** Real readiness, with only the approval-bound design inspection routed through the staged module. */
function readinessOf(tree) {
  return inspectArchitectureEntryReadiness({ rootDir: tree.root, taskScope: PLAN,
    deps: { inspectArchitectureDesign: (root, scope) => tree.mod.inspectArchitectureDesign(root, scope, {}) } });
}

/** The evaluator inputs architectureFitnessAuthorityVerdict builds (lib/guard/entry-gates.mjs ~158-164). */
function guardPlanningInputs(root) {
  const surface = deriveArchitecturePlanningSurface(root);
  assert.ok(surface !== null && surface.paths.length > 0, "the active plan declares an implementation surface");
  return { rootDir: root, mode: "planning", candidatePaths: surface.paths, files: surface.paths,
    touchedContracts: architectureTouchedContracts(surface.paths) };
}

const nonPass = (fitness) => fitness.outcomes.filter((outcome) => outcome.outcome !== "pass").map((outcome) => ({
  classId: outcome.classId, propertyId: outcome.propertyId, outcome: outcome.outcome,
  targets: (outcome.violations ?? []).map((violation) => violation.target),
}));
const allow = (readiness, fitness) => readinessModule.greenfieldPendingFitnessAllowance({ readiness, fitness });
const detail = (readiness, fitness) => JSON.stringify({ readiness: { status: readiness.status, code: readiness.code, fitness: readiness.fitness },
  evaluator: nonPass(fitness) });

test("the real planning evaluator on the materialized tree reports only the unwritten entry point and the two report-only unavailable classes", async () => {
  const tree = await greenfieldTree("primary");
  const readiness = readinessOf(tree);
  assert.equal(readiness.status, "ready", JSON.stringify(readiness));
  assert.equal(readiness.fitness.source, "approved-design-package");
  assert.equal(readiness.fitness.overallStatus, "deferred");
  assert.deepEqual(readiness.fitness.pendingPhysicalSurfaces, [IMPLEMENTATION, ENTRY_POINT]);
  const fitness = evaluateArchitectureFitness(guardPlanningInputs(tree.root));
  assert.deepEqual(nonPass(fitness), [
    { classId: 6, propertyId: "verification-locality", outcome: "finding", targets: [ENTRY_POINT] },
    { classId: 9, propertyId: "profile-drift", outcome: "unavailable", targets: [] },
    { classId: 10, propertyId: "calibrated-friction-thresholds", outcome: "unavailable", targets: [] },
  ], "this is the evidence the protected guard change needs");
});

test("the predicate allows a greenfield tree whose only missing surfaces are its planned verification entry point and implementation", async () => {
  const tree = await greenfieldTree("allow");
  const readiness = readinessOf(tree);
  const fitness = evaluateArchitectureFitness(guardPlanningInputs(tree.root));
  assert.equal(typeof readinessModule.greenfieldPendingFitnessAllowance, "function", detail(readiness, fitness));
  assert.deepEqual(allow(readiness, fitness), {
    allowed: true, code: "PENDING-FITNESS-ALLOWED", pendingPhysicalSurfaces: [IMPLEMENTATION, ENTRY_POINT],
  }, detail(readiness, fitness));
});

test("the predicate alone allows a tree whose evaluator yields only report-only unavailable classes (the guard's standing unavailable policy is a separate gate)", async () => {
  const tree = await greenfieldTree("impl-pending", { entryPoint: true });
  const readiness = readinessOf(tree);
  const fitness = evaluateArchitectureFitness(guardPlanningInputs(tree.root));
  assert.deepEqual(readiness.fitness.pendingPhysicalSurfaces, [IMPLEMENTATION]);
  assert.deepEqual(nonPass(fitness).map((row) => row.classId), [9, 10], "no pending-class finding remains");
  assert.deepEqual(allow(readiness, fitness), {
    allowed: true, code: "PENDING-FITNESS-ALLOWED", pendingPhysicalSurfaces: [IMPLEMENTATION],
  }, detail(readiness, fitness));
});

test("an unrelated fitness finding on the same tree is denied: a stray unowned candidate path", async () => {
  const tree = await greenfieldTree("stray");
  const readiness = readinessOf(tree);
  const inputs = guardPlanningInputs(tree.root);
  const fitness = evaluateArchitectureFitness({ ...inputs, candidatePaths: [...inputs.candidatePaths, "lib/stray.mjs"] });
  assert.ok(nonPass(fitness).some((row) => row.classId === 1 && row.targets.includes("lib/stray.mjs")), detail(readiness, fitness));
  assert.deepEqual(allow(readiness, fitness), { allowed: false, code: "PENDING-FITNESS-OTHER-CLASS" }, detail(readiness, fitness));
});

test("an unrelated fitness finding on the same tree is denied: map staleness forced through the evaluator's mapStale input", async () => {
  const tree = await greenfieldTree("stale-map");
  const readiness = readinessOf(tree);
  const fitness = evaluateArchitectureFitness({ ...guardPlanningInputs(tree.root), mapStale: true });
  const navigation = fitness.outcomes.find((outcome) => outcome.classId === 7);
  assert.equal(navigation.outcome, "finding", detail(readiness, fitness));
  assert.deepEqual(navigation.violations.map((violation) => violation.target), ["architecture/map"],
    "the evaluator violation names no stale contract, only the constant map target");
  assert.deepEqual(allow(readiness, fitness), { allowed: false, code: "PENDING-FITNESS-NAVIGATION-UNPROVEN" }, detail(readiness, fitness));
});

test("an entry-point finding is denied when the readiness pending set does not contain it (empty or narrower)", async () => {
  const tree = await greenfieldTree("pending-narrower");
  const readiness = readinessOf(tree);
  const fitness = evaluateArchitectureFitness(guardPlanningInputs(tree.root));
  const withPending = (pendingPhysicalSurfaces) => ({ ...readiness, fitness: { ...readiness.fitness, pendingPhysicalSurfaces } });
  assert.deepEqual(allow(withPending([]), fitness), { allowed: false, code: "PENDING-FITNESS-NO-PENDING-SURFACES" });
  assert.deepEqual(allow(withPending([IMPLEMENTATION]), fitness), { allowed: false, code: "PENDING-FITNESS-TARGET-NOT-PENDING" },
    "the missing entry point is not pending, so the verification-locality finding is not covered");
});

test("a complete tree is not a deferral: nothing is pending, so the predicate has nothing to allow", async () => {
  const tree = await greenfieldTree("complete", { entryPoint: true, implementation: true });
  const readiness = readinessOf(tree);
  const fitness = evaluateArchitectureFitness(guardPlanningInputs(tree.root));
  assert.notEqual(readiness.fitness?.source, "approved-design-package", JSON.stringify(readiness.fitness));
  assert.equal(allow(readiness, fitness).allowed, false, detail(readiness, fitness));
});
