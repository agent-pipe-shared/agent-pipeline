// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fixtureAdoption } from "../scripts/architecture-adoption-test-fixture.mjs";

import {
  ARCHITECTURE_ENTRY_SCOPE,
  inspectArchitectureEntryReadiness,
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
    cpSync(join(repoRoot, "backlog"), join(root, "backlog"), { recursive: true });
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
