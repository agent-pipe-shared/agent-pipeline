// SPDX-License-Identifier: SUL-1.0
/**
 * rigor-floor.test.mjs -- Unit tests for Minimum Rigor Floor Derivation.
 *
 * Implements the 14 fixture classes from Issue #105 / Spec §5.1 / AC-7.
 */

import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  deriveMinimumRigor,
  normalizeInputs,
  computeInputDigest,
  loadPolicy,
  SCHEMA_RIGOR_DERIVATION,
  DEFAULT_DERIVATION_REVISION
} from "./rigor-floor.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../");
const POLICY_PATH = path.join(REPO_ROOT, "policies", "rigor-derivation.v1.json");
const SCHEMA_PATH = path.join(REPO_ROOT, "schemas", "pipeline.rigor-derivation.v1.json");

const policy = JSON.parse(fs.readFileSync(POLICY_PATH, "utf8"));
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));

describe("WP-B1 / Issue #105: Minimum Rigor Floor Derivation", () => {
  // Fixture 1: Identical normalized inputs produce identical floor & inputDigest (pinned test)
  test("1. Identical normalized inputs produce identical floor & inputDigest (pinned test)", () => {
    const inputA = {
      plannedPaths: { value: ["docs/readme.md"], status: "available", sourceContract: "pipeline.plan.v1" },
      actualPaths: { value: ["docs/readme.md"], status: "available", sourceContract: "git.diff" },
      protectedTouches: { value: false, status: "available", sourceContract: "pipeline.protected-baseline.v1" },
      contractDeltas: { value: false, status: "available", sourceContract: "pipeline.contract-freeze.v1" },
      reversibility: { value: "high", status: "available", sourceContract: "pipeline.reversibility.v1" },
      diffStats: { value: { files: 1, lines: 10 }, status: "available", sourceContract: "git.diff-stat" },
      selectedProfile: { value: "mini", status: "available", sourceContract: "human.plan" }
    };

    // inputB has permuted key order and permuted path arrays
    const inputB = {
      selectedProfile: { sourceContract: "human.plan", value: "mini", status: "available" },
      diffStats: { status: "available", sourceContract: "git.diff-stat", value: { lines: 10, files: 1 } },
      reversibility: { sourceContract: "pipeline.reversibility.v1", status: "available", value: "high" },
      contractDeltas: { value: false, sourceContract: "pipeline.contract-freeze.v1", status: "available" },
      protectedTouches: { sourceContract: "pipeline.protected-baseline.v1", value: false, status: "available" },
      actualPaths: { status: "available", value: ["./docs/readme.md"], sourceContract: "git.diff" },
      plannedPaths: { value: ["docs/readme.md"], sourceContract: "pipeline.plan.v1", status: "available" }
    };

    const resultA = deriveMinimumRigor(inputA, policy);
    const resultB = deriveMinimumRigor(inputB, policy);

    assert.equal(resultA.minProfile, "mini");
    assert.equal(resultB.minProfile, "mini");
    assert.equal(resultA.inputDigest, resultB.inputDigest);
    assert.deepEqual(resultA.requiredEvidenceClasses, resultB.requiredEvidenceClasses);
    assert.deepEqual(resultA.escalationTriggers, resultB.escalationTriggers);

    // Pinned SHA-256 digest
    const expectedDigest = computeInputDigest(normalizeInputs(inputA));
    assert.equal(resultA.inputDigest, expectedDigest);
    assert.match(resultA.inputDigest, /^[a-f0-9]{64}$/);
  });

  // Fixture 2: Unavailable / unknown inputs can only raise or keep floor, never lower
  test("2. Unavailable / unknown inputs can only raise or keep floor, never lower", () => {
    // Baseline routine change is mini
    const routineInput = {
      plannedPaths: ["docs/readme.md"],
      actualPaths: ["docs/readme.md"],
      protectedTouches: false,
      contractDeltas: false,
      reversibility: "high",
      diffStats: { files: 1, lines: 10 },
      selectedProfile: "mini"
    };
    const baselineResult = deriveMinimumRigor(routineInput, policy);
    assert.equal(baselineResult.minProfile, "mini");

    // Setting contractDeltas to unavailable raises floor from mini to feature
    const unavailableInput = {
      ...routineInput,
      contractDeltas: { value: null, status: "unavailable", sourceContract: "none" }
    };
    const escalatedResult = deriveMinimumRigor(unavailableInput, policy);
    assert.equal(escalatedResult.minProfile, "feature");
    assert.ok(escalatedResult.escalationTriggers.includes("UNAVAILABLE_OR_UNKNOWN_INPUT:contractDeltas"));

    // An already epic change (due to protected surface touch) cannot be lowered by unavailable inputs
    const epicWithUnavailable = {
      ...unavailableInput,
      protectedTouches: { value: true, status: "available", sourceContract: "test" }
    };
    const epicResult = deriveMinimumRigor(epicWithUnavailable, policy);
    assert.equal(epicResult.minProfile, "epic");
  });

  // Fixture 3: Touches to protected surfaces escalate to epic
  test("3. Touches to protected surfaces escalate to epic", () => {
    const input = {
      plannedPaths: ["plugins/pipeline-core/hooks/guard-git.test.mjs"],
      actualPaths: ["plugins/pipeline-core/hooks/guard-git.test.mjs"],
      protectedTouches: { value: true, status: "available", sourceContract: "pipeline.protected-baseline.v1" },
      contractDeltas: false,
      reversibility: "high",
      diffStats: { files: 1, lines: 5 },
      selectedProfile: "mini"
    };
    const result = deriveMinimumRigor(input, policy);
    assert.equal(result.minProfile, "epic");
    assert.ok(result.escalationTriggers.includes("TOUCHES_PROTECTED_BASELINE"));
    assert.ok(result.requiredEvidenceClasses.includes("security"));
    assert.ok(result.requiredEvidenceClasses.includes("critic"));
    assert.ok(result.requiredEvidenceClasses.includes("verify"));
  });

  // Fixture 4: High-risk reversibility escalates to epic
  test("4. High-risk reversibility escalates to epic", () => {
    for (const revValue of ["low", "irreversible"]) {
      const input = {
        plannedPaths: ["docs/guide.md"],
        actualPaths: ["docs/guide.md"],
        protectedTouches: false,
        contractDeltas: false,
        reversibility: { value: revValue, status: "available", sourceContract: "pipeline.reversibility.v1" },
        diffStats: { files: 1, lines: 10 },
        selectedProfile: "mini"
      };
      const result = deriveMinimumRigor(input, policy);
      assert.equal(result.minProfile, "epic");
      assert.ok(result.escalationTriggers.includes("IRREVERSIBLE_OR_LOW_REVERSIBILITY"));
      assert.ok(result.requiredEvidenceClasses.includes("security"));
    }
  });

  // Fixture 5: Public contract/schema deltas require at least feature
  test("5. Public contract/schema deltas require at least feature", () => {
    const input = {
      plannedPaths: ["schemas/pipeline.rigor-derivation.v1.json"],
      actualPaths: ["schemas/pipeline.rigor-derivation.v1.json"],
      protectedTouches: false,
      contractDeltas: { value: true, status: "available", sourceContract: "pipeline.contract-freeze.v1" },
      reversibility: "high",
      diffStats: { files: 1, lines: 20 },
      selectedProfile: "mini"
    };
    const result = deriveMinimumRigor(input, policy);
    assert.equal(result.minProfile, "feature");
    assert.ok(result.escalationTriggers.includes("CONTRACT_OR_SCHEMA_DELTA"));
    assert.ok(result.requiredEvidenceClasses.includes("critic"));
    assert.ok(result.requiredEvidenceClasses.includes("verify"));
  });

  // Fixture 6: Routine docs/internal-only change permits mini
  test("6. Routine docs/internal-only change permits mini", () => {
    const input = {
      plannedPaths: ["docs/readme.md"],
      actualPaths: ["docs/readme.md"],
      protectedTouches: false,
      contractDeltas: false,
      reversibility: "high",
      diffStats: { files: 1, lines: 15 },
      selectedProfile: "mini"
    };
    const result = deriveMinimumRigor(input, policy);
    assert.equal(result.minProfile, "mini");
    assert.deepEqual(result.requiredEvidenceClasses, ["verify"]);
    assert.equal(result.escalationTriggers.length, 0);
    assert.equal(result.disagreementLog, undefined);
    assert.match(result.explanation, /Routine change qualifies for mini profile/);
  });

  // Fixture 7: Planned surface vs actual surface expansion escalates floor
  test("7. Planned surface vs actual surface expansion escalates floor", () => {
    const input = {
      plannedPaths: { value: ["docs/readme.md"], status: "available", sourceContract: "pipeline.plan.v1" },
      actualPaths: { value: ["docs/readme.md", "src/unplanned.mjs"], status: "available", sourceContract: "git.diff" },
      protectedTouches: false,
      contractDeltas: false,
      reversibility: "high",
      diffStats: { files: 2, lines: 25 },
      selectedProfile: "mini"
    };
    const result = deriveMinimumRigor(input, policy);
    assert.equal(result.minProfile, "feature");
    assert.ok(result.escalationTriggers.includes("SURFACE_EXPANSION"));
  });

  test("7a. A clean worktree cannot hide an over-threshold PO-bound plan surface", () => {
    const input = {
      plannedPaths: { value: ["docs/a.md", "docs/b.md", "docs/c.md", "docs/d.md", "docs/e.md", "docs/f.md"], status: "available", sourceContract: "pipeline.po-bound-plan-surface.v1" },
      actualPaths: { value: [], status: "available", sourceContract: "git.working-tree" },
      protectedTouches: false,
      contractDeltas: false,
      reversibility: "high",
      diffStats: { files: 0, lines: 0 },
      selectedProfile: "mini"
    };
    const result = deriveMinimumRigor(input, policy);
    assert.equal(result.minProfile, "feature");
    assert.ok(result.escalationTriggers.includes("PLANNED_SURFACE_EXCEEDS_THRESHOLD"));
    assert.equal(result.disagreementLog?.derived, "feature");
  });

  // Fixture 8: Higher human-selected profile is respected beside floor (not lowered to floor)
  test("8. Higher human-selected profile is respected beside floor (not lowered to floor)", () => {
    const input = {
      plannedPaths: ["docs/readme.md"],
      actualPaths: ["docs/readme.md"],
      protectedTouches: false,
      contractDeltas: false,
      reversibility: "high",
      diffStats: { files: 1, lines: 10 },
      selectedProfile: "epic"
    };
    const result = deriveMinimumRigor(input, policy);
    // Derived minimum floor remains mini
    assert.equal(result.minProfile, "mini");
    // No disagreement log because human may always choose higher rigor
    assert.equal(result.disagreementLog, undefined);
    assert.match(result.explanation, /Human-selected profile 'epic' is higher than derived floor 'mini'/);
  });

  // Fixture 9: Lower human-selected profile generates disagreementLog entry
  test("9. Lower human-selected profile generates disagreementLog entry", () => {
    const input = {
      plannedPaths: ["schemas/test.json"],
      actualPaths: ["schemas/test.json"],
      protectedTouches: false,
      contractDeltas: true, // triggers feature
      reversibility: "high",
      diffStats: { files: 1, lines: 10 },
      selectedProfile: "mini" // lower than feature
    };
    const result = deriveMinimumRigor(input, policy);
    assert.equal(result.minProfile, "feature");
    assert.ok(result.disagreementLog);
    assert.equal(result.disagreementLog.selected, "mini");
    assert.equal(result.disagreementLog.derived, "feature");
    assert.match(result.disagreementLog.reason, /Selected profile 'mini' is below derived minimum rigor floor 'feature'/);
  });

  // Fixture 10: Asymmetric enforcement: agent cannot lower rigor via missing planned fields
  test("10. Asymmetric enforcement: agent cannot lower rigor via missing planned fields", () => {
    const input = {
      plannedPaths: { value: [], status: "unavailable", sourceContract: "none" },
      actualPaths: ["schemas/contract.json"],
      protectedTouches: false,
      contractDeltas: true,
      reversibility: "high",
      diffStats: { files: 1, lines: 10 },
      selectedProfile: "mini"
    };
    const result = deriveMinimumRigor(input, policy);
    assert.equal(result.minProfile, "feature");
    assert.ok(result.disagreementLog);
  });

  // Fixture 11: CLI --format json emits valid schema
  test("11. CLI --format json emits valid schema", () => {
    const tmpInputsFile = path.join(REPO_ROOT, "scratch", "test-cli-inputs.json");
    const testInputs = {
      plannedPaths: ["docs/readme.md"],
      actualPaths: ["docs/readme.md"],
      protectedTouches: false,
      contractDeltas: false,
      reversibility: "high",
      diffStats: { files: 1, lines: 10 },
      selectedProfile: "mini"
    };
    fs.writeFileSync(tmpInputsFile, JSON.stringify(testInputs), "utf8");

    try {
      const cliPath = path.join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "rigor-floor.mjs");
      const stdout = execFileSync("node", [cliPath, "--root", REPO_ROOT, "--inputs", tmpInputsFile, "--format", "json"], { encoding: "utf8" });
      const parsed = JSON.parse(stdout);
      const validation = validateAgainstSchema(parsed, schema);
      assert.equal(validation.valid, true, "CLI json output must validate against schema: " + validation.errors.join(", "));
      assert.equal(parsed.minProfile, "mini");
    } finally {
      if (fs.existsSync(tmpInputsFile)) fs.unlinkSync(tmpInputsFile);
    }
  });

  // Fixture 12: CLI --format text prints clear human explanation
  test("12. CLI --format text prints clear human explanation", () => {
    const tmpInputsFile = path.join(REPO_ROOT, "scratch", "test-cli-inputs-text.json");
    const testInputs = {
      plannedPaths: ["schemas/test.json"],
      actualPaths: ["schemas/test.json"],
      protectedTouches: false,
      contractDeltas: true,
      reversibility: "high",
      diffStats: { files: 1, lines: 10 },
      selectedProfile: "mini"
    };
    fs.writeFileSync(tmpInputsFile, JSON.stringify(testInputs), "utf8");

    try {
      const cliPath = path.join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "rigor-floor.mjs");
      const stdout = execFileSync("node", [cliPath, "--root", REPO_ROOT, "--inputs", tmpInputsFile, "--format", "text"], { encoding: "utf8" });
      assert.match(stdout, /Minimum Rigor Floor Derivation/);
      assert.match(stdout, /minProfile:\s+feature/);
      assert.match(stdout, /DISAGREEMENT LOG:/);
      assert.match(stdout, /Explanation:/);
    } finally {
      if (fs.existsSync(tmpInputsFile)) fs.unlinkSync(tmpInputsFile);
    }
  });

  // Fixture 13: Validation against pipeline.rigor-derivation.v1 schema
  test("13. Validation against pipeline.rigor-derivation.v1 schema", () => {
    const testCases = [
      // Case 1: Mini
      {
        plannedPaths: ["docs/readme.md"],
        actualPaths: ["docs/readme.md"],
        protectedTouches: false,
        contractDeltas: false,
        reversibility: "high",
        diffStats: { files: 1, lines: 10 },
        selectedProfile: "mini"
      },
      // Case 2: Feature with disagreementLog
      {
        plannedPaths: ["schemas/test.json"],
        actualPaths: ["schemas/test.json"],
        protectedTouches: false,
        contractDeltas: true,
        reversibility: "high",
        diffStats: { files: 1, lines: 10 },
        selectedProfile: "mini"
      },
      // Case 3: Epic
      {
        plannedPaths: ["plugins/pipeline-core/hooks/guard-git.test.mjs"],
        actualPaths: ["plugins/pipeline-core/hooks/guard-git.test.mjs"],
        protectedTouches: true,
        contractDeltas: true,
        reversibility: "low",
        diffStats: { files: 1, lines: 10 },
        selectedProfile: "epic"
      }
    ];

    for (const tc of testCases) {
      const result = deriveMinimumRigor(tc, policy);
      const validation = validateAgainstSchema(result, schema);
      assert.equal(validation.valid, true, "Result must satisfy schema: " + validation.errors.join(", "));
    }
  });

  // Fixture 14: Edge cases: empty inputs, missing optional dimensions
  test("14. Edge cases: empty inputs, missing optional dimensions", () => {
    const emptyResult = deriveMinimumRigor({}, policy);
    assert.equal(emptyResult.schema, SCHEMA_RIGOR_DERIVATION);
    assert.ok(["mini", "feature", "epic"].includes(emptyResult.minProfile));
    assert.ok(Array.isArray(emptyResult.requiredEvidenceClasses));
    assert.ok(Array.isArray(emptyResult.escalationTriggers));
    assert.match(emptyResult.inputDigest, /^[a-f0-9]{64}$/);
    const valEmpty = validateAgainstSchema(emptyResult, schema);
    assert.equal(valEmpty.valid, true, "Empty input derivation must satisfy schema");

    const nullResult = deriveMinimumRigor(null, policy);
    assert.equal(nullResult.schema, SCHEMA_RIGOR_DERIVATION);
    const valNull = validateAgainstSchema(nullResult, schema);
    assert.equal(valNull.valid, true, "Null input derivation must satisfy schema");

    const partialResult = deriveMinimumRigor({ diffStats: { files: 20, lines: 500 } }, policy);
    assert.equal(partialResult.minProfile, "feature");
    const valPartial = validateAgainstSchema(partialResult, schema);
    assert.equal(valPartial.valid, true, "Partial input derivation must satisfy schema");
  });
});
