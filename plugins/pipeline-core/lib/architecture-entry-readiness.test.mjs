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
  inspectArchitectureEntryReadiness,
  inspectPlanningDecisionApplicability,
  summarizePlanningDecisionApplicability,
} from "./architecture-entry-readiness.mjs";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
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
  const result = inspectArchitectureEntryReadiness({
    rootDir: repoRoot,
    deps: { checkPlanningAdoptionDisposition: () => ({ ok: true, disposition: "deferred", scope: [ARCHITECTURE_ENTRY_SCOPE], expiresAt: "2099-01-01" }) },
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  assert.equal(result.fitness.blockingOverallStatus, "deferred");
  assert.equal(result.fitness.reportOnly.length, 10);
  assert.equal(result.artifacts.map.status, "current");
  assert.equal(result.artifacts.fitnessModel.status, "current");
  assert.equal(result.artifacts.baseline.status, "current");
  assert.equal(result.disposition.disposition, "deferred");
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
  const options = { rootDir: repoRoot, deps: {
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
    deps: {
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
    deps: {
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
    deps: {
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
