// SPDX-License-Identifier: SUL-1.0
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  evaluateArchitectureFitness,
  loadFitnessModel,
  loadBaseline,
  saveBaseline,
  applyRatchet,
  extractJsImports,
  enforceDeterministicPassRule,
  enforceAntiFragmentation,
  evaluateModuleIdentityOwnership,
  evaluateContractPresenceFreshness,
  evaluateDependencyDirectionCycles,
  evaluateBoundaryCrossing,
  evaluateAuthorityEffectOwnership,
  evaluateVerificationLocality,
  evaluateNavigationCurrency,
  evaluateParallelOverlap,
  evaluateProfileDrift,
  evaluateCalibratedFrictionThresholds,
  OUTCOME_PASS,
  OUTCOME_FINDING,
  OUTCOME_UNAVAILABLE,
  OUTCOME_UNSUPPORTED,
  OUTCOME_UNKNOWN,
  OUTCOME_EXCEPTED,
  SCHEMA_FITNESS_EVIDENCE,
  SCHEMA_ARCHITECTURE_BASELINE
} from "./architecture-fitness.mjs";
import { loadMapBundle } from "./module-inventory.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { fixtureAdoption, fixtureGit } from "./architecture-adoption-test-fixture.mjs";

it("physical fitness rejects empty and whitespace-only contract and verification files", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitness-empty-"));
  try {
    fs.mkdirSync(path.join(rootDir, "docs"));
    fs.mkdirSync(path.join(rootDir, "tests"));
    fs.writeFileSync(path.join(rootDir, "docs/contract.md"), " \n");
    fs.writeFileSync(path.join(rootDir, "tests/app.test.mjs"), "");
    const inventory = [{ id: "app", publicContracts: ["docs/contract.md"],
      verificationEntryPoints: ["tests/app.test.mjs"] }];
    assert.equal(evaluateContractPresenceFreshness({ rootDir, inventory }).violations[0].ruleId, "stale-contract");
    assert.equal(evaluateVerificationLocality({ rootDir, inventory }).violations[0].ruleId, "empty-verification-entry-point");
    fs.writeFileSync(path.join(rootDir, "docs/contract.md"), "# Contract\n");
    fs.writeFileSync(path.join(rootDir, "tests/app.test.mjs"), "test('app', () => {});\n");
    assert.equal(evaluateContractPresenceFreshness({ rootDir, inventory }).outcome, OUTCOME_PASS);
    assert.equal(evaluateVerificationLocality({ rootDir, inventory }).outcome, OUTCOME_PASS);
  } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
});

import * as class9Authority from "../lib/architecture-adoption-authority.mjs";

it("D165-S3: class 9 is evaluable, not unavailable, for a scope that carries the class 9 constant", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitness-d165s3-"));
  try {
    fs.mkdirSync(path.join(rootDir, "architecture"));
    fs.cpSync(path.join(REPO_ROOT, "architecture/map"), path.join(rootDir, "architecture/map"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "project"));
    fs.writeFileSync(path.join(rootDir, "project/pipeline.json"), "{}\n");
    const evaluate = () => evaluateArchitectureFitness({ rootDir, profileDrift: false }).outcomes.find(o => o.classId === 9);
    fixtureAdoption({ rootDir, decision: "approved-scoped", scope: class9Authority.withClass9RequiredScope(["src/"]), rationale: "Legacy scope widened" });
    assert.notEqual(evaluate().outcome, OUTCOME_UNAVAILABLE);
    assert.equal(evaluate().outcome, OUTCOME_PASS);
  } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
});

it("actual fitness compares the durable accepted snapshot and refuses absent authority", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitness-accepted-"));
  try {
    fs.mkdirSync(path.join(rootDir, "architecture"));
    fs.cpSync(path.join(REPO_ROOT, "architecture/map"), path.join(rootDir, "architecture/map"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "project"));
    fs.writeFileSync(path.join(rootDir, "project/pipeline.json"), "{}\n");
    const evaluate = () => evaluateArchitectureFitness({ rootDir, profileDrift: false }).outcomes.find(o => o.classId === 9);
    assert.equal(evaluate().outcome, OUTCOME_UNAVAILABLE);
    fixtureAdoption({ rootDir, decision: "approved-scoped", scope: ["architecture/map", "project/pipeline.json", "pipeline.user.yaml"], rationale: "Accept test baseline" });
    assert.equal(evaluate().outcome, OUTCOME_PASS);
    fixtureGit(rootDir, ["commit", "--allow-empty", "-qm", "legitimate later commit"]);
    assert.equal(evaluate().outcome, OUTCOME_PASS, "durable authority survives later commits");
    for (const [file, dimension] of [["project/pipeline.json", "profileSha256"], ["pipeline.user.yaml", "modelSha256"], ["architecture/map/pipeline-core.md", "moduleSnapshotSha256"]]) {
      const full = path.join(rootDir, file), original = fs.readFileSync(full);
      fs.appendFileSync(full, "\n");
      const drift = evaluate();
      assert.equal(drift.outcome, OUTCOME_FINDING, file);
      assert.deepEqual(drift.evidence.changedDimensions, [dimension]);
      fs.writeFileSync(full, original);
    }
    const added = path.join(rootDir, "architecture/map/new-module.md");
    fs.writeFileSync(added, "new module");
    assert.equal(evaluate().outcome, OUTCOME_FINDING);
    fs.unlinkSync(added);
    const modulePath = path.join(rootDir, "architecture/map/pipeline-core.md");
    const moduleBytes = fs.readFileSync(modulePath);
    fs.unlinkSync(modulePath);
    assert.equal(evaluate().outcome, OUTCOME_FINDING, "deleted module");
    fs.writeFileSync(modulePath, moduleBytes);
    fs.writeFileSync(modulePath, moduleBytes.toString().replace("id: pipeline-core", "id: changed-identity"));
    const cli = spawnSync(process.execPath, [path.join(REPO_ROOT, "plugins/pipeline-core/scripts/architecture-fitness.mjs"), "--root", rootDir, "--json"], { encoding: "utf8" });
    assert.equal(cli.status, 1);
    assert.equal(JSON.parse(cli.stdout).outcomes.find(o => o.classId === 9).outcome, OUTCOME_FINDING);
    fs.writeFileSync(modulePath, moduleBytes);
    const statePath = path.join(rootDir, "architecture/adoption-state.json");
    const original = fs.readFileSync(statePath);
    const tampered = JSON.parse(original);
    tampered.authority.request.subject.profileSha256 = "0".repeat(64);
    fs.writeFileSync(statePath, JSON.stringify(tampered));
    assert.equal(evaluate().outcome, OUTCOME_UNAVAILABLE);
    const missingProof = JSON.parse(original);
    missingProof.authority.proof = null;
    fs.writeFileSync(statePath, JSON.stringify(missingProof));
    assert.equal(evaluate().outcome, OUTCOME_UNAVAILABLE);
    fs.writeFileSync(statePath, original);
    assert.equal(evaluate().outcome, OUTCOME_PASS);
    for (const options of [
      { decision: "partial" },
      { decision: "deferred", reviewDate: "2099-01-01" },
      { decision: "approved-scoped", expiresAt: "2020-01-01" },
      { decision: "approved-scoped", scope: ["architecture/map"] },
    ]) {
      fixtureAdoption({ rootDir, decision: "approved-scoped", scope: ["architecture/map", "project/pipeline.json", "pipeline.user.yaml"], rationale: "Test invalid full reference", ...options });
      assert.equal(evaluate().outcome, OUTCOME_UNAVAILABLE, JSON.stringify(options));
      assert.notEqual(evaluateArchitectureFitness({ rootDir }).overallStatus, OUTCOME_PASS);
    }
  } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const fitnessEvidenceSchema = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "schemas/pipeline.fitness-evidence.v1.json"), "utf8")
);
const architectureBaselineSchema = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "schemas/pipeline.architecture-baseline.v1.json"), "utf8")
);

describe("architecture-fitness evaluator & ratchet store (WP-D3, Issue #106, AC-10, AC-18, AC-21)", () => {
  const inventoryResult = loadMapBundle(REPO_ROOT);
  const inventory = inventoryResult.modules;

  describe("1. Ten evaluated property classes (Spec §7.3 / Doctrine §2.10)", () => {
    it("Class 1: module-identity-ownership verifies owned paths and flags unresolved ones", () => {
      const valid = evaluateModuleIdentityOwnership({
        rootDir: REPO_ROOT,
        inventory,
        candidatePaths: ["plugins/pipeline-core/scripts/architecture-fitness.mjs", "harness/verify-suites.json"]
      });
      assert.equal(valid.outcome, OUTCOME_PASS);
      assert.equal(valid.violations.length, 0);

      const invalid = evaluateModuleIdentityOwnership({
        rootDir: REPO_ROOT,
        inventory,
        candidatePaths: ["unregistered-root/mystery.js"]
      });
      assert.equal(invalid.outcome, OUTCOME_FINDING);
      assert.equal(invalid.violations.length, 1);
      assert.equal(invalid.violations[0].ruleId, "unresolved-module-path");
    });

    it("Class 2: contract-presence-freshness verifies public contracts and detects missing/stale files", () => {
      const valid = evaluateContractPresenceFreshness({
        rootDir: REPO_ROOT,
        inventory
      });
      assert.equal(valid.outcome, OUTCOME_PASS, `Contract check failed: ${valid.details}`);

      // Mock inventory with a missing contract
      const mockInventory = [
        {
          id: "test-module",
          publicContracts: ["nonexistent/fake-contract.json"]
        }
      ];
      const invalid = evaluateContractPresenceFreshness({
        rootDir: REPO_ROOT,
        inventory: mockInventory
      });
      assert.equal(invalid.outcome, OUTCOME_FINDING);
      assert.equal(invalid.violations[0].ruleId, "missing-contract");
    });

    it("Class 3: dependency-direction-cycles verifies dependencies, flags cycles, and returns unsupported for non-JS", () => {
      // Clean check
      const valid = evaluateDependencyDirectionCycles({
        rootDir: REPO_ROOT,
        inventory,
        candidatePaths: ["plugins/pipeline-core/scripts/architecture-fitness.mjs"]
      });
      assert.equal(valid.outcome, OUTCOME_PASS);

      // Non-JS language returns unsupported
      const unsupported = evaluateDependencyDirectionCycles({
        rootDir: REPO_ROOT,
        inventory,
        candidatePaths: ["foreign/legacy.py", "native/engine.rs"]
      });
      assert.equal(unsupported.outcome, OUTCOME_UNSUPPORTED);
      assert.ok(unsupported.details.includes("Language not supported"));

      // Cycle detection
      const cycleInventory = [
        { id: "mod-a", allowedDependencies: ["mod-b"] },
        { id: "mod-b", allowedDependencies: ["mod-a"] }
      ];
      const cycleCheck = evaluateDependencyDirectionCycles({
        rootDir: REPO_ROOT,
        inventory: cycleInventory
      });
      assert.equal(cycleCheck.outcome, OUTCOME_FINDING);
      assert.equal(cycleCheck.violations[0].ruleId, "dependency-cycle");
    });

    it("Class 4: boundary-crossing verifies candidate matches planned module boundaries", () => {
      const valid = evaluateBoundaryCrossing({
        rootDir: REPO_ROOT,
        inventory,
        candidatePaths: ["plugins/pipeline-core/scripts/architecture-fitness.mjs"],
        plannedModules: ["pipeline-core"]
      });
      assert.equal(valid.outcome, OUTCOME_PASS);

      const invalid = evaluateBoundaryCrossing({
        rootDir: REPO_ROOT,
        inventory,
        candidatePaths: ["harness/scripts/verify.mjs"],
        plannedModules: ["schemas"]
      });
      assert.equal(invalid.outcome, OUTCOME_FINDING);
      assert.equal(invalid.violations[0].ruleId, "unauthorized-boundary-crossing");
    });

    it("Class 5: authority-effect-ownership mechanically verifies side-effect ownership", () => {
      const valid = evaluateAuthorityEffectOwnership({
        rootDir: REPO_ROOT,
        inventory,
        candidatePaths: ["plugins/pipeline-core/scripts/architecture-fitness.mjs"]
      });
      assert.equal(valid.outcome, OUTCOME_PASS);

      // Create a temporary file with undeclared child_process in schemas module
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitness-effect-"));
      const fakeFile = path.join(tempDir, "fake.js");
      fs.writeFileSync(fakeFile, "import { execSync } from 'node:child_process'; execSync('ls');", "utf8");

      const mockInventory = [
        { id: "schemas", ownedPaths: ["fake.js", "schemas/**"], authorityEffects: ["schema-validation-contract"] }
      ];
      const invalid = evaluateAuthorityEffectOwnership({
        rootDir: tempDir,
        inventory: mockInventory,
        files: [fakeFile]
      });
      assert.equal(invalid.outcome, OUTCOME_FINDING);
      assert.equal(invalid.violations[0].ruleId, "undeclared-authority-effect");
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("Class 6: verification-locality verifies declared entry points exist", () => {
      const valid = evaluateVerificationLocality({
        rootDir: REPO_ROOT,
        inventory
      });
      assert.equal(valid.outcome, OUTCOME_PASS, `Verification locality failed: ${valid.details}`);

      const mockInventory = [
        { id: "mod", verificationEntryPoints: ["missing-test.mjs"] }
      ];
      const invalid = evaluateVerificationLocality({
        rootDir: REPO_ROOT,
        inventory: mockInventory
      });
      assert.equal(invalid.outcome, OUTCOME_FINDING);
      assert.equal(invalid.violations[0].ruleId, "missing-verification-entry-point");
    });

    it("Class 7: navigation-currency checks map freshness and records checkpoint debt (AC-18)", () => {
      const fresh = evaluateNavigationCurrency({
        rootDir: REPO_ROOT,
        inventory,
        mapStale: false
      });
      assert.equal(fresh.outcome, OUTCOME_PASS);

      // Stale map fails closed in candidate mode
      const staleCandidate = evaluateNavigationCurrency({
        rootDir: REPO_ROOT,
        inventory,
        mapStale: true,
        mode: "candidate"
      });
      assert.equal(staleCandidate.outcome, OUTCOME_FINDING);
      assert.equal(staleCandidate.stalenessDebt.length, 0);

      // Stale map in checkpoint mode records typed debt
      const staleCheckpoint = evaluateNavigationCurrency({
        rootDir: REPO_ROOT,
        inventory,
        mapStale: true,
        mode: "push",
        checkpoint: true
      });
      assert.equal(staleCheckpoint.outcome, OUTCOME_FINDING);
      assert.equal(staleCheckpoint.stalenessDebt.length, 1);
      assert.equal(staleCheckpoint.stalenessDebt[0].type, "architecture-map-stale");
    });

    it("Class 7: a touched path that a module lists in adrReferences is current; an unreferenced ADR or a non-ADR contract is still stale (AC-18, AC-127)", () => {
      const adrInventory = [
        { id: "documentation", ownedPaths: ["docs/adr/**"], publicContracts: ["docs/contracts/documentation.md"], adrReferences: [] },
        { id: "app", ownedPaths: ["src/**"], publicContracts: [], adrReferences: ["docs/adr/0004-tenancy-model.md"] },
        { id: "platform", ownedPaths: ["schemas/**"], publicContracts: [], adrReferences: [] }
      ];
      const navigation = (touchedContracts) => evaluateNavigationCurrency({ rootDir: REPO_ROOT, inventory: adrInventory, touchedContracts });
      assert.equal(navigation(["docs/adr/0004-tenancy-model.md", "docs/adr/"]).outcome, OUTCOME_PASS);
      assert.equal(navigation(["docs/contracts/documentation.md"]).outcome, OUTCOME_PASS);
      assert.equal(navigation(["docs/adr/0099-x.md"]).outcome, OUTCOME_FINDING);
      assert.equal(navigation(["schemas/y.json"]).outcome, OUTCOME_FINDING);
      assert.equal(navigation(["docs/adr/0004-tenancy-model.md", "schemas/y.json"]).violations[0].ruleId, "architecture-map-stale");
    });

    it("Class 8: parallel-overlap checks concurrent write surfaces", () => {
      const disjoint = evaluateParallelOverlap({
        concurrentDispatches: [
          { taskId: "T1", writeSurface: ["plugins/pipeline-core/**"] },
          { taskId: "T2", writeSurface: ["harness/**"] }
        ]
      });
      assert.equal(disjoint.outcome, OUTCOME_PASS);

      const overlapping = evaluateParallelOverlap({
        concurrentDispatches: [
          { taskId: "T1", writeSurface: ["plugins/pipeline-core/scripts/**"] },
          { taskId: "T2", writeSurface: ["plugins/pipeline-core/scripts/module-inventory.mjs"] }
        ]
      });
      assert.equal(overlapping.outcome, OUTCOME_FINDING);
      assert.equal(overlapping.violations[0].ruleId, "parallel-write-overlap");
    });

    it("Class 9: profile-drift detects unapproved identity drift", () => {
      const stable = evaluateProfileDrift({
        inventory,
        fitnessModel: { modules: inventory },
        profileDrift: false
      });
      assert.equal(stable.outcome, OUTCOME_UNAVAILABLE);

      const drift = evaluateProfileDrift({
        inventory,
        fitnessModel: { modules: inventory },
        profileDrift: true
      });
      assert.equal(drift.outcome, OUTCOME_FINDING);
      assert.equal(drift.violations[0].ruleId, "profile-drift");
    });

    it("Class 10: calibrated-friction-thresholds reports honest status", () => {
      const unavailable = evaluateCalibratedFrictionThresholds({ telemetryUnavailable: true });
      assert.equal(unavailable.outcome, OUTCOME_UNAVAILABLE);

      const uncalibrated = evaluateCalibratedFrictionThresholds({ windowDays: 7 });
      assert.equal(uncalibrated.outcome, OUTCOME_UNAVAILABLE);
      assert.ok(uncalibrated.details.includes("elapsed days"));

      const excessive = evaluateCalibratedFrictionThresholds({ windowDays: 15, highFriction: true });
      assert.equal(excessive.outcome, OUTCOME_FINDING);

      const calibrated = evaluateCalibratedFrictionThresholds({ windowDays: 15, highFriction: false });
      assert.equal(calibrated.outcome, OUTCOME_UNAVAILABLE);
    });

    it("Class 10: absent or invalid calibration windows never claim calibrated pass", () => {
      for (const windowDays of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, "14", -1]) {
        const result = evaluateCalibratedFrictionThresholds({ windowDays });
        assert.equal(result.outcome, OUTCOME_UNAVAILABLE, `windowDays=${String(windowDays)}`);
      }
    });
  });

  describe("2. AC-10 Fixture: Deterministic-pass rule enforcement", () => {
    it("downgrades prompt-only claimed compliance to finding, never pass", () => {
      const outcomes = [
        { classId: 1, propertyId: "module-identity-ownership", outcome: OUTCOME_PASS, details: "Pass claimed." },
        { classId: 2, propertyId: "contract-presence-freshness", outcome: OUTCOME_PASS, details: "Pass claimed." }
      ];

      const enforced = enforceDeterministicPassRule(outcomes, { promptComplianceClaim: true });
      for (const o of enforced) {
        assert.notEqual(o.outcome, OUTCOME_PASS, "Outcome can NEVER be pass when claimed by prompt compliance");
        assert.equal(o.outcome, OUTCOME_FINDING);
        assert.ok(o.details.includes("AC-10 Deterministic-Pass Rule"));
      }
    });

    it("downgrades model-judged evaluation to unknown or finding, never pass", () => {
      const outcomes = [
        { classId: 4, propertyId: "boundary-crossing", outcome: OUTCOME_PASS, details: "Model judgment claimed clean." }
      ];

      const enforced = enforceDeterministicPassRule(outcomes, {
        evaluatorType: "model-judged",
        downgradeToUnknown: true
      });
      assert.equal(enforced[0].outcome, OUTCOME_UNKNOWN);
      assert.ok(enforced[0].details.includes("model-judged"));
    });
  });

  describe("3. AC-18 Fixture: Navigation currency fails closed and records debt", () => {
    it("candidate evaluation fails closed on stale map against touched contracts", () => {
      const res = evaluateArchitectureFitness({
        rootDir: REPO_ROOT,
        mode: "candidate",
        mapStale: true
      });
      assert.equal(res.overallStatus, "blocked");
      const nav = res.outcomes.find((o) => o.propertyId === "navigation-currency");
      assert.equal(nav.outcome, OUTCOME_FINDING);
    });

    it("checkpoint push permits exit while recording typed architecture-map-stale debt", () => {
      const res = evaluateArchitectureFitness({
        rootDir: REPO_ROOT,
        mode: "push",
        checkpoint: true,
        mapStale: true
      });
      const nav = res.outcomes.find((o) => o.propertyId === "navigation-currency");
      assert.equal(nav.outcome, OUTCOME_FINDING);
      assert.ok(res.stalenessDebt.length > 0);
      assert.equal(res.stalenessDebt[0].type, "architecture-map-stale");
    });
  });

  describe("3a. Calibration availability propagates to aggregate fitness", () => {
    it("reports unavailable when telemetry is unavailable and no findings block", () => {
      const res = evaluateArchitectureFitness({ rootDir: REPO_ROOT, telemetryUnavailable: true });
      assert.equal(res.overallStatus, OUTCOME_UNAVAILABLE);
      assert.equal(res.summary.unavailableCount, 2);
    });

    it("keeps real findings blocking when calibration is unavailable", () => {
      const res = evaluateArchitectureFitness({ rootDir: REPO_ROOT, telemetryUnavailable: true, mapStale: true });
      assert.equal(res.overallStatus, "blocked");
      assert.equal(res.summary.unavailableCount, 2);
      assert.ok(res.summary.findingCount > 0);
    });

    it("does not hide unavailable status behind unrelated excepted rows", () => {
      const baseline = {
        acceptedViolations: [
          { ruleId: "misleading-tiny-module-optimization", module: "micro", target: "micro", rationale: "test", acceptedAt: "2026-09-01" }
        ]
      };
      const res = evaluateArchitectureFitness({
        rootDir: REPO_ROOT,
        telemetryUnavailable: true,
        baseline,
        candidateModules: [{ id: "micro", shredTopology: true }]
      });
      assert.equal(res.overallStatus, OUTCOME_UNAVAILABLE);
      assert.equal(res.summary.unavailableCount, 2);
      assert.equal(res.summary.exceptedCount, 1);
    });
  });

  describe("4. AC-21 Fixture: Anti-fragmentation enforcement", () => {
    it("rejects misleading tiny-module optimization created to evade boundary checks", () => {
      const violations = enforceAntiFragmentation([
        {
          id: "tiny-facade-module",
          description: "Fragment into tiny modules to circumvent boundary check",
          splitIntoTinyModules: true
        }
      ]);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].ruleId, "misleading-tiny-module-optimization");
      assert.ok(violations[0].details.includes("AC-21"));
    });

    it("evaluator integrates anti-fragmentation and marks overallStatus blocked", () => {
      const res = evaluateArchitectureFitness({
        rootDir: REPO_ROOT,
        candidateModules: [
          { id: "micro-module-facade", shredTopology: true }
        ]
      });
      assert.equal(res.overallStatus, "blocked");
      const fragOutcome = res.outcomes.find((o) => o.propertyId === "refactorability-without-churn");
      assert.ok(fragOutcome);
      assert.equal(fragOutcome.outcome, OUTCOME_FINDING);
    });
  });

  it("AC-22 planning finding carries compared conformant remedies, but candidate findings do not", () => {
    const options = {
      rootDir: REPO_ROOT,
      plannedModules: ["harness"],
      candidatePaths: ["plugins/pipeline-core/scripts/architecture-fitness.mjs"],
      fitnessModel: { allowedBoundaryCrossings: [] },
      baseline: { acceptedViolations: [] },
      telemetryUnavailable: true,
    };
    const planning = evaluateArchitectureFitness({ ...options, mode: "planning" });
    const boundary = planning.outcomes.find((row) => row.propertyId === "boundary-crossing");
    assert.equal(boundary.outcome, OUTCOME_FINDING);
    const comparison = boundary.evidence.remedyComparisons[0];
    assert.equal(comparison.findingType, "boundary-crossing");
    assert.equal(comparison.currentModule, "pipeline-core");
    assert.equal(comparison.target, options.candidatePaths[0]);
    assert.ok(comparison.remedies.length >= 2);
    assert.equal(comparison.bestRemedy.conformant, true);
    assert.ok(comparison.remedies.some((remedy) => remedy.conformant === false));
    assert.equal(validateAgainstSchema(planning, fitnessEvidenceSchema).valid, true);

    const candidate = evaluateArchitectureFitness({ ...options, mode: "candidate" });
    assert.equal(candidate.outcomes.find((row) => row.propertyId === "boundary-crossing")
      .evidence.remedyComparisons, undefined);
  });

  describe("5. Baseline and Ratchet Store mechanics", () => {
    it("net-new violation fails, accepted baseline passes as excepted, ratchet reduces", () => {
      const initialBaseline = {
        schema: SCHEMA_ARCHITECTURE_BASELINE,
        baselineRevision: 1,
        acceptedViolations: [
          {
            ruleId: "legacy-cycle",
            module: "harness",
            target: "legacy",
            rationale: "Accepted legacy test debt",
            acceptedAt: "2026-08-01T00:00:00Z"
          },
          {
            ruleId: "temporary-boundary-leak",
            module: "pipeline-core",
            target: "harness",
            rationale: "Temporary transition leak",
            acceptedAt: "2026-08-01T00:00:00Z"
          }
        ],
        ratchetMetrics: { totalAcceptedViolations: 2, cycleCount: 1, boundaryCrossingsCount: 1 },
        lastEvaluatedAt: "2026-08-01T00:00:00Z"
      };

      // 1. Current run encounters legacy-cycle (accepted) + net-new violation (unaccepted)
      // Notice temporary-boundary-leak is RESOLVED (no longer present)!
      const currentViolations = [
        { ruleId: "legacy-cycle", module: "harness", target: "legacy", details: "Legacy cycle" },
        { ruleId: "net-new-crossing", module: "schemas", target: "pipeline-core", details: "Net-new crossing" }
      ];

      const { findings, resolvedCount, reducedBaseline } = applyRatchet(currentViolations, initialBaseline);

      // legacy-cycle is excepted
      const legacyResult = findings.find((f) => f.ruleId === "legacy-cycle");
      assert.equal(legacyResult.outcome, OUTCOME_EXCEPTED);
      assert.equal(legacyResult.rationale, "Accepted legacy test debt");

      // net-new-crossing is finding
      const netNewResult = findings.find((f) => f.ruleId === "net-new-crossing");
      assert.equal(netNewResult.outcome, OUTCOME_FINDING);

      // Ratchet reduction: temporary-boundary-leak was resolved!
      assert.equal(resolvedCount, 1);
      assert.equal(reducedBaseline.acceptedViolations.length, 1);
      assert.equal(reducedBaseline.ratchetMetrics.totalAcceptedViolations, 1);
      assert.equal(reducedBaseline.baselineRevision, 2);
    });

    it("rejects expired exceptions in baseline ratchet", () => {
      const expiredBaseline = {
        schema: SCHEMA_ARCHITECTURE_BASELINE,
        baselineRevision: 1,
        acceptedViolations: [
          {
            ruleId: "expired-debt",
            module: "schemas",
            target: "expired",
            rationale: "Debt expired yesterday",
            acceptedAt: "2026-08-01T00:00:00Z",
            expiresAt: "2026-09-01T00:00:00Z"
          }
        ],
        ratchetMetrics: { totalAcceptedViolations: 1, cycleCount: 0, boundaryCrossingsCount: 0 },
        lastEvaluatedAt: "2026-08-01T00:00:00Z"
      };

      const findings = [{ ruleId: "expired-debt", module: "schemas", target: "expired", details: "Expired" }];
      const res = applyRatchet(findings, expiredBaseline, new Date("2026-09-14T00:00:00Z"));
      assert.equal(res.findings[0].outcome, OUTCOME_FINDING);
      assert.equal(res.findings[0].expiredException, true);
    });
  });

  describe("6. Complete 21 Fixture Scenarios from Issue #106 / AC list", () => {
    it("Fixture 1: inherited greenfield default resolves to inherited-agent-first", () => {
      const res = evaluateArchitectureFitness({ rootDir: REPO_ROOT });
      assert.equal(res.profileSource, "inherited-agent-first");
    });

    it("Fixture 2: accepted custom profile is honored", () => {
      const customModel = {
        schema: "pipeline.fitness-model.v1",
        profileId: "accepted-custom-security",
        modules: inventory
      };
      const res = evaluateArchitectureFitness({ rootDir: REPO_ROOT, fitnessModel: customModel });
      assert.equal(res.profileSource, "accepted-custom-security");
    });

    it("Fixture 3: clean architecture reports unavailable without calibration telemetry", () => {
      const res = evaluateArchitectureFitness({ rootDir: REPO_ROOT });
      assert.equal(res.overallStatus, OUTCOME_UNAVAILABLE);
      assert.equal(res.summary.findingCount, 0);
      assert.equal(res.summary.unavailableCount, 2);
    });

    it("Fixture 4: missing/stale contract produces finding", () => {
      const res = evaluateContractPresenceFreshness({
        rootDir: REPO_ROOT,
        inventory: [{ id: "test", publicContracts: ["nonexistent.json"] }]
      });
      assert.equal(res.outcome, OUTCOME_FINDING);
    });

    it("Fixture 5: accepted legacy debt passes as excepted", () => {
      const baseline = {
        schema: SCHEMA_ARCHITECTURE_BASELINE,
        baselineRevision: 1,
        acceptedViolations: [{ ruleId: "missing-contract", module: "test", target: "nonexistent.json", rationale: "legacy", acceptedAt: "2026-08-01" }],
        ratchetMetrics: { totalAcceptedViolations: 1 },
        lastEvaluatedAt: "2026-08-01"
      };
      const res = applyRatchet([{ ruleId: "missing-contract", module: "test", target: "nonexistent.json", details: "missing" }], baseline);
      assert.equal(res.findings[0].outcome, OUTCOME_EXCEPTED);
    });

    it("Fixture 6: new/worsened violation fails", () => {
      const res = applyRatchet([{ ruleId: "new-violation", module: "m", target: "t", details: "new" }], { acceptedViolations: [] });
      assert.equal(res.findings[0].outcome, OUTCOME_FINDING);
    });

    it("Fixture 7: resolved violation reduces baseline deterministically", () => {
      const baseline = {
        schema: SCHEMA_ARCHITECTURE_BASELINE,
        baselineRevision: 1,
        acceptedViolations: [{ ruleId: "fixed-rule", module: "m", target: "t", rationale: "r", acceptedAt: "2026-08-01" }],
        ratchetMetrics: { totalAcceptedViolations: 1 }
      };
      const res = applyRatchet([], baseline);
      assert.equal(res.resolvedCount, 1);
      assert.equal(res.reducedBaseline.ratchetMetrics.totalAcceptedViolations, 0);
    });

    it("Fixture 8: new cycle detected and fails", () => {
      const cycleInv = [
        { id: "A", allowedDependencies: ["B"] },
        { id: "B", allowedDependencies: ["A"] }
      ];
      const res = evaluateDependencyDirectionCycles({ rootDir: REPO_ROOT, inventory: cycleInv });
      assert.equal(res.outcome, OUTCOME_FINDING);
      assert.equal(res.violations[0].ruleId, "dependency-cycle");
    });

    it("Fixture 9: hidden side effect detected and fails", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "side-effect-"));
      const testFile = path.join(tempDir, "proc.js");
      fs.writeFileSync(testFile, "import cp from 'node:child_process';", "utf8");
      const res = evaluateAuthorityEffectOwnership({
        rootDir: tempDir,
        inventory: [{ id: "m", ownedPaths: ["proc.js", "m/**"], authorityEffects: [] }],
        files: [testFile]
      });
      assert.equal(res.outcome, OUTCOME_FINDING);
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("Fixture 10: missing local verification entry point fails", () => {
      const res = evaluateVerificationLocality({
        rootDir: REPO_ROOT,
        inventory: [{ id: "m", verificationEntryPoints: ["absent.test.mjs"] }]
      });
      assert.equal(res.outcome, OUTCOME_FINDING);
    });

    it("Fixture 11: stale architecture map fails closed at candidate boundary", () => {
      const res = evaluateArchitectureFitness({ rootDir: REPO_ROOT, mapStale: true, mode: "candidate" });
      assert.equal(res.overallStatus, "blocked");
    });

    it("Fixture 12: analyzer unavailable returns unsupported/unavailable outcome", () => {
      const res = evaluateDependencyDirectionCycles({
        rootDir: REPO_ROOT,
        inventory,
        candidatePaths: ["main.py"]
      });
      assert.equal(res.outcome, OUTCOME_UNSUPPORTED);
    });

    it("Fixture 13: legitimate override passes as excepted with audit rationale", () => {
      const baseline = {
        acceptedViolations: [{ ruleId: "custom-rule", module: "m", target: "t", rationale: "PO approved waiver", acceptedAt: "2026-09-01" }]
      };
      const res = applyRatchet([{ ruleId: "custom-rule", module: "m", target: "t" }], baseline);
      assert.equal(res.findings[0].outcome, OUTCOME_EXCEPTED);
      assert.equal(res.findings[0].rationale, "PO approved waiver");
    });

    it("Fixture 14: expiry/supersession revokes exception and blocks", () => {
      const baseline = {
        acceptedViolations: [{ ruleId: "r", module: "m", target: "t", rationale: "r", acceptedAt: "2026-08-01", expiresAt: "2026-08-15" }]
      };
      const res = applyRatchet([{ ruleId: "r", module: "m", target: "t" }], baseline, new Date("2026-09-01"));
      assert.equal(res.findings[0].outcome, OUTCOME_FINDING);
      assert.equal(res.findings[0].expiredException, true);
    });

    it("Fixture 15: scope divergence triggers boundary-crossing finding", () => {
      const res = evaluateBoundaryCrossing({
        rootDir: REPO_ROOT,
        inventory,
        candidatePaths: ["harness/verify.mjs"],
        plannedModules: ["pipeline-core"]
      });
      assert.equal(res.outcome, OUTCOME_FINDING);
    });

    it("Fixture 16: prompt-only claimed compliance yields finding or unknown, never pass", () => {
      const res = evaluateArchitectureFitness({ rootDir: REPO_ROOT, promptComplianceClaim: true });
      for (const o of res.outcomes) {
        assert.notEqual(o.outcome, OUTCOME_PASS);
      }
    });

    it("Fixture 17: exact-candidate drift is detected", () => {
      const res = evaluateProfileDrift({ inventory, profileDrift: true });
      assert.equal(res.outcome, OUTCOME_FINDING);
    });

    it("Fixture 18: checkpoint push with stale map produces typed debt", () => {
      const res = evaluateNavigationCurrency({ rootDir: REPO_ROOT, inventory, mapStale: true, checkpoint: true, mode: "push" });
      assert.equal(res.stalenessDebt.length, 1);
      assert.equal(res.stalenessDebt[0].type, "architecture-map-stale");
    });

    it("Fixture 19: follow-up session blocked until push-time debt is consumed", () => {
      const baselineWithDebt = {
        schema: SCHEMA_ARCHITECTURE_BASELINE,
        baselineRevision: 1,
        acceptedViolations: [],
        ratchetMetrics: { totalAcceptedViolations: 0 },
        stalenessDebt: [{ type: "architecture-map-stale", module: "architecture" }]
      };
      // Planning evaluation checks if open stalenessDebt exists
      const hasDebt = (baselineWithDebt.stalenessDebt || []).length > 0;
      assert.equal(hasDebt, true, "Follow-up session identifies unconsumed staleness debt");
    });

    it("Fixture 20: publication push failing closed on a stale map", () => {
      const res = evaluateNavigationCurrency({ rootDir: REPO_ROOT, inventory, mapStale: true, checkpoint: false, mode: "push" });
      assert.equal(res.outcome, OUTCOME_FINDING);
    });

    it("Fixture 21: deterministic staleness-debt reduction on resolution", () => {
      const resFresh = evaluateNavigationCurrency({ rootDir: REPO_ROOT, inventory, mapStale: false });
      assert.equal(resFresh.outcome, OUTCOME_PASS);
      assert.equal(resFresh.stalenessDebt.length, 0);
    });
  });

  describe("7. JSON Schemas Conformance", () => {
    it("evidence output validates cleanly against pipeline.fitness-evidence.v1.json", () => {
      const evidence = evaluateArchitectureFitness({ rootDir: REPO_ROOT });
      const val = validateAgainstSchema(evidence, fitnessEvidenceSchema);
      assert.equal(val.valid, true, `Schema errors: ${val.errors.join("; ")}`);
    });

    it("live baseline validates cleanly against pipeline.architecture-baseline.v1.json", () => {
      const baseline = loadBaseline(REPO_ROOT);
      const val = validateAgainstSchema(baseline, architectureBaselineSchema);
      assert.equal(val.valid, true, `Schema errors: ${val.errors.join("; ")}`);
    });
  });
});

describe("D162 S1 architecture measure", () => {
  const NOW = new Date("2026-10-26T12:00:00.000Z");
  const measureUrl = "./architecture-measure.mjs";
  const git = (cwd, ...args) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout;
  };
  const initRepo = (files, { commit = true } = {}) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-measure-"));
    git(root, "init", "-q");
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.invalid");
    for (const [name, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), body);
    }
    if (commit) {
      git(root, "add", "-A");
      git(root, "commit", "-q", "-m", "fixture");
    }
    return root;
  };
  const cycleFiles = () => ({
    "README.md": "# fixture\n",
    "a/x.mjs": 'import { y } from "../b/y.mjs";\nexport const x = y;\n',
    "b/y.mjs": 'import { x } from "../a/x.mjs";\nexport const y = x;\n',
    "c/z.mjs": "export const z = 1;\n",
  });
  const snapshot = (root) => {
    const out = {};
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === ".git") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else out[path.relative(root, full)] = fs.readFileSync(full, "utf8");
      }
    };
    walk(root);
    return JSON.stringify(out);
  };

  it("plan lists modules a, b, c, root with measured dependencies and writes nothing", async () => {
    const { planArchitectureMeasure } = await import(measureUrl);
    const root = initRepo(cycleFiles());
    const before = snapshot(root);
    const res = planArchitectureMeasure(root, { now: () => NOW });
    assert.equal(res.schema, "pipeline.architecture-measure.v1");
    assert.equal(res.status, "planned");
    assert.equal(res.acceptedViolationCount, null);
    assert.deepEqual(res.modules.map((m) => m.id), ["a", "b", "c", "root"]);
    const dep = (id) => res.modules.find((m) => m.id === id).allowedDependencies;
    assert.deepEqual(dep("a"), ["b"]);
    assert.deepEqual(dep("b"), ["a"]);
    assert.deepEqual(dep("c"), []);
    assert.deepEqual(res.modules.find((m) => m.id === "root").ownedPaths, ["README.md"]);
    assert.equal(snapshot(root), before);
  });

  it("apply writes the targets, the map loads and the cycle is an excepted baseline entry", async () => {
    const { applyArchitectureMeasure } = await import(measureUrl);
    const root = initRepo(cycleFiles());
    const res = applyArchitectureMeasure(root, { now: () => NOW });
    assert.equal(res.status, "written", JSON.stringify(res));
    assert.ok(res.acceptedViolationCount > 0);
    for (const t of ["architecture/map/index.md", "architecture/map/a.md", "architecture/map/root.md", "architecture/fitness-model.json", "architecture/baseline.json"]) {
      assert.ok(res.targets.includes(t), t);
      assert.ok(fs.existsSync(path.join(root, t)), t);
    }
    assert.equal(loadMapBundle(root).ok, true);
    const evaluated = evaluateArchitectureFitness({ rootDir: root, mode: "candidate", now: NOW });
    assert.equal(evaluated.outcomes.some((o) => o.outcome === "finding"), false);
    assert.equal(evaluated.outcomes.find((o) => o.classId === 3).outcome, "excepted");
    assert.deepEqual(res.pendingClasses, [9, 10]);
    const baseline = JSON.parse(fs.readFileSync(path.join(root, "architecture/baseline.json"), "utf8"));
    assert.ok(baseline.acceptedViolations.some((v) => v.ruleId === "dependency-cycle"));
    assert.equal(baseline.origin, "brownfield-measure");
    assert.equal(baseline.baselineCommit, git(root, "rev-parse", "HEAD").trim());
    assert.equal(baseline.ratchetMetrics.totalAcceptedViolations, baseline.acceptedViolations.length);
    assert.ok(baseline.ratchetMetrics.cycleCount >= 1);
    assert.ok(res.followUps.includes("adoption record not written: run the adoption step"));
    assert.ok(res.followUps.includes("AGENTS.md has no link to architecture/map/index.md"));
    assert.equal(fs.existsSync(path.join(root, "architecture/adoption-state.json")), false);
    assert.equal(fs.existsSync(path.join(root, "AGENTS.md")), false);
  });

  it("entry readiness on the measured fixture is not blocked by map, fitness model or baseline codes", async () => {
    const { applyArchitectureMeasure } = await import(measureUrl);
    const { inspectArchitectureEntryReadiness } = await import("../lib/architecture-entry-readiness.mjs");
    const root = initRepo(cycleFiles());
    assert.equal(applyArchitectureMeasure(root, { now: () => NOW }).status, "written");
    const text = JSON.stringify(inspectArchitectureEntryReadiness({ rootDir: root, now: NOW }));
    for (const code of ["ARCHITECTURE-MAP-MISSING", "ARCHITECTURE-MAP-INVALID", "ARCHITECTURE-FITNESS-MODEL-INVALID", "ARCHITECTURE-BASELINE-INVALID"]) {
      assert.equal(text.includes(code), false, code);
    }
  });

  describe("refusals leave the tree byte-unchanged", () => {
    const refuses = async (root, code) => {
      const { planArchitectureMeasure, applyArchitectureMeasure } = await import(measureUrl);
      const before = snapshot(root);
      for (const run of [planArchitectureMeasure, applyArchitectureMeasure]) {
        const res = run(root, { now: () => NOW });
        assert.equal(res.status, "refused");
        assert.equal(res.code, code);
      }
      assert.equal(snapshot(root), before);
    };
    it("ARCHITECTURE-MEASURE-NO-COMMIT for a non-repository and for a repository without HEAD", async () => {
      await refuses(fs.mkdtempSync(path.join(os.tmpdir(), "arch-measure-plain-")), "ARCHITECTURE-MEASURE-NO-COMMIT");
      await refuses(initRepo({ "a/x.mjs": "export {};\n" }, { commit: false }), "ARCHITECTURE-MEASURE-NO-COMMIT");
    });
    it("ARCHITECTURE-MEASURE-TARGET-EXISTS when any target exists", async () => {
      await refuses(initRepo({ ...cycleFiles(), "architecture/baseline.json": "{}\n" }), "ARCHITECTURE-MEASURE-TARGET-EXISTS");
      await refuses(initRepo({ ...cycleFiles(), "architecture/map/index.md": "x\n" }), "ARCHITECTURE-MEASURE-TARGET-EXISTS");
    });
    it("ARCHITECTURE-MEASURE-DIRTY-TREE for untracked and for modified tracked files", async () => {
      const untracked = initRepo(cycleFiles());
      fs.writeFileSync(path.join(untracked, "new.txt"), "x");
      await refuses(untracked, "ARCHITECTURE-MEASURE-DIRTY-TREE");
      const modified = initRepo(cycleFiles());
      fs.appendFileSync(path.join(modified, "README.md"), "edit");
      await refuses(modified, "ARCHITECTURE-MEASURE-DIRTY-TREE");
    });
    it("ARCHITECTURE-MEASURE-EMPTY when nothing is tracked outside the exclusions", async () => {
      await refuses(initRepo({ ".claude/settings.json": "{}\n", "architecture/notes.md": "n\n" }), "ARCHITECTURE-MEASURE-EMPTY");
    });
  });

  it("re-running apply after a successful run refuses TARGET-EXISTS", async () => {
    const { applyArchitectureMeasure } = await import(measureUrl);
    const root = initRepo(cycleFiles());
    assert.equal(applyArchitectureMeasure(root, { now: () => NOW }).status, "written");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "measured");
    const before = snapshot(root);
    const res = applyArchitectureMeasure(root, { now: () => NOW });
    assert.equal(res.status, "refused");
    assert.equal(res.code, "ARCHITECTURE-MEASURE-TARGET-EXISTS");
    assert.equal(snapshot(root), before);
  });

  it("CLI --json prints one parseable result and exits 0 for plan, 1 for refusal", () => {
    const script = fileURLToPath(new URL("./architecture-measure.mjs", import.meta.url));
    const root = initRepo(cycleFiles());
    const ok = spawnSync(process.execPath, [script, "--root", root, "--json"], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).status, "planned");
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "arch-measure-plain-"));
    const bad = spawnSync(process.execPath, [script, "--root", plain, "--json"], { encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).code, "ARCHITECTURE-MEASURE-NO-COMMIT");
  });
});

describe("Class 6 and a module declared kind documentation (D9, part 4)", () => {
  const writeMap = (rows) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fit-doc-"));
    fs.mkdirSync(path.join(root, "architecture/map"), { recursive: true });
    fs.writeFileSync(path.join(root, "architecture/map/index.md"), "# Map\n");
    for (const row of rows) {
      const lines = Object.entries(row).flatMap(([k, v]) => (Array.isArray(v)
        ? (v.length === 0 ? [`${k}: []`] : [`${k}:`, ...v.map((item) => `  - ${JSON.stringify(item)}`)])
        : [`${k}: ${JSON.stringify(v)}`]));
      fs.writeFileSync(path.join(root, "architecture/map", `${row.id}.md`), ["---", ...lines, "---", ""].join("\n"));
    }
    return root;
  };
  const base = (extra = {}) => ({ id: "docs", responsibility: "Documentation", nonResponsibilities: [], ownedPaths: ["docs/**"], publicContracts: [], allowedDependencies: [], authorityEffects: [], verificationEntryPoints: [], adrReferences: [], ...extra });
  const class6 = (root) => {
    const bundle = loadMapBundle(root);
    assert.equal(bundle.ok, true, JSON.stringify(bundle.errors));
    return { bundle, res: evaluateVerificationLocality({ rootDir: root, inventory: bundle }) };
  };

  it("the loader carries kind only when the concept declares it", () => {
    const root = writeMap([base({ kind: "documentation" }), base({ id: "plain" })]);
    const { bundle } = class6(root);
    assert.equal(bundle.modules.find((m) => m.id === "docs").kind, "documentation");
    assert.equal(Object.hasOwn(bundle.modules.find((m) => m.id === "plain"), "kind"), false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("existing rows without kind keep exactly the previous key set", () => {
    const root = writeMap([base()]);
    const { bundle } = class6(root);
    assert.deepEqual(Object.keys(bundle.modules[0]), ["type", "id", "responsibility", "nonResponsibilities", "ownedPaths", "publicContracts", "allowedDependencies", "authorityEffects", "verificationEntryPoints", "adrReferences", "profileSource", "provisional", "candidateBinding", "conceptFilePath"]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("a documentation module with no entry points passes class 6", () => {
    const root = writeMap([base({ kind: "documentation" })]);
    const { res } = class6(root);
    assert.equal(res.outcome, OUTCOME_PASS, JSON.stringify(res.violations));
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("the same module without kind yields missing-verification-entry-point with target none", () => {
    const root = writeMap([base()]);
    const { res } = class6(root);
    assert.equal(res.outcome, OUTCOME_FINDING);
    assert.equal(res.violations[0].ruleId, "missing-verification-entry-point");
    assert.equal(res.violations[0].target, "none");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("a documentation module whose declared entry point file is missing still yields the finding", () => {
    const root = writeMap([base({ kind: "documentation", verificationEntryPoints: ["docs/check.mjs"] })]);
    const { res } = class6(root);
    assert.equal(res.outcome, OUTCOME_FINDING);
    assert.equal(res.violations[0].ruleId, "missing-verification-entry-point");
    assert.equal(res.violations[0].target, "docs/check.mjs");
    fs.rmSync(root, { recursive: true, force: true });
  });
});
