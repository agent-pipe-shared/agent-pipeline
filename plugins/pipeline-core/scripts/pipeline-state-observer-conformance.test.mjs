// SPDX-License-Identifier: SUL-1.0
/**
 * Core lifecycle writer/observer conformance suite per PRD §7 AC-3 / WP-A5(ii).
 *
 * Asserts that the following primary pipeline-state.mjs transition verbs:
 *   init, continuity-init, set-feature, submit-plan, present-plan,
 *   cancel-submitted-plan, approve-plan, reopen-design, revoke-plan, set-phase,
 *   close-feature, discard-feature
 * produce machine states that are accepted without error by BOTH:
 *   1. classifyOnboardingContinuity (plugins/pipeline-core/lib/onboarding-continuity.mjs)
 *   2. observeSessionCleanupState (plugins/pipeline-core/lib/onboarding-continuity.mjs)
 *
 * Specifically verifies that after discard-feature (from an active feature with null Result),
 * observeSessionCleanupState does NOT throw SESSION-CLEANUP-STATE-MALFORMED and
 * classifyOnboardingContinuity classifies the state as valid.
 * This is not an exhaustive inventory of the CLI's sanctioned commands;
 * authority/recovery, deployment/publication and newer continuity verbs need
 * separate positive writer-to-observer evidence before AC-3 can be claimed.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

import { run, statePath as resolveStatePath } from "./pipeline-state.mjs";
import { sha256CanonicalJson } from "../lib/plan-spec-state-v2.mjs";
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
  // submit-plan resolves the real git HEAD of the fixture repository (PLAN-SUBMIT-HEAD-UNAVAILABLE
  // without a commit), so every fixture gets one initial commit; author is repository-local only.
  for (const args of [["add", "-A"], ["commit", "-q", "--allow-empty", "--no-verify", "-m", "fixture"]]) {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
    assert.equal(r.status, 0, r.stderr);
  }
  return root;
}

function fixtureAuthoritySha256(root, relativePath) {
  const filePath = join(root, relativePath);
  // Positive fixtures bind actual authority bytes; absent-file fixtures retain
  // their historical path-based digest without creating an authority file.
  const bytes = existsSync(filePath) ? readFileSync(filePath) : relativePath;
  return createHash("sha256").update(bytes).digest("hex");
}

function createDeps(root, featureId, planPath, specPath, now = "2026-09-13T12:00:00.000Z") {
  const planSha256 = fixtureAuthoritySha256(root, planPath);
  const specSha256 = fixtureAuthoritySha256(root, specPath);
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
    allowLegacyClose: true,
    now: () => now,
    designAdvisoryAdmission: () => ({ ok: true, id: "a".repeat(64) }),
    architectureEntryReadiness: () => ({ status: "ready" }),
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

// Observer conformance tests the state projection, not the separate
// epic/feature package-signature ceremony. Keep feature submission/cancellation
// coverage above, and exercise approved transitions through the mini route.
const OBSERVER_APPROVAL_PROFILE = "mini";

function initContinuity(root, featureId, planPath, specPath, deps) {
  const continuityPayload = {
    schema: "pipeline.continuity.v0",
    featureId,
    revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: {
      prd: { path: planPath, sha256: fixtureAuthoritySha256(root, planPath) },
      spec: { path: specPath, sha256: fixtureAuthoritySha256(root, specPath) },
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

test("conformance: cancel-submitted-plan returns the active feature to a state accepted by both observers", () => {
  const root = tempRoot("cancel-submitted-plan");
  try {
    const featureId = "feature-cancel-submission";
    const planPath = `specs/${featureId}/prd.md`;
    const specPath = `specs/${featureId}/spec.md`;
    mkdirSync(join(root, "specs", featureId), { recursive: true });
    writeFileSync(join(root, planPath), `# PRD for ${featureId}\n\nRequirements.\n`);
    writeFileSync(join(root, specPath), `# Spec for ${featureId}\n\nDetails.\n`);
    const deps = createDeps(root, featureId, planPath, specPath);
    assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);
    initContinuity(root, featureId, planPath, specPath, deps);
    assert.equal(run(["submit-plan", "--by", "Elephant", "--profile", "feature"], deps), 0);
    const submitted = JSON.parse(readFileSync(resolveStatePath(root), "utf8"));
    assert.equal(run(["cancel-submitted-plan", "--by", "PO", "--submission-sha256", sha256CanonicalJson(submitted.planSubmission)], deps), 0);
    const { classification, cleanupState } = assertObserverConformance(root, "cancel-submitted-plan");
    assert.equal(classification.status, "valid");
    assert.equal(cleanupState.mode, "active");
    assert.equal(cleanupState.activeFeatureId, featureId);
  } finally { rmSync(root, { recursive: true, force: true }); }
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
    assert.equal(run(["submit-plan", "--by", "Elephant", "--profile", OBSERVER_APPROVAL_PROFILE], deps), 0);
    assert.equal(run(["present-plan", "--by", "Elephant"], deps), 0);
    assertObserverConformance(root, "present-plan");

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

test("conformance: reopen-design after approved plan produces state accepted by both observers", () => {
  const root = tempRoot("reopen-design");
  try {
    const featureId = "feature-reopen";
    const planPath = `specs/${featureId}/prd.md`;
    const specPath = `specs/${featureId}/spec.md`;
    mkdirSync(join(root, "specs", featureId), { recursive: true });
    writeFileSync(join(root, planPath), `# PRD for ${featureId}\n\nRequirements.\n`);
    writeFileSync(join(root, specPath), `# Spec for ${featureId}\n\nDetails.\n`);
    const deps = createDeps(root, featureId, planPath, specPath);
    assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);
    initContinuity(root, featureId, planPath, specPath, deps);
    assert.equal(run(["submit-plan", "--by", "Elephant", "--profile", OBSERVER_APPROVAL_PROFILE], deps), 0);
    assert.equal(run(["present-plan", "--by", "Elephant"], deps), 0);
    assert.equal(run(["approve-plan", "--by", "PO"], deps), 0);
    assert.equal(run(["reopen-design", "--by", "PO"], deps), 0);
    const { classification, cleanupState } = assertObserverConformance(root, "reopen-design");
    assert.equal(classification.status, "valid");
    assert.equal(cleanupState.mode, "active");
    assert.equal(cleanupState.activeFeatureId, featureId);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// reopen-design --dry-run (Phoenix slice b, backlog Wanted 3): preview of what a real reopen voids.
function captureRun(argv, deps) {
  const lines = [];
  const original = console.log;
  console.log = (...parts) => { lines.push(parts.join(" ")); };
  let exit;
  try { exit = run(argv, deps); } finally { console.log = original; }
  return { exit, out: lines.join("\n") };
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function approvedFixture(name) {
  const root = tempRoot(name);
  const featureId = `feature-${name}`;
  const planPath = `specs/${featureId}/prd.md`;
  const specPath = `specs/${featureId}/spec.md`;
  mkdirSync(join(root, "specs", featureId), { recursive: true });
  writeFileSync(join(root, planPath), `# PRD for ${featureId}\n\nRequirements.\n`);
  writeFileSync(join(root, specPath), `# Spec for ${featureId}\n\nDetails.\n`);
  const deps = createDeps(root, featureId, planPath, specPath);
  assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);
  initContinuity(root, featureId, planPath, specPath, deps);
  assert.equal(run(["submit-plan", "--by", "Elephant", "--profile", OBSERVER_APPROVAL_PROFILE], deps), 0);
  assert.equal(run(["present-plan", "--by", "Elephant"], deps), 0);
  assert.equal(run(["approve-plan", "--by", "PO"], deps), 0);
  return { root, deps, featureId };
}

test("conformance: reopen-design --dry-run previews an approved plan and leaves state byte-identical", () => {
  const { root, deps } = approvedFixture("dryrun-preview");
  try {
    const stateFile = resolveStatePath(root);
    const before = sha256File(stateFile);
    const dirBefore = readdirSync(join(root, ".claude")).sort();
    const { exit, out } = captureRun(["reopen-design", "--by", "PO", "--dry-run"], deps);
    assert.equal(exit, 0);
    const preview = JSON.parse(out);
    assert.equal(preview.schema, "pipeline.reopen-design-preview.v1");
    assert.equal(preview.dryRun, true);
    assert.equal(preview.wrote, false);
    assert.equal(preview.ok, true);
    assert.equal(preview.wouldChange, true);
    assert.equal(preview.voids.planApprovalPresent, true);
    assert.equal(preview.phase.after, "design");
    assert.equal(sha256File(stateFile), before, "dry-run must not touch the state file");
    assert.deepEqual(readdirSync(join(root, ".claude")).sort(), dirBefore, "dry-run must not create audit or invalidation files");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("conformance: reopen-design --dry-run voided set equals what the real reopen then voids", () => {
  const { root, deps } = approvedFixture("dryrun-equals-real");
  try {
    const stateFile = resolveStatePath(root);
    const pre = JSON.parse(readFileSync(stateFile, "utf8"));
    const { exit, out } = captureRun(["reopen-design", "--by", "PO", "--dry-run"], deps);
    assert.equal(exit, 0);
    const preview = JSON.parse(out);
    assert.ok(pre.planApproval, "fixture must carry an approved plan");
    assert.equal(preview.voids.planApprovalSha256, sha256CanonicalJson(pre.planApproval));
    assert.equal(preview.voids.planSubmissionSha256, pre.planSubmission ? sha256CanonicalJson(pre.planSubmission) : null);
    assert.equal(preview.voids.approvalSignaturePresent, Boolean(pre.planApproval.designApproval));
    assert.equal(preview.phase.current, pre.activeFeature.phase);
    assert.equal(run(["reopen-design", "--by", "PO"], deps), 0);
    const post = JSON.parse(readFileSync(stateFile, "utf8"));
    // The real reopen voids by recording planInvalidation (planApproval stays as the invalidated record).
    assert.equal(post.planApproved, false, "real reopen withdraws the approval the preview named");
    assert.equal(post.planInvalidation.invalidatedApprovalSha256, preview.voids.planApprovalSha256);
    assert.equal(post.planInvalidation.invalidatedSubmissionSha256, preview.voids.planSubmissionSha256);
    assert.equal(post.activeFeature.phase, preview.phase.after);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("conformance: reopen-design --dry-run without an approved plan exits 0 with an empty preview", () => {
  const root = tempRoot("dryrun-no-plan");
  try {
    const featureId = "feature-dryrun-no-plan";
    const planPath = `specs/${featureId}/prd.md`;
    const specPath = `specs/${featureId}/spec.md`;
    mkdirSync(join(root, "specs", featureId), { recursive: true });
    writeFileSync(join(root, planPath), `# PRD\n`);
    writeFileSync(join(root, specPath), `# Spec\n`);
    const deps = createDeps(root, featureId, planPath, specPath);
    assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);
    const stateFile = resolveStatePath(root);
    const before = sha256File(stateFile);
    const { exit, out } = captureRun(["reopen-design", "--by", "PO", "--dry-run"], deps);
    assert.equal(exit, 0);
    const preview = JSON.parse(out);
    assert.equal(preview.wrote, false);
    assert.equal(preview.voids.planApprovalPresent, false);
    assert.equal(preview.voids.planApprovalSha256, null);
    assert.equal(preview.voids.planSubmissionSha256, null);
    assert.equal(preview.voids.receiptsBoundToPlanSha256, null);
    assert.equal(sha256File(stateFile), before);
    // wouldChange must predict whether the real reopen writes anything.
    assert.equal(run(["reopen-design", "--by", "PO"], deps), 0);
    assert.equal(preview.wouldChange, sha256File(stateFile) !== before, "preview wouldChange equals the real reopen's effect");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("conformance: reopen-design without --dry-run still writes and prints no preview", () => {
  const { root, deps } = approvedFixture("dryrun-real-unchanged");
  try {
    const stateFile = resolveStatePath(root);
    const before = sha256File(stateFile);
    const { exit, out } = captureRun(["reopen-design", "--by", "PO"], deps);
    assert.equal(exit, 0);
    assert.ok(!out.includes("pipeline.reopen-design-preview.v1"), "real reopen must not print the preview");
    assert.notEqual(sha256File(stateFile), before, "real reopen must still write state");
    const post = JSON.parse(readFileSync(stateFile, "utf8"));
    assert.equal(post.activeFeature.phase, "design");
    assert.equal(post.planApproved, false);
    assert.ok(post.planInvalidation, "real reopen records the invalidation");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("conformance: revoke-plan after approved plan produces state accepted by both observers", () => {
  const root = tempRoot("revoke-plan");
  try {
    const featureId = "feature-revoke";
    const planPath = `specs/${featureId}/prd.md`;
    const specPath = `specs/${featureId}/spec.md`;
    mkdirSync(join(root, "specs", featureId), { recursive: true });
    writeFileSync(join(root, planPath), `# PRD for ${featureId}\n\nRequirements.\n`);
    writeFileSync(join(root, specPath), `# Spec for ${featureId}\n\nDetails.\n`);
    const deps = createDeps(root, featureId, planPath, specPath);
    assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], deps), 0);
    initContinuity(root, featureId, planPath, specPath, deps);
    assert.equal(run(["submit-plan", "--by", "Elephant", "--profile", OBSERVER_APPROVAL_PROFILE], deps), 0);
    assert.equal(run(["present-plan", "--by", "Elephant"], deps), 0);
    assert.equal(run(["approve-plan", "--by", "PO"], deps), 0);
    assert.equal(run(["revoke-plan", "--by", "PO"], deps), 0);
    const { classification, cleanupState } = assertObserverConformance(root, "revoke-plan");
    assert.equal(classification.status, "valid");
    assert.equal(cleanupState.mode, "active");
    assert.equal(cleanupState.activeFeatureId, featureId);
  } finally { rmSync(root, { recursive: true, force: true }); }
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
    assert.equal(run(["submit-plan", "--by", "Elephant", "--profile", OBSERVER_APPROVAL_PROFILE], deps), 0);
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

    const exit = run(["close-feature", "--by", "PO", "--architecture-impact", "no-architecture-impact"], deps);
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
          prd: { path: planPath, sha256: fixtureAuthoritySha256(root, planPath) },
          spec: { path: specPath, sha256: fixtureAuthoritySha256(root, specPath) },
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

    const exit = run(["close-feature", "--by", "PO", "--architecture-impact", "no-architecture-impact", "--continuity-close-request", reqPath], deps);
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
          prd: { path: planPath, sha256: fixtureAuthoritySha256(root, planPath) },
          spec: { path: specPath, sha256: fixtureAuthoritySha256(root, specPath) },
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
    assert.equal(run(["close-feature", "--by", "PO", "--architecture-impact", "no-architecture-impact"], deps), 0);
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
    assert.equal(run(["submit-plan", "--by", "Elephant", "--profile", OBSERVER_APPROVAL_PROFILE], deps), 0);
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
    assert.equal(run(["close-feature", "--by", "PO", "--architecture-impact", "no-architecture-impact"], nextDeps), 0);
    assertObserverConformance(root, "e2e: close-feature");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
