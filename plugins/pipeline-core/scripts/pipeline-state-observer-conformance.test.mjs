// SPDX-License-Identifier: SUL-1.0
/**
 * Exhaustive writer/observer conformance verification suite per PRD §7 AC-3 / WP-A5(ii).
 *
 * Asserts that all sanctioned pipeline-state.mjs transition verbs:
 *   init, set-feature, submit-plan, approve-plan, set-phase, close-feature, discard-feature
 * produce machine states that are accepted without error by BOTH:
 *   1. classifyOnboardingContinuity (plugins/pipeline-core/lib/onboarding-continuity.mjs)
 *   2. observeSessionCleanupState (plugins/pipeline-core/lib/onboarding-continuity.mjs)
 *
 * Specifically verifies that after discard-feature (from an active feature with null Result),
 * observeSessionCleanupState does NOT throw SESSION-CLEANUP-STATE-MALFORMED and
 * classifyOnboardingContinuity classifies the state as valid.
 */

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

import { run, statePath as resolveStatePath } from "./pipeline-state.mjs";
import {
  classifyOnboardingContinuity,
  observeSessionCleanupState,
  planOnboardingKickoff,
  applyOnboardingKickoff,
} from "../lib/onboarding-continuity.mjs";
import { mkdtempTestScratch } from "../lib/test-tmpdir.mjs";

function tempRoot(name, { withStateMd = true } = {}) {
  const root = mkdtempTestScratch(`observer-conformance-${name}-`);
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  if (withStateMd) {
    writeFileSync(join(root, "docs", "state.md"), "# State\n\n## Next action\n- None\n");
  }
  const git = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  spawnSync("git", ["config", "user.name", "PO"], { cwd: root, encoding: "utf8", shell: false });
  spawnSync("git", ["config", "user.email", "po@test.invalid"], { cwd: root, encoding: "utf8", shell: false });
  const calibration = {
    project: "conformance-fixture",
    verify: "node verify.mjs",
    autonomy: "bounded",
    branchModel: "local",
    worktree: "supported",
    stakes: "high",
    constraints: [],
  };
  writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
  return root;
}

function createDeps(root, featureId, planPath, specPath, now = "2026-09-13T12:00:00.000Z") {
  const planSha256 = createHash("sha256").update(planPath).digest("hex");
  const specSha256 = createHash("sha256").update(specPath).digest("hex");
  const profile = {
    schema: "pipeline.po-gate-authority-evidence.v1",
    humanFacing: "en",
    sourceSha256: "1".repeat(64),
    runtimeSha256: "2".repeat(64),
    receiptSha256: "3".repeat(64),
    repositoryFingerprint: "4".repeat(64),
  };
  return {
    dir: root,
    now: () => now,
    poGateProfile: () => ({ ok: true, value: profile }),
    poGateAuthority: () => ({
      ok: true,
      value: {
        ...profile,
        schema: "pipeline.po-gate-authority.v2",
        planPath,
        planSha256,
        specPath,
        specSha256,
      },
    }),
    gitHead: () => ({ ok: true, commit: "a".repeat(40) }),
  };
}

function initContinuity(root, featureId, planPath, specPath, deps) {
  const continuityPayload = {
    schema: "pipeline.continuity.v0",
    featureId,
    revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: {
      prd: { path: planPath, sha256: createHash("sha256").update(planPath).digest("hex") },
      spec: { path: specPath, sha256: createHash("sha256").update(specPath).digest("hex") },
      result: null,
    },
    queueHead: {
      packageId: "init-pkg",
      actionId: "review-plan",
      nextAction: "review",
      productRetryCount: 0,
      environmentRerouteCount: 0,
      dispatch: null,
    },
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
  const reqPath = `continuity-req-${featureId}.json`;
  writeFileSync(join(root, reqPath), JSON.stringify(continuityPayload, null, 2));

  const exit = run(
    ["continuity-init", "--expected-revision", "absent", "--request-file", reqPath, "--lock-token", "lock-token-test-123"],
    deps
  );
  assert.equal(exit, 0, "continuity-init must succeed");
}

function assertObserverConformance(root, label) {
  const classification = classifyOnboardingContinuity({ rootDir: root });
  assert.equal(
    classification.status,
    "valid",
    `${label}: classifyOnboardingContinuity expected status "valid", got "${classification.status}"`
  );

  let cleanupState;
  assert.doesNotThrow(() => {
    cleanupState = observeSessionCleanupState(root);
  }, `${label}: observeSessionCleanupState must not throw`);
  assert.ok(cleanupState, `${label}: observeSessionCleanupState returned falsy value`);
  return { classification, cleanupState };
}

test("conformance: init (kickoff initialization) produces state accepted by both observers", () => {
  const root = tempRoot("init-kickoff", { withStateMd: false });
  try {
    const plan = planOnboardingKickoff({ rootDir: root, goal: "Conformance test kickoff goal" });
    const result = applyOnboardingKickoff({
      plan,
      expectedPlanSha256: plan.planSha256,
      activate: true,
    });
    assert.equal(result.status, "applied");

    const { classification, cleanupState } = assertObserverConformance(root, "init (kickoff)");
    assert.equal(classification.status, "valid");
    assert.equal(cleanupState.mode, "active");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conformance: continuity-init verb produces state accepted by both observers", () => {
  const root = tempRoot("continuity-init");
  try {
    const featureId = "feature-continuity-init";
    const planPath = `specs/${featureId}/prd.md`;
    const specPath = `specs/${featureId}/spec.md`;
    mkdirSync(join(root, "specs", featureId), { recursive: true });
    writeFileSync(join(root, planPath), `# PRD ${featureId}\n\nDetails.\n`);
    writeFileSync(join(root, specPath), `# Spec ${featureId}\n\nDetails.\n`);

    const deps = createDeps(root, featureId, planPath, specPath);
    assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);

    initContinuity(root, featureId, planPath, specPath, deps);

    const { classification, cleanupState } = assertObserverConformance(root, "continuity-init");
    assert.equal(classification.status, "valid");
    assert.equal(cleanupState.mode, "active");
    assert.equal(cleanupState.activeFeatureId, featureId);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conformance: set-feature verb produces state accepted by both observers", () => {
  const root = tempRoot("set-feature");
  try {
    const featureId = "feature-set";
    const planPath = `specs/${featureId}/prd.md`;
    const deps = createDeps(root, featureId, planPath, `specs/${featureId}/spec.md`);

    const exit = run(["set-feature", "--id", featureId, "--plan-path", planPath], deps);
    assert.equal(exit, 0);

    const { classification, cleanupState } = assertObserverConformance(root, "set-feature");
    assert.equal(classification.status, "valid");
    assert.equal(cleanupState.mode, "active");
    assert.equal(cleanupState.activeFeatureId, featureId);
    assert.equal(cleanupState.sessionCleanup, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conformance: submit-plan verb produces state accepted by both observers", () => {
  const root = tempRoot("submit-plan");
  try {
    const featureId = "feature-submit";
    const planPath = `specs/${featureId}/prd.md`;
    const specPath = `specs/${featureId}/spec.md`;
    mkdirSync(join(root, "specs", featureId), { recursive: true });
    writeFileSync(join(root, planPath), `# PRD for ${featureId}\n\nRequirements.\n`);
    writeFileSync(join(root, specPath), `# Spec for ${featureId}\n\nDetails.\n`);

    const deps = createDeps(root, featureId, planPath, specPath);
    assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);
    initContinuity(root, featureId, planPath, specPath, deps);

    const exit = run(["submit-plan", "--by", "Elephant", "--profile", "feature"], deps);
    assert.equal(exit, 0);

    const { classification, cleanupState } = assertObserverConformance(root, "submit-plan");
    assert.equal(classification.status, "valid");
    assert.equal(cleanupState.mode, "active");
    assert.equal(cleanupState.activeFeatureId, featureId);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conformance: approve-plan verb produces state accepted by both observers", () => {
  const root = tempRoot("approve-plan");
  try {
    const featureId = "feature-approve";
    const planPath = `specs/${featureId}/prd.md`;
    const specPath = `specs/${featureId}/spec.md`;
    mkdirSync(join(root, "specs", featureId), { recursive: true });
    writeFileSync(join(root, planPath), `# PRD for ${featureId}\n\nRequirements.\n`);
    writeFileSync(join(root, specPath), `# Spec for ${featureId}\n\nDetails.\n`);

    const deps = createDeps(root, featureId, planPath, specPath);
    assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);
    initContinuity(root, featureId, planPath, specPath, deps);
    assert.equal(run(["submit-plan", "--by", "Elephant", "--profile", "feature"], deps), 0);
    assert.equal(run(["present-plan", "--by", "Elephant"], deps), 0);

    const exit = run(["approve-plan", "--by", "PO"], deps);
    assert.equal(exit, 0);

    const { classification, cleanupState } = assertObserverConformance(root, "approve-plan");
    assert.equal(classification.status, "valid");
    assert.equal(cleanupState.mode, "active");
    assert.equal(cleanupState.activeFeatureId, featureId);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conformance: set-phase verb produces state accepted by both observers", () => {
  const root = tempRoot("set-phase");
  try {
    const featureId = "feature-phase";
    const planPath = `specs/${featureId}/prd.md`;
    const specPath = `specs/${featureId}/spec.md`;
    mkdirSync(join(root, "specs", featureId), { recursive: true });
    writeFileSync(join(root, planPath), `# PRD for ${featureId}\n\nRequirements.\n`);
    writeFileSync(join(root, specPath), `# Spec for ${featureId}\n\nDetails.\n`);

    const deps = createDeps(root, featureId, planPath, specPath);
    assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);
    initContinuity(root, featureId, planPath, specPath, deps);
    assert.equal(run(["submit-plan", "--by", "Elephant", "--profile", "feature"], deps), 0);
    assert.equal(run(["present-plan", "--by", "Elephant"], deps), 0);
    assert.equal(run(["approve-plan", "--by", "PO"], deps), 0);

    const exit = run(["set-phase", "--phase", "implementation"], deps);
    assert.equal(exit, 0);

    const { classification, cleanupState } = assertObserverConformance(root, "set-phase (implementation)");
    assert.equal(classification.status, "valid");
    assert.equal(cleanupState.mode, "active");
    assert.equal(cleanupState.activeFeatureId, featureId);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conformance: close-feature verb (design close) produces state accepted by both observers", () => {
  const root = tempRoot("close-feature-design");
  try {
    const featureId = "feature-close-design";
    const planPath = `specs/${featureId}/prd.md`;
    const deps = createDeps(root, featureId, planPath, `specs/${featureId}/spec.md`);

    assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);

    const exit = run(["close-feature", "--by", "PO"], deps);
    assert.equal(exit, 0);

    const { classification, cleanupState } = assertObserverConformance(root, "close-feature (design)");
    assert.equal(classification.status, "valid");
    assert.equal(cleanupState.mode, "closed");
    assert.equal(cleanupState.activeFeatureId, null);
    assert.equal(cleanupState.sessionCleanup, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conformance: close-feature verb (continuity close request) produces state accepted by both observers", () => {
  const root = tempRoot("close-feature-continuity");
  try {
    const featureId = "feature-close-continuity";
    const planPath = `specs/${featureId}/prd.md`;
    const specPath = `specs/${featureId}/spec.md`;
    const resultPath = `specs/${featureId}/result.md`;
    const evidencePath = `evidence/${featureId}/close.md`;
    mkdirSync(join(root, "specs", featureId), { recursive: true });
    mkdirSync(join(root, "evidence", featureId), { recursive: true });
    writeFileSync(join(root, planPath), `# PRD ${featureId}\n`);
    writeFileSync(join(root, specPath), `# Spec ${featureId}\n`);
    writeFileSync(join(root, resultPath), `# Result ${featureId}\nComplete.\n`);
    writeFileSync(join(root, evidencePath), `# Evidence ${featureId}\nVerified.\n`);

    const resultSha256 = createHash("sha256").update(readFileSync(join(root, resultPath))).digest("hex");
    const evidenceSha256 = createHash("sha256").update(readFileSync(join(root, evidencePath))).digest("hex");

    const deps = createDeps(root, featureId, planPath, specPath);
    assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);

    // Provide continuity state at nextAction: "close" with Result bound
    const stateFile = resolveStatePath(root);
    const existingState = JSON.parse(readFileSync(stateFile, "utf8"));
    const stateWithContinuity = {
      ...existingState,
      continuity: {
        schema: "pipeline.continuity.v0",
        featureId,
        revision: 1,
        runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
        authority: {
          prd: { path: planPath, sha256: createHash("sha256").update(planPath).digest("hex") },
          spec: { path: specPath, sha256: createHash("sha256").update(specPath).digest("hex") },
          result: { path: resultPath, sha256: resultSha256 },
        },
        queueHead: { packageId: "close-pkg", actionId: "close-action", nextAction: "close", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
        blocker: null,
        acknowledgedFinal: null,
        resume: { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" },
        recovery: null,
        decisionTxn: null,
        capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
      },
    };
    writeFileSync(stateFile, JSON.stringify(stateWithContinuity, null, 2) + "\n");

    const closeRequest = {
      schema: "pipeline.continuity-close.v0",
      featureId,
      expectedRevision: 1,
      result: { path: resultPath, sha256: resultSha256 },
      closeEvidence: { path: evidencePath, sha256: evidenceSha256 },
    };
    const reqPath = "continuity-close-req.json";
    writeFileSync(join(root, reqPath), JSON.stringify(closeRequest, null, 2));

    const exit = run(["close-feature", "--by", "PO", "--continuity-close-request", reqPath], deps);
    assert.equal(exit, 0);

    const { classification, cleanupState } = assertObserverConformance(root, "close-feature (continuity close)");
    assert.equal(classification.status, "valid");
    assert.equal(cleanupState.mode, "closed");
    assert.equal(cleanupState.sessionCleanup, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conformance: discard-feature produces valid state without SESSION-CLEANUP-STATE-MALFORMED", () => {
  const root = tempRoot("discard-feature");
  try {
    const featureId = "feature-discard";
    const planPath = `specs/${featureId}/prd.md`;
    const specPath = `specs/${featureId}/spec.md`;
    mkdirSync(join(root, "specs", featureId), { recursive: true });
    writeFileSync(join(root, planPath), `# PRD ${featureId}\n`);
    writeFileSync(join(root, specPath), `# Spec ${featureId}\n`);

    const deps = createDeps(root, featureId, planPath, specPath);
    assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);

    // Add active continuity with null Result (the exact precondition for discard-feature)
    const stateFile = resolveStatePath(root);
    const existingState = JSON.parse(readFileSync(stateFile, "utf8"));
    const withContinuity = {
      ...existingState,
      continuity: {
        schema: "pipeline.continuity.v0",
        featureId,
        revision: 2,
        runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
        authority: {
          prd: { path: planPath, sha256: createHash("sha256").update(planPath).digest("hex") },
          spec: { path: specPath, sha256: createHash("sha256").update(specPath).digest("hex") },
          result: null,
        },
        queueHead: { packageId: "work-pkg", actionId: "implement", nextAction: "dispatch", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
        blocker: null,
        acknowledgedFinal: null,
        resume: { mode: "immediate", sourceRevision: 2, reasonCode: "active-turn" },
        recovery: null,
        decisionTxn: null,
        capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
      },
    };
    writeFileSync(stateFile, JSON.stringify(withContinuity, null, 2) + "\n");

    // Execute discard-feature
    const exit = run(
      ["discard-feature", "--by", "PO", "--reason", "abandoned prior to implementation per product direction"],
      deps
    );
    assert.equal(exit, 0);

    // Primary assertion: observeSessionCleanupState does NOT throw SESSION-CLEANUP-STATE-MALFORMED
    let cleanupState;
    assert.doesNotThrow(() => {
      cleanupState = observeSessionCleanupState(root);
    }, "observeSessionCleanupState must NOT throw SESSION-CLEANUP-STATE-MALFORMED after discard-feature");
    assert.equal(cleanupState.mode, "closed");
    assert.equal(cleanupState.activeFeatureId, null);
    assert.equal(cleanupState.sessionCleanup, null);

    // Primary assertion: classifyOnboardingContinuity classifies the state as valid
    const classification = classifyOnboardingContinuity({ rootDir: root });
    assert.equal(classification.status, "valid");

    // Assert that session is not stranded: set-feature succeeds immediately after discard
    const nextFeatureId = "feature-recovered";
    const nextPlanPath = `specs/${nextFeatureId}/prd.md`;
    const nextExit = run(["set-feature", "--id", nextFeatureId, "--plan-path", nextPlanPath], deps);
    assert.equal(nextExit, 0);

    const afterSetFeature = assertObserverConformance(root, "set-feature after discard-feature");
    assert.equal(afterSetFeature.cleanupState.mode, "active");
    assert.equal(afterSetFeature.cleanupState.activeFeatureId, nextFeatureId);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conformance: discard-feature with prior closed feature produces state accepted by both observers", () => {
  const root = tempRoot("discard-after-close");
  try {
    const firstFeatureId = "first-feature";
    const firstPlanPath = `specs/${firstFeatureId}/prd.md`;
    const deps = createDeps(root, firstFeatureId, firstPlanPath, `specs/${firstFeatureId}/spec.md`);

    // 1. Close first feature
    assert.equal(run(["set-feature", "--id", firstFeatureId, "--plan-path", firstPlanPath], deps), 0);
    assert.equal(run(["close-feature", "--by", "PO"], deps), 0);
    assertObserverConformance(root, "first feature closed");

    // 2. Open second feature
    const secondFeatureId = "second-feature";
    const secondPlanPath = `specs/${secondFeatureId}/prd.md`;
    assert.equal(run(["set-feature", "--id", secondFeatureId, "--plan-path", secondPlanPath], deps), 0);

    // 3. Attach continuity with null Result
    const stateFile = resolveStatePath(root);
    const existingState = JSON.parse(readFileSync(stateFile, "utf8"));
    const withContinuity = {
      ...existingState,
      continuity: {
        schema: "pipeline.continuity.v0",
        featureId: secondFeatureId,
        revision: 0,
        runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
        authority: {
          prd: { path: secondPlanPath, sha256: createHash("sha256").update(secondPlanPath).digest("hex") },
          spec: { path: `specs/${secondFeatureId}/spec.md`, sha256: "b".repeat(64) },
          result: null,
        },
        queueHead: { packageId: "p", actionId: "a", nextAction: "dispatch", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
        blocker: null,
        acknowledgedFinal: null,
        resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
        recovery: null,
        decisionTxn: null,
        capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
      },
    };
    writeFileSync(stateFile, JSON.stringify(withContinuity, null, 2) + "\n");

    // 4. Discard second feature
    const exit = run(["discard-feature", "--by", "PO", "--reason", "discarded after earlier close"], deps);
    assert.equal(exit, 0);

    // State now has BOTH closedFeatures and discardedFeatures
    const postState = JSON.parse(readFileSync(stateFile, "utf8"));
    assert.equal(Array.isArray(postState.closedFeatures), true);
    assert.equal(postState.closedFeatures.length, 1);
    assert.equal(Array.isArray(postState.discardedFeatures), true);
    assert.equal(postState.discardedFeatures.length, 1);

    const { classification, cleanupState } = assertObserverConformance(root, "discard after close");
    assert.equal(classification.status, "valid");
    assert.equal(cleanupState.mode, "closed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conformance: complete end-to-end lifecycle progression through all transition verbs", () => {
  const root = tempRoot("e2e-progression");
  try {
    const featureId = "feature-e2e";
    const planPath = `specs/${featureId}/prd.md`;
    const specPath = `specs/${featureId}/spec.md`;
    mkdirSync(join(root, "specs", featureId), { recursive: true });
    writeFileSync(join(root, planPath), `# PRD ${featureId}\n\nRequirements.\n`);
    writeFileSync(join(root, specPath), `# Spec ${featureId}\n\nDetails.\n`);

    const deps = createDeps(root, featureId, planPath, specPath);

    // Verb 1: set-feature
    assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);
    assertObserverConformance(root, "e2e: set-feature");

    // Verb 2: continuity-init
    initContinuity(root, featureId, planPath, specPath, deps);
    assertObserverConformance(root, "e2e: continuity-init");

    // Verb 3: submit-plan
    assert.equal(run(["submit-plan", "--by", "Elephant", "--profile", "feature"], deps), 0);
    assertObserverConformance(root, "e2e: submit-plan");

    // Verb 4: approve-plan (requires present-plan)
    assert.equal(run(["present-plan", "--by", "Elephant"], deps), 0);
    assert.equal(run(["approve-plan", "--by", "PO"], deps), 0);
    assertObserverConformance(root, "e2e: approve-plan");

    // Verb 5: set-phase
    assert.equal(run(["set-phase", "--phase", "implementation"], deps), 0);
    assertObserverConformance(root, "e2e: set-phase");

    // Verb 6: discard-feature (from implementation phase with null Result)
    assert.equal(run(["discard-feature", "--by", "PO", "--reason", "pivoting direction in implementation"], deps), 0);
    assertObserverConformance(root, "e2e: discard-feature");

    // Re-enter with new feature
    const nextId = "feature-e2e-followup";
    const nextPlan = `specs/${nextId}/prd.md`;
    const nextSpec = `specs/${nextId}/spec.md`;
    mkdirSync(join(root, "specs", nextId), { recursive: true });
    writeFileSync(join(root, nextPlan), `# PRD ${nextId}\n\nFollowup requirements.\n`);
    writeFileSync(join(root, nextSpec), `# Spec ${nextId}\n\nFollowup spec.\n`);
    const nextDeps = createDeps(root, nextId, nextPlan, nextSpec, "2026-09-13T13:00:00.000Z");

    assert.equal(run(["set-feature", "--id", nextId, "--plan-path", nextPlan], nextDeps), 0);
    assertObserverConformance(root, "e2e: set-feature (followup)");

    // Verb 7: close-feature
    assert.equal(run(["close-feature", "--by", "PO"], nextDeps), 0);
    assertObserverConformance(root, "e2e: close-feature");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
