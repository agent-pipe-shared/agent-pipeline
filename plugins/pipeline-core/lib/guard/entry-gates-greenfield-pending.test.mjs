// SPDX-License-Identifier: SUL-1.0
// Guard-level contract for slice ALF-H1-PF20 (AC-127, pipeline.claude-windows-greenfield-lifecycle-not-walkable).
//
// The pure decision greenfieldPendingFitnessAllowance is pinned in
// lib/pins/greenfield-implementation-entry-with-pending-verification-surfaces.test.mjs. This suite pins the WIRING:
// architectureFitnessAuthorityVerdict (lib/guard/entry-gates.mjs), the gate every real
// `pipeline-state.mjs set-phase --phase implementation` passes, must consult that decision, so a greenfield tree whose
// only missing surfaces are its own planned ones can enter implementation while an unrelated finding still cannot.
//
// The tree is built through the REAL modules (design block parsed and rendered by lib/architecture-design.mjs, the receipt
// it derives, the real readiness and the real planning-mode evaluator with the inputs the guard builds). Only the five
// PO-approval modules are replaced by test stubs, exactly as the pin does, and the PO-recorded adoption disposition
// (`approved-scoped`, the disposition of a design-package tree) is injected: a throwaway fixture cannot hold signed
// approval state, and nothing the wiring decides depends on how that disposition was signed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { inspectArchitectureEntryReadiness } from "../architecture-entry-readiness.mjs";
import { initialGreenfieldAgentEntryTarget, initialGreenfieldMapTargets } from "../architecture-map-scaffold.mjs";
import { evaluateArchitectureFitness } from "../../scripts/architecture-fitness.mjs";
import { ARCHITECTURE_FITNESS_DENIAL_CODE, PIPELINE_STATE_SCRIPT } from "./constants.mjs";
import { architectureFitnessAuthorityVerdict } from "./entry-gates.mjs";

const LIB = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const sha = (text) => createHash("sha256").update(text).digest("hex");
const COMMAND = `node '${PIPELINE_STATE_SCRIPT}' set-phase --phase implementation`;

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

// ---- staged architecture-design.mjs with ONLY the five approval modules stubbed (same staging as the pin) ----
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
    const stage = mkdtempSync(join(tmpdir(), "alf-sp-entry-gates-"));
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
 * A materialized greenfield tree: scaffold -> real design inspection -> every fixed target and the receipt written exactly
 * as the materializer publishes them. ADR, public contract and the AGENTS.md pointer are present; the declared
 * verification entry point and the implementation file are absent (the planned surfaces).
 */
async function greenfieldTree(name) {
  const mod = await loadStaged();
  const root = join(repoRoot, "scratch", `alf-sp-entry-gates-${name}-${process.pid}`);
  rmSync(root, { recursive: true, force: true });
  roots.push(root);
  const put = (rel, text) => { const p = join(root, ...rel.split("/")); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };
  const project = JSON.stringify({ schema: "pipeline.project.v1", project: "alf-sp-entry-gates", verify: null, autonomy: "gated", handover: "docs/state.md" });
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
  return { root, mod };
}

/** The dependencies the guard accepts: real evaluator and real readiness (design inspection routed through the stubs). */
function guardDependencies(tree, over = {}) {
  return {
    checkPlanningAdoptionDispositionFn: () => ({ ok: true, disposition: "approved-scoped" }),
    inspectArchitectureEntryReadinessFn: (input) => inspectArchitectureEntryReadiness({ ...input,
      deps: { inspectArchitectureDesign: (root, scope) => tree.mod.inspectArchitectureDesign(root, scope, {}) } }),
    ...over,
  };
}

/** Wraps an evaluator so the test can see exactly what the guard asked and what the evaluator answered. */
function recording(evaluate, seen) {
  return (input) => { const result = evaluate(input); seen.push({ input, result }); return result; };
}

const denied = (verdict, label) => {
  assert.ok(verdict !== null && typeof verdict === "object", `${label}: the verdict is a denial, not null (null means allowed or not a transition)`);
  assert.equal(verdict.exitCode, 2, label);
  assert.match(verdict.stderr, new RegExp(ARCHITECTURE_FITNESS_DENIAL_CODE, "u"), label);
  assert.match(verdict.stderr, /GUARD-ARCHITECTURE-FITNESS-NON-GREEN/u, label);
};

test("set-phase implementation is allowed on a materialized greenfield tree whose only missing surfaces are its planned ones", async () => {
  const tree = await greenfieldTree("allow");
  const seen = [];
  const verdict = architectureFitnessAuthorityVerdict(tree.root, COMMAND,
    guardDependencies(tree, { evaluateArchitectureFitnessFn: recording(evaluateArchitectureFitness, seen) }));
  assert.equal(seen.length, 1, "the guard evaluated planning-mode fitness once");
  const { input, result } = seen[0];
  assert.ok(input.candidatePaths.includes(ENTRY_POINT), `the guard's own planning surface names the planned entry point: ${JSON.stringify(input.candidatePaths)}`);
  assert.ok(!["pass", "excepted", "unavailable", "unknown"].includes(result.overallStatus),
    `the evaluator is not green, so a null verdict can only come from the pending-surface allowance: ${result.overallStatus}`);
  const entryPointFinding = result.outcomes.find((outcome) => outcome.classId === 6 && outcome.outcome === "finding");
  assert.deepEqual((entryPointFinding?.violations ?? []).map((violation) => violation.target), [ENTRY_POINT], JSON.stringify(result.outcomes));
  assert.equal(verdict, null, verdict === null ? "" : verdict.stderr);
});

test("set-phase implementation is still denied for a greenfield tree with an unrelated finding: a stray unowned candidate path", async () => {
  const tree = await greenfieldTree("stray");
  const seen = [];
  const withStray = (input) => evaluateArchitectureFitness({ ...input, candidatePaths: [...input.candidatePaths, "lib/stray.mjs"] });
  const verdict = architectureFitnessAuthorityVerdict(tree.root, COMMAND,
    guardDependencies(tree, { evaluateArchitectureFitnessFn: recording(withStray, seen) }));
  assert.equal(seen.length, 1);
  assert.ok(seen[0].result.outcomes.some((outcome) => outcome.classId === 1 && (outcome.violations ?? []).some((violation) => violation.target === "lib/stray.mjs")),
    "the stray path is a real finding of the evaluator");
  denied(verdict, "stray path");
});

test("set-phase implementation is still denied for a greenfield tree whose architecture map is stale", async () => {
  const tree = await greenfieldTree("stale-map");
  const seen = [];
  const withStaleMap = (input) => evaluateArchitectureFitness({ ...input, mapStale: true });
  const verdict = architectureFitnessAuthorityVerdict(tree.root, COMMAND,
    guardDependencies(tree, { evaluateArchitectureFitnessFn: recording(withStaleMap, seen) }));
  assert.equal(seen.length, 1);
  assert.ok(seen[0].result.outcomes.some((outcome) => outcome.classId === 7 && outcome.outcome === "finding"), "navigation currency is a real finding of the evaluator");
  denied(verdict, "stale map");
});
