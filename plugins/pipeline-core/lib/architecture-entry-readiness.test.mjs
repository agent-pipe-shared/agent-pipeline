// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fixtureAdoption } from "../scripts/architecture-adoption-test-fixture.mjs";

import {
  ARCHITECTURE_ENTRY_SCOPE,
  greenfieldPendingFitnessAllowance,
  inspectArchitectureEntryReadiness,
  inspectPlanningDecisionApplicability,
  summarizePlanningDecisionApplicability,
} from "./architecture-entry-readiness.mjs";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
// Unrelated entry cases observe a controlled checkpoint history; debt cases supply their own reader.
const clearCheckpointDebt = () => ({ ok: true, debt: [], resolvedDebt: [] });
const readyDisposition = () => ({ ok: true, disposition: "approved-scoped", scope: [ARCHITECTURE_ENTRY_SCOPE], expiresAt: "2099-01-01" });

function fixture() {
  return mkdtempSync(join(tmpdir(), "architecture-entry-readiness-"));
}

test("missing physical map blocks before any readiness claim and offers only the read-only proposal", () => {
  const root = fixture();
  try {
    const result = inspectArchitectureEntryReadiness({ rootDir: root, deps: { checkPlanningAdoptionDisposition: readyDisposition } });
    assert.equal(result.status, "blocked");
    assert.equal(result.code, "ARCHITECTURE-MAP-MISSING");
    assert.equal(result.nextAction.kind, "collect-input");
    assert.equal(result.nextAction.input.name, "architecture-adoption-disposition");
    assert.equal(result.nextAction.proposalSchema, "pipeline.adoption-proposal.v1");
    assert.equal(existsSync(join(root, "architecture/map/index.md")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("malformed physical map blocks even with an authorized adoption disposition", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "architecture/map"), { recursive: true });
    writeFileSync(join(root, "architecture/map/index.md"), "# malformed\n", "utf8");
    writeFileSync(join(root, "architecture/map/pipeline-core.md"), "not frontmatter\n", "utf8");
    const result = inspectArchitectureEntryReadiness({ rootDir: root, deps: { checkPlanningAdoptionDisposition: readyDisposition } });
    assert.equal(result.status, "blocked");
    assert.equal(result.code, "ARCHITECTURE-MAP-INVALID");
    assert.match(result.message, /malformed|invalid/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("approved design materialization action wins before an invalid scaffold-map diagnostic", () => {
  const root = fixture();
  let inspections = 0;
  let adoptionReads = 0;
  try {
    const result = inspectArchitectureEntryReadiness({ rootDir: root, deps: {
      inspectArchitectureDesign: () => {
        inspections += 1;
        return { ok: true, status: "materialization-required", disposition: "approved-scoped", scope: ["architecture/"] };
      },
      checkPlanningAdoptionDisposition: () => { adoptionReads += 1; return { ok: false }; },
    } });
    assert.equal(result.status, "blocked");
    assert.equal(result.code, "ARCHITECTURE-MATERIALIZATION-REQUIRED");
    assert.deepEqual(result.nextAction, {
      kind: "command", executable: "node",
      argv: [fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url)), "materialize-architecture"],
      mutation: true, requiresConfirmation: false,
      expected: { schema: "pipeline.architecture-design-materialization.v1", statuses: ["materialized"] },
    });
    assert.equal(inspections, 1, "the approved design inspection is reused for the action");
    assert.equal(adoptionReads, 0, "unmaterialized design does not fall through to a secondary adoption read");
    assert.equal(result.artifacts.map.status, "missing", "the scaffold map is not treated as materialized");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("missing design block preserves its exact PRD action before scaffold-map validation", () => {
  const root = fixture();
  const prdPath = "specs/feature/prd.md";
  try {
    const result = inspectArchitectureEntryReadiness({ rootDir: root, deps: {
      inspectArchitectureDesign: () => ({ ok: false, status: "design-required",
        code: "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED", prdPath }),
    } });
    assert.equal(result.status, "blocked");
    assert.equal(result.code, "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED");
    assert.equal(result.nextAction.kind, "architecture-design-required");
    assert.equal(result.nextAction.prdPath, prdPath);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a materialized map without a project-owned AGENTS pointer has an actionable typed refusal", () => {
  const root = fixture();
  try {
    cpSync(join(repoRoot, "architecture"), join(root, "architecture"), { recursive: true });
    const options = { rootDir: root, deps: { checkPlanningAdoptionDisposition: readyDisposition } };
    const missing = inspectArchitectureEntryReadiness(options);
    assert.equal(missing.status, "blocked");
    assert.equal(missing.code, "ARCHITECTURE-ENTRY-MISSING");
    assert.equal(missing.nextAction.kind, "repair-required");
    assert.equal(missing.nextAction.path, "AGENTS.md");
    writeFileSync(join(root, "AGENTS.md"), "# Existing project instructions\n");
    const stale = inspectArchitectureEntryReadiness(options);
    assert.equal(stale.code, "ARCHITECTURE-ENTRY-MAP-POINTER-MISSING");
    assert.equal(stale.nextAction.kind, "repair-required");
    assert.equal(existsSync(join(root, "AGENTS.md")), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a PO-deferred adoption reports complete fitness observations without enforcing them", () => {
  // Injected surface of established (existing) paths: the real plan surface may name not-yet-created paths, which are net-new and enforced.
  const result = inspectArchitectureEntryReadiness({
    rootDir: repoRoot,
    planningSurface: { planPath: "specs/architecture-entry.md", paths: ["plugins/pipeline-core/lib/architecture-entry-readiness.mjs"] },
    deps: { readCheckpointArchitectureDebt: clearCheckpointDebt, checkPlanningAdoptionDisposition: () => ({ ok: true, disposition: "deferred", scope: [ARCHITECTURE_ENTRY_SCOPE], expiresAt: "2099-01-01" }) },
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  assert.equal(result.fitness.blockingOverallStatus, "deferred");
  assert.equal(result.fitness.reportOnly.length, 10);
  assert.equal(result.artifacts.map.status, "current");
  assert.equal(result.artifacts.fitnessModel.status, "current");
  assert.equal(result.artifacts.baseline.status, "current");
  assert.equal(result.disposition.disposition, "deferred");
});

test("a PO-deferred adoption still enforces fitness for a net-new path and names it", () => {
  const netNew = "plugins/pipeline-core/lib/not-yet-created-net-new-module.mjs";
  const result = inspectArchitectureEntryReadiness({
    rootDir: repoRoot,
    planningSurface: { planPath: "specs/architecture-entry.md", paths: ["plugins/pipeline-core/lib/architecture-entry-readiness.mjs", netNew] },
    deps: {
      readCheckpointArchitectureDebt: clearCheckpointDebt,
      checkPlanningAdoptionDisposition: () => ({ ok: true, disposition: "deferred", scope: [ARCHITECTURE_ENTRY_SCOPE], expiresAt: "2099-01-01" }),
      evaluateArchitectureFitness: () => ({
        overallStatus: "finding",
        summary: { passCount: 9, findingCount: 1, exceptedCount: 0, unavailableCount: 0, unsupportedCount: 0, unknownCount: 0, totalClasses: 10 },
        outcomes: [
          { classId: 1, outcome: "finding" },
          ...Array.from({ length: 9 }, (_, index) => ({ classId: index + 2, outcome: "pass" })),
        ],
      }),
    },
  });
  assert.notEqual(result.fitness?.blockingOverallStatus, "deferred", JSON.stringify(result));
  assert.equal(result.status, "blocked", JSON.stringify(result));
  assert.equal(result.code, "ARCHITECTURE-FITNESS-NOT-READY");
  assert.deepEqual(result.fitness.netNewPaths, [netNew]);
});

test("checkpoint map debt blocks the next planning boundary even during adoption deferral", () => {
  const debt = { type: "architecture-map-stale", target: "architecture/map/pipeline-core.md",
    contract: "plugins/pipeline-core/scripts/architecture-fitness.mjs" };
  const result = inspectArchitectureEntryReadiness({
    rootDir: repoRoot,
    deps: {
      checkPlanningAdoptionDisposition: () => ({ ok: true, disposition: "deferred", scope: [ARCHITECTURE_ENTRY_SCOPE] }),
      readCheckpointArchitectureDebt: () => ({ ok: true, debt: [{ stalenessDebt: [debt] }], resolvedDebt: [] }),
    },
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.code, "ARCHITECTURE-CHECKPOINT-DEBT-OPEN");
  assert.equal(result.nextAction.kind, "repair-required");
  assert.equal(result.nextAction.path, "architecture/map/");
  assert.equal(result.artifacts.checkpointDebt.openCount, 1);
  assert.deepEqual(result.artifacts.checkpointDebt.targets, [debt.target]);
});

test("a descendant map repair consumes checkpoint debt only after class-7 passes", () => {
  const debt = { type: "architecture-map-stale", target: "architecture/map/pipeline-core.md",
    contract: "plugins/pipeline-core/scripts/architecture-fitness.mjs" };
  const reader = () => ({ ok: true, debt: [], resolvedDebt: [{ stalenessDebt: [debt] }] });
  const common = { rootDir: repoRoot, planningSurface: { planPath: "specs/architecture-entry.md",
    paths: ["plugins/pipeline-core/lib/architecture-entry-readiness.mjs"] }, deps: {
    checkPlanningAdoptionDisposition: () => ({ ok: true, disposition: "deferred", scope: [ARCHITECTURE_ENTRY_SCOPE] }),
    readCheckpointArchitectureDebt: reader,
  } };
  const repaired = inspectArchitectureEntryReadiness(common);
  assert.equal(repaired.status, "ready", repaired.code);
  assert.deepEqual(repaired.artifacts.checkpointDebt, { status: "clear", openCount: 0, targets: [] });
  const stillStale = inspectArchitectureEntryReadiness({ ...common, deps: {
    ...common.deps,
    evaluateNavigationCurrency: () => ({ outcome: "finding" }),
  } });
  assert.equal(stillStale.code, "ARCHITECTURE-CHECKPOINT-DEBT-OPEN");
});

test("unreadable checkpoint debt fails closed with a typed repair route", () => {
  const result = inspectArchitectureEntryReadiness({ rootDir: repoRoot, deps: {
    checkPlanningAdoptionDisposition: readyDisposition,
    readCheckpointArchitectureDebt: () => ({ ok: false, debt: [], reason: "fixture unavailable" }),
  } });
  assert.equal(result.code, "ARCHITECTURE-CHECKPOINT-DEBT-UNAVAILABLE");
  assert.equal(result.nextAction.code, "ARCHITECTURE-CHECKPOINT-DEBT-REPAIR");
});
test("approved greenfield design defers missing physical surfaces without fabricating fitness pass", () => {
  const design = { ok: true, status: "materialized", disposition: "approved-scoped",
    scope: ["plugins/", "architecture/"], authority: "approved-design-package",
    pendingPhysicalSurfaces: ["tests/application.test.mjs"],
    planningSurface: { planPath: "specs/feature/prd.md", paths: ["plugins/pipeline-core/lib/architecture-design.mjs"] } };
  let evaluations = 0;
  const options = { rootDir: repoRoot, deps: { readCheckpointArchitectureDebt: clearCheckpointDebt,
    inspectArchitectureDesign: () => design,
    evaluateArchitectureFitness: () => { evaluations += 1; throw new Error("not yet executable"); },
  } };
  const deferred = inspectArchitectureEntryReadiness(options);
  assert.equal(deferred.status, "ready", JSON.stringify(deferred));
  assert.equal(deferred.fitness.overallStatus, "deferred");
  assert.equal(deferred.fitness.blockingOverallStatus, "deferred");
  assert.deepEqual(deferred.fitness.pendingPhysicalSurfaces, ["tests/application.test.mjs"]);
  assert.equal(evaluations, 0);
  design.pendingPhysicalSurfaces = [];
  const evaluated = inspectArchitectureEntryReadiness(options);
  assert.equal(evaluated.status, "blocked");
  assert.equal(evaluated.code, "ARCHITECTURE-FITNESS-UNAVAILABLE");
  assert.equal(evaluations, 1);
});

test("calibration-unavailable class 10 is preserved as report-only while other classes decide entry", () => {
  const result = inspectArchitectureEntryReadiness({
    rootDir: repoRoot,
    planningSurface: { planPath: "specs/architecture-entry.md", paths: ["plugins/pipeline-core/lib/architecture-entry-readiness.mjs"] },
    deps: { readCheckpointArchitectureDebt: clearCheckpointDebt,
      checkPlanningAdoptionDisposition: readyDisposition,
      evaluateArchitectureFitness: () => ({
        overallStatus: "unavailable",
        summary: { passCount: 9, findingCount: 0, exceptedCount: 0, unavailableCount: 1, unsupportedCount: 0, unknownCount: 0, totalClasses: 10 },
        outcomes: [
          ...Array.from({ length: 9 }, (_, index) => ({ classId: index + 1, outcome: "pass" })),
          { classId: 10, outcome: "unavailable", evidence: { status: "unavailable", required: ["measured-calibration", "explicit-threshold-promotion"] } },
        ],
      }),
    },
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  assert.equal(result.fitness.overallStatus, "unavailable");
  assert.equal(result.fitness.blockingOverallStatus, "pass");
  assert.equal(result.fitness.reportOnly.length, 1);
});

test("malformed or incomplete fitness outcomes fail closed", () => {
  const result = inspectArchitectureEntryReadiness({
    rootDir: repoRoot,
    planningSurface: { planPath: "specs/architecture-entry.md", paths: ["plugins/pipeline-core/lib/architecture-entry-readiness.mjs"] },
    deps: { readCheckpointArchitectureDebt: clearCheckpointDebt,
      checkPlanningAdoptionDisposition: readyDisposition,
      evaluateArchitectureFitness: () => ({ overallStatus: "excepted", outcomes: [{ classId: 1, outcome: "excepted" }] }),
    },
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.code, "ARCHITECTURE-FITNESS-UNAVAILABLE");
});

test("real signed approved-scoped adoption reaches the physical readiness gate", () => {
  const root = fixture();
  try {
    cpSync(join(repoRoot, "architecture"), join(root, "architecture"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(root, "AGENTS.md"));
    cpSync(join(repoRoot, "backlog"), join(root, "backlog"), { recursive: true });
    cpSync(join(repoRoot, "docs/adr"), join(root, "docs/adr"), { recursive: true });
    for (const relative of ["docs/operating-model.md", "policies/model-policy.md",
      "roles/elephant.md", "roles/goldfish.md", "guardrails/token-budget.md"]) {
      mkdirSync(dirname(join(root, relative)), { recursive: true });
      cpSync(join(repoRoot, relative), join(root, relative));
    }
    cpSync(join(repoRoot, "harness"), join(root, "harness"), { recursive: true });
    cpSync(join(repoRoot, "plugins/pipeline-core"), join(root, "plugins/pipeline-core"), { recursive: true });
    cpSync(join(repoRoot, "schemas"), join(root, "schemas"), { recursive: true });
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "plugins/pipeline-core/architecture-entry-plan.md"), "Implement plugins/pipeline-core/lib/architecture-entry-readiness.mjs\n", "utf8");
    writeFileSync(join(root, "project/pipeline.json"), JSON.stringify({ schema: "pipeline.project.v1", verify: "node --test" }) + "\n", "utf8");
    writeFileSync(join(root, "project/pipeline-state.json"), JSON.stringify({ activeFeature: { planPath: "plugins/pipeline-core/architecture-entry-plan.md" } }) + "\n", "utf8");
    fixtureAdoption({ rootDir: root, decision: "approved-scoped", scope: ["plugins/pipeline-core/", "architecture/map/", "project/pipeline.json", "pipeline.user.yaml"], rationale: "fixture architecture entry" });
    const result = inspectArchitectureEntryReadiness({ rootDir: root });
    assert.equal(result.status, "ready", JSON.stringify(result));
    assert.equal(result.disposition.ok, true, JSON.stringify(result));
    assert.equal(result.artifacts.map.status, "current");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("symlinked physical fitness artifacts fail closed", () => {
  const root = fixture();
  try {
    cpSync(join(repoRoot, "architecture"), join(root, "architecture"), { recursive: true });
    rmSync(join(root, "architecture/baseline.json"));
    symlinkSync(join(repoRoot, "architecture/baseline.json"), join(root, "architecture/baseline.json"));
    const result = inspectArchitectureEntryReadiness({ rootDir: root, deps: { checkPlanningAdoptionDisposition: readyDisposition } });
    assert.equal(result.code, "ARCHITECTURE-BASELINE-INVALID");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unresolved adoption authority remains blocked even when the physical bundle is current", () => {
  const result = inspectArchitectureEntryReadiness({
    rootDir: repoRoot,
    deps: {
      checkPlanningAdoptionDisposition: () => ({ ok: false, disposition: "adoption-required", error: "unsigned or missing authority" }),
    },
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.code, "ARCHITECTURE-ADOPTION-DISPOSITION-REQUIRED");
  assert.equal(result.nextAction.kind, "collect-input");
});

test("planning decisions are projected only for owned task modules", () => {
  const calls = [];
  const result = inspectPlanningDecisionApplicability(repoRoot,
    { paths: ["plugins/pipeline-core/lib/architecture-entry-readiness.mjs",
      "harness/scripts/verify.mjs", "docs/unowned-note.md"] },
    new Date("2026-09-26T00:00:00.000Z"), {
      inspectDecisions: (input) => {
        calls.push(input);
        return { area: input.area, status: "advisory", decisions: [],
          findings: [{ code: "legacy-decision-without-sidecar" }] };
      },
    });
  assert.deepEqual(calls.map((item) => item.area), ["harness", "pipeline-core"]);
  assert.deepEqual(result.unresolvedPaths, ["docs/unowned-note.md"]);
  assert.equal(result.status, "advisory");
  assert.deepEqual(summarizePlanningDecisionApplicability(result), {
    schema: "pipeline.architecture-planning-decisions.v1",
    status: "advisory",
    areas: [
      { area: "harness", status: "advisory", decisions: [], findingCount: 1 },
      { area: "pipeline-core", status: "advisory", decisions: [], findingCount: 1 },
    ],
    unresolvedPaths: ["docs/unowned-note.md"],
  });
});

test("a deferred architecture decision remains visible without changing lifecycle readiness", () => {
  const result = inspectArchitectureEntryReadiness({
    rootDir: repoRoot,
    planningSurface: { planPath: "specs/architecture-entry.md",
      paths: ["plugins/pipeline-core/lib/architecture-entry-readiness.mjs"] },
    deps: { readCheckpointArchitectureDebt: clearCheckpointDebt,
      checkPlanningAdoptionDisposition: () => ({ ok: true, disposition: "deferred",
        scope: [ARCHITECTURE_ENTRY_SCOPE], expiresAt: "2099-01-01" }),
      inspectDecisions: ({ area }) => ({ area, status: "blocked",
        code: "ARCH-DECISION-EFFECTIVE-UNRESOLVED", decisions: [], findings: [] }),
    },
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  assert.equal(result.artifacts.decisionApplicability.status, "blocked");
  assert.equal(result.artifacts.decisionApplicability.areas[0].area, "pipeline-core");
});

test("an unavailable optional decision clock remains diagnostic", () => {
  const result = inspectPlanningDecisionApplicability(repoRoot,
    { paths: ["plugins/pipeline-core/lib/architecture-entry-readiness.mjs"] },
    new Date(Number.NaN));
  assert.equal(result.status, "unavailable");
  assert.equal(result.code, "ARCH-DECISION-CLOCK-UNAVAILABLE");
});

// ---- greenfieldPendingFitnessAllowance: pure decision, pure inputs (ALF-H1-PF20-PENDING-FITNESS-ALLOWANCE) ----
const PF_IMPLEMENTATION = "src/app.mjs";
const PF_ENTRY = "tests/app.test.mjs";
const PF_CONTRACT = "docs/contract.md";
const PF_CLASSES = [[1, "module-identity-ownership"], [2, "contract-presence-freshness"], [3, "dependency-direction-cycles"],
  [4, "boundary-crossing"], [5, "authority-effect-ownership"], [6, "verification-locality"], [7, "navigation-currency"],
  [8, "parallel-overlap"], [9, "profile-drift"], [10, "calibrated-friction-thresholds"]];
const pfViolation = (ruleId, target) => ({ ruleId, module: "application", target, details: "fixture" });
const pfFinding = (classId, ...violations) => ({ classId, propertyId: PF_CLASSES[classId - 1][1], outcome: "finding", violations });
// The two unavailable shapes the real planning evaluator produces for a design-package greenfield tree.
const pfProfileUnavailable = { classId: 9, propertyId: "profile-drift", outcome: "unavailable", violations: [],
  details: "Valid approved-scoped authority is unavailable", evidence: { status: "unavailable" } };
const pfCalibrationUnavailable = { classId: 10, propertyId: "calibrated-friction-thresholds", outcome: "unavailable", violations: [],
  evidence: { status: "unavailable", required: ["measured-calibration", "explicit-threshold-promotion"] } };
function pfFitness(...overrides) {
  const rows = PF_CLASSES.map(([classId, propertyId]) => ({ classId, propertyId, outcome: "pass", violations: [] }));
  for (const row of [pfProfileUnavailable, pfCalibrationUnavailable, ...overrides]) rows[row.classId - 1] = row;
  return { overallStatus: overrides.some((row) => row.outcome === "finding") ? "blocked" : "unavailable", outcomes: rows };
}
function pfReadiness(fitnessOverride = {}, topOverride = {}) {
  return { status: "ready", code: null, fitness: { overallStatus: "deferred", blockingOverallStatus: "deferred",
    source: "approved-design-package", planningSurface: { planPath: "specs/f/prd.md", paths: [PF_IMPLEMENTATION] },
    pendingPhysicalSurfaces: [PF_IMPLEMENTATION, PF_ENTRY], ...fitnessOverride }, ...topOverride };
}
const pfDecide = (readiness, fitness) => greenfieldPendingFitnessAllowance({ readiness, fitness });
const pfDeny = (code) => ({ allowed: false, code });

test("pending allowance: a missing planned verification entry point that readiness lists as pending is allowed", () => {
  const result = pfDecide(pfReadiness(), pfFitness(pfFinding(6, pfViolation("missing-verification-entry-point", PF_ENTRY))));
  assert.deepEqual(result, { allowed: true, code: "PENDING-FITNESS-ALLOWED", pendingPhysicalSurfaces: [PF_IMPLEMENTATION, PF_ENTRY] });
});

test("pending allowance: missing, empty and stale-empty declared surfaces across classes 2 and 6 are allowed when all pending", () => {
  const readiness = pfReadiness({ pendingPhysicalSurfaces: [PF_CONTRACT, PF_ENTRY, "tests/b.test.mjs"] });
  const fitness = pfFitness(
    pfFinding(2, pfViolation("missing-contract", PF_CONTRACT)),
    pfFinding(6, pfViolation("missing-verification-entry-point", PF_ENTRY), pfViolation("empty-verification-entry-point", "tests/b.test.mjs")),
  );
  assert.equal(pfDecide(readiness, fitness).allowed, true);
  const stale = pfFitness(pfFinding(2, pfViolation("stale-contract", PF_CONTRACT)));
  assert.equal(pfDecide(readiness, stale).allowed, true);
});

test("pending allowance: no pending-class finding at all is allowed when readiness already approved the deferral", () => {
  const result = pfDecide(pfReadiness(), pfFitness());
  assert.equal(result.allowed, true);
  assert.deepEqual(result.pendingPhysicalSurfaces, [PF_IMPLEMENTATION, PF_ENTRY]);
});

test("pending allowance: the returned pending list is a copy, and no input is mutated", () => {
  const readiness = pfReadiness();
  const fitness = pfFitness(pfFinding(6, pfViolation("missing-verification-entry-point", PF_ENTRY)));
  const before = JSON.stringify({ readiness, fitness });
  const result = pfDecide(readiness, fitness);
  assert.notEqual(result.pendingPhysicalSurfaces, readiness.fitness.pendingPhysicalSurfaces);
  assert.equal(JSON.stringify({ readiness, fitness }), before);
});

test("pending allowance: readiness that is not ready, not a design package, or not deferred is denied with its own code", () => {
  const fitness = pfFitness(pfFinding(6, pfViolation("missing-verification-entry-point", PF_ENTRY)));
  assert.deepEqual(pfDecide(pfReadiness({}, { status: "blocked" }), fitness), pfDeny("PENDING-FITNESS-READINESS-NOT-READY"));
  assert.deepEqual(pfDecide(pfReadiness({ source: undefined }), fitness), pfDeny("PENDING-FITNESS-NOT-DESIGN-PACKAGE"));
  assert.deepEqual(pfDecide(pfReadiness({ source: "adoption-deferral" }), fitness), pfDeny("PENDING-FITNESS-NOT-DESIGN-PACKAGE"));
  for (const overallStatus of ["pass", "blocked", "unavailable", undefined]) {
    assert.deepEqual(pfDecide(pfReadiness({ overallStatus }), fitness), pfDeny("PENDING-FITNESS-NOT-DEFERRED"), String(overallStatus));
  }
});

test("pending allowance: an empty pending set denies even when the evaluator reports a missing entry point", () => {
  const fitness = pfFitness(pfFinding(6, pfViolation("missing-verification-entry-point", PF_ENTRY)));
  assert.deepEqual(pfDecide(pfReadiness({ pendingPhysicalSurfaces: [] }), fitness), pfDeny("PENDING-FITNESS-NO-PENDING-SURFACES"));
});

test("pending allowance: a finding of any other class denies, including classes whose id and property do not agree", () => {
  const entry = pfViolation("missing-verification-entry-point", PF_ENTRY);
  for (const classId of [1, 3, 4, 5, 8, 9, 10]) {
    assert.deepEqual(pfDecide(pfReadiness(), pfFitness(pfFinding(6, entry), pfFinding(classId, pfViolation("x", PF_ENTRY)))),
      pfDeny("PENDING-FITNESS-OTHER-CLASS"), `class ${classId}`);
  }
  const mismatched = { classId: 6, propertyId: "contract-presence-freshness", outcome: "finding", violations: [entry] };
  assert.deepEqual(pfDecide(pfReadiness(), pfFitness(mismatched)), pfDeny("PENDING-FITNESS-OTHER-CLASS"));
});

test("pending allowance: only the two known report-only unavailable shapes are tolerated; any other non-pass outcome denies", () => {
  const readiness = pfReadiness();
  const other = (row) => pfDecide(readiness, pfFitness(row));
  assert.deepEqual(other({ ...pfProfileUnavailable, details: "Governed profile unreadable" }), pfDeny("PENDING-FITNESS-OTHER-CLASS"));
  assert.deepEqual(other({ ...pfCalibrationUnavailable, evidence: { status: "unavailable", required: ["measured-calibration"] } }), pfDeny("PENDING-FITNESS-OTHER-CLASS"));
  assert.deepEqual(other({ classId: 3, propertyId: "dependency-direction-cycles", outcome: "unsupported", violations: [] }), pfDeny("PENDING-FITNESS-OTHER-CLASS"));
  assert.deepEqual(other({ classId: 5, propertyId: "authority-effect-ownership", outcome: "unknown", violations: [] }), pfDeny("PENDING-FITNESS-OTHER-CLASS"));
  assert.deepEqual(other({ classId: 6, propertyId: "verification-locality", outcome: "excepted", violations: [pfViolation("missing-verification-entry-point", PF_ENTRY)] }), pfDeny("PENDING-FITNESS-OTHER-CLASS"));
  assert.deepEqual(other({ classId: 2, propertyId: "contract-presence-freshness", outcome: "unavailable", violations: [] }), pfDeny("PENDING-FITNESS-OTHER-CLASS"));
});

test("pending allowance: a violation target outside the pending set denies, including the zero-entry-point sentinel", () => {
  const readiness = pfReadiness();
  const finding = (...violations) => pfFitness(pfFinding(6, ...violations));
  assert.deepEqual(pfDecide(readiness, finding(pfViolation("missing-verification-entry-point", "tests/other.test.mjs"))), pfDeny("PENDING-FITNESS-TARGET-NOT-PENDING"));
  assert.deepEqual(pfDecide(readiness, finding(pfViolation("missing-verification-entry-point", "none"))), pfDeny("PENDING-FITNESS-TARGET-NOT-PENDING"));
  assert.deepEqual(pfDecide(readiness, finding(pfViolation("missing-verification-entry-point", PF_ENTRY), pfViolation("missing-verification-entry-point", "tests/other.test.mjs"))),
    pfDeny("PENDING-FITNESS-TARGET-NOT-PENDING"), "one covered and one uncovered violation");
  assert.deepEqual(pfDecide(readiness, finding()), pfDeny("PENDING-FITNESS-TARGET-NOT-PENDING"), "a finding that names no target cannot be matched");
  assert.deepEqual(pfDecide(readiness, finding({ ruleId: "missing-verification-entry-point", module: "application" })), pfDeny("PENDING-FITNESS-TARGET-NOT-PENDING"));
  assert.deepEqual(pfDecide(pfReadiness({ pendingPhysicalSurfaces: [PF_IMPLEMENTATION] }), pfFitness(pfFinding(2, pfViolation("missing-contract", PF_CONTRACT)))),
    pfDeny("PENDING-FITNESS-TARGET-NOT-PENDING"));
});

test("pending allowance: a defect that is not absence (unreadable surface) denies even on a pending target", () => {
  assert.deepEqual(pfDecide(pfReadiness(), pfFitness(pfFinding(6, pfViolation("unreadable-verification-entry-point", PF_ENTRY)))), pfDeny("PENDING-FITNESS-UNEXPECTED-RULE"));
  assert.deepEqual(pfDecide(pfReadiness({ pendingPhysicalSurfaces: [PF_CONTRACT] }), pfFitness(pfFinding(2, pfViolation("unreadable-contract", PF_CONTRACT)))), pfDeny("PENDING-FITNESS-UNEXPECTED-RULE"));
});

test("pending allowance: a navigation-currency finding is never allowed, because its violation names no stale contract", () => {
  const entry = pfViolation("missing-verification-entry-point", PF_ENTRY);
  const stale = pfFinding(7, { ruleId: "architecture-map-stale", module: "architecture", target: "architecture/map", details: "Navigation map stale" });
  assert.deepEqual(pfDecide(pfReadiness(), pfFitness(pfFinding(6, entry), stale)), pfDeny("PENDING-FITNESS-NAVIGATION-UNPROVEN"));
  const missingIndex = pfFinding(7, { ruleId: "missing-navigation-index", module: "architecture", target: "/x/architecture/map/index.md" });
  assert.deepEqual(pfDecide(pfReadiness(), pfFitness(missingIndex)), pfDeny("PENDING-FITNESS-NAVIGATION-UNPROVEN"));
  assert.deepEqual(pfDecide(pfReadiness({ pendingPhysicalSurfaces: ["architecture/map", PF_ENTRY] }), pfFitness(stale)),
    pfDeny("PENDING-FITNESS-NAVIGATION-UNPROVEN"), "a pending set that happens to contain the constant map target does not prove the contract");
});

test("pending allowance: malformed input is denied as malformed and never throws", () => {
  const good = pfFitness(pfFinding(6, pfViolation("missing-verification-entry-point", PF_ENTRY)));
  const malformed = pfDeny("PENDING-FITNESS-INPUT-MALFORMED");
  for (const input of [undefined, null, 7, "x", [], {}, { readiness: pfReadiness() }, { fitness: good }]) {
    assert.deepEqual(greenfieldPendingFitnessAllowance(input), malformed, JSON.stringify(input));
  }
  assert.deepEqual(pfDecide(null, good), malformed);
  assert.deepEqual(pfDecide({ status: "ready" }, good), malformed, "readiness without a fitness object");
  assert.deepEqual(pfDecide(pfReadiness(), null), malformed);
  assert.deepEqual(pfDecide(pfReadiness(), { outcomes: "nope" }), malformed);
  assert.deepEqual(pfDecide(pfReadiness(), { outcomes: [null] }), malformed);
  assert.deepEqual(pfDecide(pfReadiness(), { outcomes: [{ classId: 6, outcome: "finding", violations: [] }] }), malformed, "no propertyId");
  assert.deepEqual(pfDecide(pfReadiness(), { outcomes: [{ classId: 6, propertyId: "verification-locality", outcome: "finding", violations: "x" }] }), malformed);
  assert.deepEqual(pfDecide(pfReadiness({ pendingPhysicalSurfaces: "tests/x" }), good), malformed);
  assert.deepEqual(pfDecide(pfReadiness({ pendingPhysicalSurfaces: [PF_ENTRY, 7] }), good), malformed);
  assert.deepEqual(pfDecide(pfReadiness({ pendingPhysicalSurfaces: [PF_ENTRY, ""] }), good), malformed);
  const hostile = { get status() { throw new Error("hostile getter"); } };
  assert.deepEqual(pfDecide(hostile, good), malformed);
  assert.deepEqual(pfDecide(pfReadiness(), { get outcomes() { throw new Error("hostile getter"); } }), malformed);
});
