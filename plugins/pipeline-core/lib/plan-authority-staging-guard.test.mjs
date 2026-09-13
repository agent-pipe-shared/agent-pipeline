// SPDX-License-Identifier: SUL-1.0
/**
 * plan-authority-staging-guard.test.mjs — WP-A4 (#102, AC-2, AC-4, Spec §4.4).
 *
 * Verifies:
 * 1. Staging directory refusal: submit-plan and approve-plan refuse planPath or
 *    specPath resolving inside project/.onboarding-staging/.
 * 2. Pre-authority banner refusal: submit-plan and approve-plan refuse files
 *    carrying the generated pre-authority banner even if copied outside staging.
 * 3. Promoted clean documents pass.
 * 4. Standard refusal code PLAN-BINDS-PRE-AUTHORITY-DRAFT and backwards-compat aliases.
 * 5. Refusal message names the promotion action and CLI invocation.
 * 6. set-feature in phase "design" initializes revision-0 continuity so submit-plan
 *    succeeds without PLAN-SUBMIT-CONTINUITY-INVALID and without continuity-init.
 * 7. Design-phase PRD/spec editing is permitted while design is open, and frozen
 *    during implementation (GUARD-LIFECYCLE-AUTHORITY-BOUND).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  INTAKE_STAGING_DIRNAME,
} from "./onboarding-continuity.mjs";
import {
  pathIsInsideOnboardingStaging,
  refusePlanAuthorityStagingPath,
  PLAN_BINDS_PRE_AUTHORITY_DRAFT,
  PLAN_AUTHORITY_STAGING_CODE,
  PLAN_AUTHORITY_STAGING_UNPROMOTED,
  PRE_AUTHORITY_BANNER_LINE,
  PRE_AUTHORITY_BANNER_SNIPPET,
  PLAN_AUTHORITY_PROMOTION_SUBCOMMAND,
  PLAN_AUTHORITY_PROMOTION_CLI_INVOCATION,
} from "./plan-authority-staging-guard.mjs";
import { ONBOARDING_SUBCOMMANDS } from "../scripts/project-onboarding-v3.mjs";
import { run, statePath, SCHEMA_ID } from "../scripts/pipeline-state.mjs";
import { evaluateLifecycleReadyGuard } from "../hooks/guard-lifecycle-ready.mjs";

function sha256Hex(content) {
  return createHash("sha256").update(content).digest("hex");
}

function tempProjectDir(prefix = "a4-staging-guard-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function capturedStderr(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => { lines.push(args.join(" ")); };
  try {
    const result = fn();
    return { result, lines };
  } finally {
    console.error = original;
  }
}

function planAuthorityFixture({
  featureId,
  planPath,
  specPath,
  planContent = "# PRD\n",
  specContent = "# Spec\n",
  now = "2026-08-27T10:00:00.000Z",
}) {
  const root = tempProjectDir();
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, "specs", featureId), { recursive: true });

  const fullPlanPath = join(root, planPath);
  const fullSpecPath = join(root, specPath);
  mkdirSync(join(fullPlanPath, ".."), { recursive: true });
  mkdirSync(join(fullSpecPath, ".."), { recursive: true });
  writeFileSync(fullPlanPath, planContent, "utf8");
  writeFileSync(fullSpecPath, specContent, "utf8");

  const planSha256 = sha256Hex(planContent);
  const specSha256 = sha256Hex(specContent);

  const profile = {
    schema: "pipeline.po-gate-authority-evidence.v1",
    humanFacing: "en",
    sourceSha256: "1".repeat(64),
    runtimeSha256: "2".repeat(64),
    receiptSha256: "3".repeat(64),
    repositoryFingerprint: "4".repeat(64),
  };

  const continuity = {
    schema: "pipeline.continuity.v0",
    featureId,
    revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: {
      prd: { path: planPath, sha256: planSha256 },
      spec: { path: specPath, sha256: specSha256 },
      result: null,
    },
    queueHead: {
      packageId: "initial-planning",
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
    closeTransition: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };

  const state = {
    schema: SCHEMA_ID,
    activeFeature: { id: featureId, planPath, phase: "design" },
    planApproved: false,
    continuity,
    updatedAt: now,
  };
  writeFileSync(statePath(root), JSON.stringify(state, null, 2) + "\n");

  const deps = {
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
  };

  return { root, deps, planPath, specPath, planSha256, specSha256 };
}

test("constants and backwards-compatibility aliases are correctly wired", () => {
  assert.equal(PLAN_BINDS_PRE_AUTHORITY_DRAFT, "PLAN-BINDS-PRE-AUTHORITY-DRAFT");
  assert.equal(PLAN_AUTHORITY_STAGING_CODE, PLAN_BINDS_PRE_AUTHORITY_DRAFT);
  assert.equal(PLAN_AUTHORITY_STAGING_UNPROMOTED, PLAN_BINDS_PRE_AUTHORITY_DRAFT);
  assert.ok(ONBOARDING_SUBCOMMANDS.some((entry) => entry.name === PLAN_AUTHORITY_PROMOTION_SUBCOMMAND),
    "promotion action must be a valid member of ONBOARDING_SUBCOMMANDS");
  assert.ok(PLAN_AUTHORITY_PROMOTION_CLI_INVOCATION.includes("kickoff promote apply"));
});

test("pathIsInsideOnboardingStaging identifies staging paths accurately", () => {
  const root = "/fake/repo";
  assert.ok(pathIsInsideOnboardingStaging(root, `${INTAKE_STAGING_DIRNAME}/prd_test.md`));
  assert.ok(pathIsInsideOnboardingStaging(root, `${INTAKE_STAGING_DIRNAME}/spec.md`));
  assert.ok(pathIsInsideOnboardingStaging(root, `${INTAKE_STAGING_DIRNAME}/sub/doc.md`));
  assert.equal(pathIsInsideOnboardingStaging(root, "specs/test/prd.md"), false);
  assert.equal(pathIsInsideOnboardingStaging(root, "specs/test/spec.md"), false);
  assert.equal(pathIsInsideOnboardingStaging(root, ""), false);
  assert.equal(pathIsInsideOnboardingStaging(root, null), false);
});

test("refusePlanAuthorityStagingPath refuses staging directory paths", () => {
  const root = tempProjectDir();
  try {
    const stagedPlan = `${INTAKE_STAGING_DIRNAME}/prd_1.md`;
    const cleanSpec = "specs/feat/spec.md";
    const result = refusePlanAuthorityStagingPath({
      rootDir: root,
      planPath: stagedPlan,
      specPath: cleanSpec,
      readFileFn: () => "clean content",
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, PLAN_BINDS_PRE_AUTHORITY_DRAFT);
    assert.ok(result.message.includes("plan path resolves inside"));
    assert.ok(result.message.includes(PLAN_AUTHORITY_PROMOTION_CLI_INVOCATION));
    assert.ok(result.message.includes(PLAN_AUTHORITY_PROMOTION_SUBCOMMAND));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refusePlanAuthorityStagingPath refuses banner line even outside staging", () => {
  const root = tempProjectDir();
  try {
    const bannerContent = `# My PRD\n\n${PRE_AUTHORITY_BANNER_LINE}\n\nRequirements.\n`;
    const cleanSpecContent = "# Spec\n\nArchitecture.\n";

    const result = refusePlanAuthorityStagingPath({
      rootDir: root,
      planPath: "specs/feat/prd.md",
      specPath: "specs/feat/spec.md",
      readFileFn: (path) => path.includes("prd.md") ? bannerContent : cleanSpecContent,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, PLAN_BINDS_PRE_AUTHORITY_DRAFT);
    assert.ok(result.message.includes("plan file carries a pre-authority staging banner"));
    assert.ok(result.message.includes(PLAN_AUTHORITY_PROMOTION_CLI_INVOCATION));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refusePlanAuthorityStagingPath passes for clean promoted files", () => {
  const root = tempProjectDir();
  try {
    const result = refusePlanAuthorityStagingPath({
      rootDir: root,
      planPath: "specs/feat/prd.md",
      specPath: "specs/feat/spec.md",
      readFileFn: () => "# Clean document without banner\n\nRequirements.\n",
    });
    assert.equal(result.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("submit-plan refuses pre-authority drafts with PLAN-BINDS-PRE-AUTHORITY-DRAFT", () => {
  // Scenario 1: in staging directory
  {
    const featureId = "staging-sub";
    const planPath = `${INTAKE_STAGING_DIRNAME}/prd_${featureId}.md`;
    const specPath = `${INTAKE_STAGING_DIRNAME}/spec.md`;
    const { root, deps } = planAuthorityFixture({ featureId, planPath, specPath });
    try {
      const attempt = capturedStderr(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps));
      assert.equal(attempt.result, 2);
      assert.ok(attempt.lines.some((l) => l.includes(PLAN_BINDS_PRE_AUTHORITY_DRAFT)));
      assert.ok(attempt.lines.some((l) => l.includes(PLAN_AUTHORITY_PROMOTION_SUBCOMMAND)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  // Scenario 2: outside staging but carries pre-authority banner
  {
    const featureId = "banner-sub";
    const planPath = `specs/${featureId}/prd_${featureId}.md`;
    const specPath = `specs/${featureId}/spec.md`;
    const planContent = `# PRD\n${PRE_AUTHORITY_BANNER_LINE}\n`;
    const { root, deps } = planAuthorityFixture({ featureId, planPath, specPath, planContent });
    try {
      const attempt = capturedStderr(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps));
      assert.equal(attempt.result, 2);
      assert.ok(attempt.lines.some((l) => l.includes(PLAN_BINDS_PRE_AUTHORITY_DRAFT)));
      assert.ok(attempt.lines.some((l) => l.includes("pre-authority staging banner")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("approve-plan independently refuses pre-authority drafts", () => {
  // Scenario 1: in staging directory
  {
    const featureId = "staging-appr";
    const planPath = `${INTAKE_STAGING_DIRNAME}/prd_${featureId}.md`;
    const specPath = `${INTAKE_STAGING_DIRNAME}/spec.md`;
    const { root, deps, planSha256, specSha256 } = planAuthorityFixture({ featureId, planPath, specPath });
    try {
      const state = JSON.parse(readFileSync(statePath(root), "utf8"));
      state.planSubmission = {
        schema: "pipeline.plan-submission.v1",
        featureId, planPath, planSha256, specPath, specSha256,
        profile: "feature", profileSha256: sha256Hex("profile"),
        submittedBy: "coordinator", submittedAt: "2026-08-27T10:01:00.000Z",
      };
      writeFileSync(statePath(root), JSON.stringify(state, null, 2) + "\n");
      const attempt = capturedStderr(() => run(["approve-plan", "--by", "po-test"], deps));
      assert.equal(attempt.result, 2);
      assert.ok(attempt.lines.some((l) => l.includes(PLAN_BINDS_PRE_AUTHORITY_DRAFT)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  // Scenario 2: outside staging but carries banner
  {
    const featureId = "banner-appr";
    const planPath = `specs/${featureId}/prd_${featureId}.md`;
    const specPath = `specs/${featureId}/spec.md`;
    const planContent = `# PRD\n${PRE_AUTHORITY_BANNER_LINE}\n`;
    const { root, deps, planSha256, specSha256 } = planAuthorityFixture({ featureId, planPath, specPath, planContent });
    try {
      const state = JSON.parse(readFileSync(statePath(root), "utf8"));
      state.planSubmission = {
        schema: "pipeline.plan-submission.v1",
        featureId, planPath, planSha256, specPath, specSha256,
        profile: "feature", profileSha256: sha256Hex("profile"),
        submittedBy: "coordinator", submittedAt: "2026-08-27T10:01:00.000Z",
      };
      writeFileSync(statePath(root), JSON.stringify(state, null, 2) + "\n");
      const attempt = capturedStderr(() => run(["approve-plan", "--by", "po-test"], deps));
      assert.equal(attempt.result, 2);
      assert.ok(attempt.lines.some((l) => l.includes(PLAN_BINDS_PRE_AUTHORITY_DRAFT)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("set-feature initializes revision-0 continuity so submit-plan succeeds without continuity-init", () => {
  const root = tempProjectDir();
  try {
    const featureId = "auto-continuity-feat";
    const planPath = `specs/${featureId}/prd.md`;
    const specPath = `specs/${featureId}/spec.md`;

    mkdirSync(join(root, "specs", featureId), { recursive: true });
    const prdText = "# PRD\nRequirements here.\n";
    const specText = "# Spec\nSpecification details.\n";
    writeFileSync(join(root, planPath), prdText, "utf8");
    writeFileSync(join(root, specPath), specText, "utf8");

    const planSha256 = sha256Hex(prdText);
    const specSha256 = sha256Hex(specText);
    const profile = {
      schema: "pipeline.po-gate-authority-evidence.v1",
      humanFacing: "en",
      sourceSha256: "1".repeat(64),
      runtimeSha256: "2".repeat(64),
      receiptSha256: "3".repeat(64),
      repositoryFingerprint: "4".repeat(64),
    };

    const deps = {
      dir: root,
      now: () => "2026-08-27T10:00:00.000Z",
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
    };

    // Step 1: set-feature
    const exitSet = run(["set-feature", "--id", featureId, "--plan-path", planPath], deps);
    assert.equal(exitSet, 0, "set-feature must succeed");

    // Assert continuity is initialized
    const state = JSON.parse(readFileSync(statePath(root), "utf8"));
    assert.ok(state.continuity, "state must contain continuity object");
    assert.equal(state.continuity.schema, "pipeline.continuity.v0");
    assert.equal(state.continuity.revision, 0);
    assert.equal(state.continuity.featureId, featureId);
    assert.equal(state.continuity.authority.prd.path, planPath);
    assert.equal(state.continuity.authority.spec.path, specPath);
    assert.equal(state.continuity.queueHead.nextAction, "review");

    // Step 2: submit-plan directly without continuity-init
    const exitSubmit = run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps);
    assert.equal(exitSubmit, 0, "submit-plan must succeed without requiring continuity-init");

    const afterSubmit = JSON.parse(readFileSync(statePath(root), "utf8"));
    assert.ok(afterSubmit.planSubmission, "planSubmission must be recorded");
    assert.equal(afterSubmit.planSubmission.featureId, featureId);
    assert.equal(afterSubmit.continuity.revision, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("authority documents are editable during design phase, and frozen during implementation", () => {
  const root = tempProjectDir();
  try {
    const prdRel = "specs/feat/prd.md";
    const specRel = "specs/feat/spec.md";
    const prdAbs = join(root, prdRel);
    const specAbs = join(root, specRel);

    mkdirSync(join(root, ".claude"), { recursive: true });
    mkdirSync(join(root, "specs", "feat"), { recursive: true });
    writeFileSync(prdAbs, "# PRD\n", "utf8");
    writeFileSync(specAbs, "# Spec\n", "utf8");
    writeFileSync(join(root, "pipeline.user.yaml"), "marker\n");

    const state = {
      schema: "pipeline.state.v0",
      activeFeature: { id: "feat", planPath: prdRel, phase: "design" },
      planApproved: false,
      continuity: {
        schema: "pipeline.continuity.v0",
        featureId: "feat",
        revision: 0,
        authority: {
          prd: { path: prdRel, sha256: sha256Hex("# PRD\n") },
          spec: { path: specRel, sha256: sha256Hex("# Spec\n") },
        },
      },
    };
    writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify(state));

    const readyStub = () => ({
      schema: "pipeline.project-onboarding-ready-gate.v1",
      status: "ready",
      intent: "session",
    });

    // 1. In design phase before approval, edit is permitted
    const editPrd = {
      tool_name: "Edit",
      tool_input: { file_path: prdAbs, old_string: "# PRD\n", new_string: "# PRD Updated\n" },
    };
    const designResult = evaluateLifecycleReadyGuard(editPrd, {
      projectDir: root,
      requireProjectOnboardingReadyFn: readyStub,
    });
    assert.equal(designResult.exitCode, 0, "design phase before approval must allow editing PRD");

    // 2. Advance to implementation phase
    state.activeFeature.phase = "implementation";
    state.planApproved = true;
    writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify(state));

    const implResult = evaluateLifecycleReadyGuard(editPrd, {
      projectDir: root,
      requireProjectOnboardingReadyFn: readyStub,
    });
    assert.equal(implResult.exitCode, 2, "implementation phase must freeze PRD");
    assert.match(implResult.stderr, /GUARD-LIFECYCLE-AUTHORITY-BOUND/);

    // 3. Reopen design (simulating planInvalidation)
    state.activeFeature.phase = "design";
    state.planApproved = false;
    state.planInvalidation = {
      schema: "pipeline.plan-invalidation.v1",
      invalidatedAt: "2026-08-28T10:00:00.000Z",
      invalidatedBy: "PO",
    };
    writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify(state));

    const reopenedResult = evaluateLifecycleReadyGuard(editPrd, {
      projectDir: root,
      requireProjectOnboardingReadyFn: readyStub,
    });
    assert.equal(reopenedResult.exitCode, 0, "reopened design must unlock editing again");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
