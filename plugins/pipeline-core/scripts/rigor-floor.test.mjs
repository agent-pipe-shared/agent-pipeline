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
  inferInputsFromRepo,
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

// B1 accepted-dimension observations (D2/D3/C1). Spec 5.1: an absent or unknown observation can
// only raise the floor, so a fixture that expects a mini floor must supply them.
const H1 = "a".repeat(64), H2 = "b".repeat(64), H3 = "c".repeat(64);
const BINDINGS = {
  protectedIdentity: { value: { baselineRevision: 1, baselineDigest: H1, mergedDigest: H2 }, status: "available", sourceContract: "pipeline.protected-baseline.v1" },
  architectureProfile: { value: { id: "inherited-agent-first", source: "plugins/pipeline-core/architecture/agent-first-profile.v1.json", sha256: H1 }, status: "available", sourceContract: "pipeline.architecture-profile.v1" },
  fitnessOutcomes: { value: { sourceSha256: H3, outcomes: [{ classId: 1, propertyId: "context-locality", outcome: "pass" }] }, status: "available", sourceContract: "pipeline.rigor-fitness-projection.v1" },
  interruptionLineage: { value: { featureId: "test-feature", snapshotSha256: H2, lineageCount: 0, receiptCount: 0 }, status: "available", sourceContract: "pipeline.interruption-store-snapshot.v1" }
};

describe("WP-B1 / Issue #105: Minimum Rigor Floor Derivation", () => {
  test("Git observation failures and untracked paths cannot masquerade as an empty mini surface", () => {
    const broken = inferInputsFromRepo(REPO_ROOT, { execFileSyncFn() { throw new Error("git unavailable"); } });
    assert.equal(broken.actualPaths.status, "unknown");
    assert.equal(broken.actualPaths.value, null);
    assert.equal(broken.protectedTouches.status, "unknown");
    assert.equal(broken.contractDeltas.status, "unknown");
    assert.equal(broken.diffStats.status, "unknown");
    assert.notEqual(deriveMinimumRigor(broken, policy).minProfile, "mini");

    const calls = [];
    const observed = inferInputsFromRepo(REPO_ROOT, { execFileSyncFn(command, argv, options) {
      assert.equal(command, "git");
      assert.equal(options.encoding, null);
      calls.push(argv.slice(3).join(" "));
      if (argv[3] === "diff" && argv[4] === "--name-only") return Buffer.from("src/with space.mjs\0");
      if (argv[3] === "ls-files") return Buffer.from("src/new file.mjs\0");
      throw new Error("unexpected Git command");
    } });
    assert.deepEqual(calls, ["diff --name-only -z HEAD", "ls-files --others --exclude-standard -z"]);
    assert.deepEqual(observed.actualPaths.value, ["src/new file.mjs", "src/with space.mjs"]);
    assert.equal(observed.actualPaths.status, "available");
    assert.equal(observed.plannedPaths.status, "unknown", "actual files are not a PO-approved plan");
    assert.equal(observed.selectedProfile.status, "unknown", "the CLI cannot invent a PO selection");
    assert.equal(observed.diffStats.status, "unknown", "untracked file lines were not counted");

    const deletionOnly = inferInputsFromRepo(REPO_ROOT, { execFileSyncFn(_command, argv) {
      if (argv[3] === "diff" && argv[4] === "--name-only") return Buffer.from("src/deleted.mjs\0");
      if (argv[3] === "ls-files") return Buffer.alloc(0);
      if (argv[3] === "diff" && argv[4] === "--shortstat") return Buffer.from(" 1 file changed, 4 deletions(-)\n");
      throw new Error("unexpected Git command");
    } });
    assert.deepEqual(deletionOnly.diffStats, { value: { files: 1, lines: 4 }, status: "available", sourceContract: "git.diff-stat" });
  });
  test("The State writer's own continuity lock is not a rigor input, and only that exact path is exempt", () => {
    const LOCK = "project/pipeline-state.json.lock";
    const observe = (untracked, options = {}) => {
      const calls = [];
      const inputs = inferInputsFromRepo(REPO_ROOT, { ...options, execFileSyncFn(_command, argv) {
        calls.push(argv.slice(3).join(" "));
        if (argv[3] === "diff" && argv[4] === "--name-only") return Buffer.from("src/changed.mjs\0");
        if (argv[3] === "ls-files") return untracked.length === 0 ? Buffer.alloc(0) : Buffer.from(`${untracked.join("\0")}\0`);
        if (argv[3] === "diff" && argv[4] === "--shortstat") return Buffer.from(" 1 file changed, 3 insertions(+), 1 deletion(-)\n");
        throw new Error("unexpected Git command");
      } });
      return { inputs, calls };
    };
    // The lock appears between the first and the second collect of one State write
    // (it is created by the write that compares them): it must not change the inputs.
    const without = observe([], { continuityLockPath: LOCK });
    const withLock = observe([LOCK], { continuityLockPath: LOCK });
    assert.deepEqual(withLock.inputs, without.inputs, "the writer's own lock must not enter the inputs");
    assert.deepEqual(withLock.calls, without.calls, "the same Git observations are made with and without the lock");
    assert.deepEqual(withLock.inputs.actualPaths.value, ["src/changed.mjs"]);
    assert.equal(withLock.inputs.diffStats.status, "available", "the lock must not mask the line count either");
    // Anything that is not exactly that path stays an input and keeps the line count unknown.
    const lookalikes = observe([`${LOCK}.other`, "other.lock"], { continuityLockPath: LOCK });
    assert.deepEqual(lookalikes.inputs.actualPaths.value, ["other.lock", `${LOCK}.other`, "src/changed.mjs"]);
    assert.equal(lookalikes.inputs.diffStats.status, "unknown");
    // Without an explicit lock path nothing is exempt: the lock is an ordinary untracked file.
    const unnamed = observe([LOCK]);
    assert.deepEqual(unnamed.inputs.actualPaths.value, [LOCK, "src/changed.mjs"]);
    // A tracked change at that path is still a change: only the untracked listing is filtered.
    const tracked = inferInputsFromRepo(REPO_ROOT, { continuityLockPath: LOCK, execFileSyncFn(_command, argv) {
      if (argv[3] === "diff" && argv[4] === "--name-only") return Buffer.from(`${LOCK}\0`);
      if (argv[3] === "ls-files") return Buffer.alloc(0);
      if (argv[3] === "diff" && argv[4] === "--shortstat") return Buffer.from(" 1 file changed, 1 insertion(+)\n");
      throw new Error("unexpected Git command");
    } });
    assert.deepEqual(tracked.actualPaths.value, [LOCK]);
  });
  // Fixture 1: Identical normalized inputs produce identical floor & inputDigest (pinned test)
  test("1. Identical normalized inputs produce identical floor & inputDigest (pinned test)", () => {
    const inputA = {
      plannedPaths: { value: ["docs/readme.md"], status: "available", sourceContract: "pipeline.plan.v1" },
      actualPaths: { value: ["docs/readme.md"], status: "available", sourceContract: "git.diff" },
      protectedTouches: { value: false, status: "available", sourceContract: "pipeline.protected-baseline.v1" },
      contractDeltas: { value: false, status: "available", sourceContract: "pipeline.contract-freeze.v1" },
      reversibility: { value: "high", status: "available", sourceContract: "pipeline.reversibility.v1" },
      diffStats: { value: { files: 1, lines: 10 }, status: "available", sourceContract: "git.diff-stat" },
      selectedProfile: { value: "mini", status: "available", sourceContract: "human.plan" },
      ...BINDINGS
    };

    // inputB has permuted key order and permuted path arrays
    const inputB = {
      selectedProfile: { sourceContract: "human.plan", value: "mini", status: "available" },
      diffStats: { status: "available", sourceContract: "git.diff-stat", value: { lines: 10, files: 1 } },
      reversibility: { sourceContract: "pipeline.reversibility.v1", status: "available", value: "high" },
      contractDeltas: { value: false, sourceContract: "pipeline.contract-freeze.v1", status: "available" },
      protectedTouches: { sourceContract: "pipeline.protected-baseline.v1", value: false, status: "available" },
      actualPaths: { status: "available", value: ["./docs/readme.md"], sourceContract: "git.diff" },
      plannedPaths: { value: ["docs/readme.md"], sourceContract: "pipeline.plan.v1", status: "available" },
      ...BINDINGS
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
      selectedProfile: "mini",
      ...BINDINGS
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
      selectedProfile: "mini",
      ...BINDINGS
    };
    const result = deriveMinimumRigor(input, policy);
    assert.equal(result.minProfile, "mini");
    assert.deepEqual(result.requiredEvidenceClasses, ["verify"]);
    assert.equal(result.escalationTriggers.length, 0);
    assert.equal(result.disagreementLog, undefined);
    assert.match(result.explanation, /Routine change qualifies for mini profile/);
  });

  // Fixture 6a: the same routine change WITHOUT the four accepted-dimension observations cannot reach mini
  test("6a. Absent protectedIdentity / architectureProfile / fitnessOutcomes / interruptionLineage can only raise the floor", () => {
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
    assert.equal(result.minProfile, "feature");
    for (const dimension of ["protectedIdentity", "architectureProfile", "fitnessOutcomes", "interruptionLineage"]) {
      assert.ok(result.escalationTriggers.includes(`UNAVAILABLE_OR_UNKNOWN_INPUT:${dimension}`), dimension);
    }
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
      selectedProfile: "epic",
      ...BINDINGS
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
      selectedProfile: "mini",
      ...BINDINGS
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
