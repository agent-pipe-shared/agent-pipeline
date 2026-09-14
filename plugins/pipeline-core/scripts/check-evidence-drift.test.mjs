// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { mkdtempTestScratch } from "../lib/test-tmpdir.mjs";
import {
  classifyOnboardingContinuity,
  detectClosedEvidenceDrift,
} from "../lib/onboarding-continuity.mjs";
import {
  run,
  checkPoGateAuthority,
} from "./pipeline-state.mjs";
import {
  checkEvidenceDrift,
  main as checkEvidenceDriftMain,
} from "./check-evidence-drift.mjs";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function setupGitRepo(name) {
  const root = mkdtempTestScratch(`check-evidence-drift-${name}-`);
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs", "state.md"), "# State\n\n## Next action\nNone\n");

  const git = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  spawnSync("git", ["config", "user.name", "PO"], { cwd: root, encoding: "utf8", shell: false });
  spawnSync("git", ["config", "user.email", "po@test.invalid"], { cwd: root, encoding: "utf8", shell: false });

  const calibration = {
    project: "drift-test-project",
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

function commitAll(root, message) {
  spawnSync("git", ["add", "-A"], { cwd: root, encoding: "utf8", shell: false });
  const git = spawnSync("git", ["commit", "-q", "-m", message], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  const rev = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", shell: false });
  return rev.stdout.trim();
}

test("2026-08-27 incident replay: post-close amendment emits CLOSED-EVIDENCE-DRIFT diagnostic on active branch, and fails closed on inactive branch", () => {
  const root = setupGitRepo("incident-replay");

  // Setup closed feature files and commit
  const featureDir = "specs/2026-07-27-agent-pipeline-0.4.7-hotfix";
  mkdirSync(join(root, featureDir), { recursive: true });
  const originalResult = "# Result\n\nAll 0.4.7 tests pass.\n";
  const resultPath = `${featureDir}/result.md`;
  writeFileSync(join(root, resultPath), originalResult);
  const originalResultSha = sha256(originalResult);

  const evidenceContent = "# Close Evidence\n\nVerified cleanly.\n";
  const evidencePath = `${featureDir}/close-evidence.md`;
  writeFileSync(join(root, evidencePath), evidenceContent);
  const evidenceSha = sha256(evidenceContent);

  const prdContent = "<!-- po-language: en -->\n# PRD\n";
  const prdPath = `${featureDir}/prd_hotfix.md`;
  writeFileSync(join(root, prdPath), prdContent);

  const closeCommit = commitAll(root, "Close 0.4.7 hotfix");

  // Setup active feature
  const activeFeatureDir = "specs/sprint-alfred-epic";
  mkdirSync(join(root, activeFeatureDir), { recursive: true });
  const activePrdPath = `${activeFeatureDir}/prd_sprint-alfred-epic.md`;
  writeFileSync(join(root, activePrdPath), "<!-- po-language: en -->\n# Alfred PRD\n");

  const closedEntry = {
    id: "agent-pipeline-0.4.7-hotfix",
    planPath: prdPath,
    phaseAtClose: "implementation",
    closedAt: "2026-07-31T12:06:00.000Z",
    closedBy: "PO",
    forCommit: closeCommit,
    continuityClose: {
      schema: "pipeline.continuity-close.v0",
      featureId: "agent-pipeline-0.4.7-hotfix",
      expectedRevision: 1,
      result: {
        path: resultPath,
        sha256: originalResultSha,
      },
      closeEvidence: {
        path: evidencePath,
        sha256: evidenceSha,
      },
    },
  };

  const activeState = {
    schema: "pipeline.state.v0",
    activeFeature: {
      id: "sprint-alfred-epic",
      planPath: activePrdPath,
      phase: "design",
    },
    planApproved: false,
    updatedAt: "2026-08-28T10:00:00.000Z",
    closedFeatures: [closedEntry],
  };

  const stateFile = join(root, ".claude", "pipeline-state.json");
  writeFileSync(stateFile, JSON.stringify(activeState, null, 2) + "\n");

  // Initial check before drift: status is valid, no diagnostics
  const cleanRead = classifyOnboardingContinuity({ rootDir: root });
  assert.equal(cleanRead.status, "valid");
  assert.equal(cleanRead.diagnostics, undefined);

  // Now replay the 2026-08-27 incident: append post-close amendment to result.md
  const amendedResult = originalResult + "\n## 2026-07-31 Amendment\nPost-close notes appended.\n";
  writeFileSync(join(root, resultPath), amendedResult);

  // Active branch: detects drift, emits CLOSED-EVIDENCE-DRIFT, status remains valid
  const activeRead = classifyOnboardingContinuity({ rootDir: root });
  assert.equal(activeRead.status, "valid", "active session readiness must not fail due to historical closed drift");
  assert.ok(Array.isArray(activeRead.diagnostics), "diagnostics must be an array");
  const driftDiag = activeRead.diagnostics.find((d) => d.code === "CLOSED-EVIDENCE-DRIFT");
  assert.ok(driftDiag, "must emit CLOSED-EVIDENCE-DRIFT diagnostic");
  assert.equal(driftDiag.featureId, "agent-pipeline-0.4.7-hotfix");
  assert.equal(driftDiag.artifact, resultPath);
  assert.equal(driftDiag.expectedSha256, originalResultSha);
  assert.equal(driftDiag.observedSha256, sha256(amendedResult));

  // Inactive branch: remove activeFeature (e.g. after discard or close)
  const inactiveState = {
    schema: "pipeline.state.v0",
    planApproved: false,
    updatedAt: "2026-07-31T12:06:00.000Z",
    closedFeatures: [closedEntry],
  };
  writeFileSync(stateFile, JSON.stringify(inactiveState, null, 2) + "\n");

  // Inactive branch must fail closed as damaged
  const inactiveRead = classifyOnboardingContinuity({ rootDir: root });
  assert.equal(inactiveRead.status, "damaged", "inactive branch must fail closed on closed-evidence drift");
  assert.ok(Array.isArray(inactiveRead.diagnostics));
  assert.ok(inactiveRead.diagnostics.some((d) => d.code === "CLOSED-EVIDENCE-DRIFT"));
});

test("closed-evidence-restore restores pinned bytes from history", () => {
  const root = setupGitRepo("restore-test");

  const featureDir = "specs/2026-07-27-agent-pipeline-0.4.7-hotfix";
  mkdirSync(join(root, featureDir), { recursive: true });
  const originalResult = "# Original Result\nAll passed.\n";
  const resultPath = `${featureDir}/result.md`;
  writeFileSync(join(root, resultPath), originalResult);
  const originalSha = sha256(originalResult);

  const evidenceContent = "# Evidence\nOK\n";
  const evidencePath = `${featureDir}/close-evidence.md`;
  writeFileSync(join(root, evidencePath), evidenceContent);
  const evidenceSha = sha256(evidenceContent);

  const prdPath = `${featureDir}/prd_hotfix.md`;
  writeFileSync(join(root, prdPath), "<!-- po-language: en -->\n# PRD\n");

  const closeCommit = commitAll(root, "Close 0.4.7");

  const state = {
    schema: "pipeline.state.v0",
    activeFeature: {
      id: "active-feat",
      planPath: prdPath,
      phase: "design",
    },
    planApproved: false,
    updatedAt: "2026-08-28T10:00:00.000Z",
    closedFeatures: [
      {
        id: "agent-pipeline-0.4.7-hotfix",
        planPath: prdPath,
        phaseAtClose: "implementation",
        closedAt: "2026-07-31T12:06:00.000Z",
        closedBy: "PO",
        forCommit: closeCommit,
        continuityClose: {
          schema: "pipeline.continuity-close.v0",
          featureId: "agent-pipeline-0.4.7-hotfix",
          expectedRevision: 1,
          result: { path: resultPath, sha256: originalSha },
          closeEvidence: { path: evidencePath, sha256: evidenceSha },
        },
      },
    ],
  };
  writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify(state, null, 2) + "\n");

  // Tamper with the result.md
  writeFileSync(join(root, resultPath), "# Tampered Result\nCorrupted.\n");

  // Verify drift exists
  const beforeRestore = detectClosedEvidenceDrift(root, state);
  assert.equal(beforeRestore.length, 1);

  // Run closed-evidence-restore-plan
  let planOutput = "";
  const oldLog = console.log;
  try {
    console.log = (msg) => { planOutput += msg + "\n"; };
    const planExit = run([
      "closed-evidence-restore-plan",
      "--feature-id", "agent-pipeline-0.4.7-hotfix",
      "--root", root,
    ], { dir: root });
    assert.equal(planExit, 0);
  } finally {
    console.log = oldLog;
  }

  const plan = JSON.parse(planOutput);
  assert.equal(plan.schema, "pipeline.closed-evidence-repair.v1");
  assert.equal(plan.action, "restore");
  assert.equal(plan.featureId, "agent-pipeline-0.4.7-hotfix");
  assert.equal(plan.artifactPath, resultPath);
  assert.equal(plan.expectedSha256, originalSha);
  assert.equal(plan.closeCommit, closeCommit);
  assert.ok(plan.planSha256);
  assert.ok(plan.applyAction);

  // Run closed-evidence-restore-apply
  let applyOutput = "";
  try {
    console.log = (msg) => { applyOutput += msg + "\n"; };
    const applyExit = run([
      "closed-evidence-restore-apply",
      "--feature-id", "agent-pipeline-0.4.7-hotfix",
      "--artifact-path", resultPath,
      "--expected-sha256", originalSha,
      "--close-commit", closeCommit,
      "--plan-sha256", plan.planSha256,
      "--activate",
      "--root", root,
    ], { dir: root });
    assert.equal(applyExit, 0);
  } finally {
    console.log = oldLog;
  }

  const applyResult = JSON.parse(applyOutput);
  assert.equal(applyResult.schema, "pipeline.closed-evidence-repair.v1");
  assert.equal(applyResult.status, "applied");
  assert.equal(applyResult.mutated, true);

  // Assert bytes restored on disk
  const restoredBytes = readFileSync(join(root, resultPath), "utf8");
  assert.equal(restoredBytes, originalResult);
  assert.equal(sha256(restoredBytes), originalSha);

  // Verify drift is now gone
  const afterRestore = detectClosedEvidenceDrift(root, state);
  assert.equal(afterRestore.length, 0);
});

test("closed-evidence-repin updates state with audit entry in evidenceRepins[]", () => {
  const root = setupGitRepo("repin-test");

  const featureDir = "specs/2026-07-27-agent-pipeline-0.4.7-hotfix";
  mkdirSync(join(root, featureDir), { recursive: true });
  const originalResult = "# Original Result\n";
  const resultPath = `${featureDir}/result.md`;
  writeFileSync(join(root, resultPath), originalResult);
  const originalSha = sha256(originalResult);

  const evidenceContent = "# Evidence\n";
  const evidencePath = `${featureDir}/close-evidence.md`;
  writeFileSync(join(root, evidencePath), evidenceContent);
  const evidenceSha = sha256(evidenceContent);

  const prdPath = `${featureDir}/prd_hotfix.md`;
  writeFileSync(join(root, prdPath), "<!-- po-language: en -->\n# PRD\n");

  const closeCommit = commitAll(root, "Close 0.4.7");

  const state = {
    schema: "pipeline.state.v0",
    activeFeature: {
      id: "active-feat",
      planPath: prdPath,
      phase: "design",
    },
    planApproved: false,
    updatedAt: "2026-08-28T10:00:00.000Z",
    closedFeatures: [
      {
        id: "agent-pipeline-0.4.7-hotfix",
        planPath: prdPath,
        phaseAtClose: "implementation",
        closedAt: "2026-07-31T12:06:00.000Z",
        closedBy: "PO",
        forCommit: closeCommit,
        continuityClose: {
          schema: "pipeline.continuity-close.v0",
          featureId: "agent-pipeline-0.4.7-hotfix",
          expectedRevision: 1,
          result: { path: resultPath, sha256: originalSha },
          closeEvidence: { path: evidencePath, sha256: evidenceSha },
        },
      },
    ],
  };
  const statePath = join(root, ".claude", "pipeline-state.json");
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

  // Legitimate amendment to result.md
  const amendedResult = "# Legitimate amended Result\nNew review notes.\n";
  writeFileSync(join(root, resultPath), amendedResult);
  const amendedSha = sha256(amendedResult);

  // Run repin-plan
  let planOutput = "";
  const oldLog = console.log;
  try {
    console.log = (msg) => { planOutput += msg + "\n"; };
    const planExit = run([
      "closed-evidence-repin-plan",
      "--feature-id", "agent-pipeline-0.4.7-hotfix",
      "--artifact-path", resultPath,
      "--by", "André",
      "--root", root,
    ], { dir: root });
    assert.equal(planExit, 0);
  } finally {
    console.log = oldLog;
  }

  const plan = JSON.parse(planOutput);
  assert.equal(plan.schema, "pipeline.closed-evidence-repair.v1");
  assert.equal(plan.action, "repin");
  assert.equal(plan.featureId, "agent-pipeline-0.4.7-hotfix");
  assert.equal(plan.artifactPath, resultPath);
  assert.equal(plan.oldSha256, originalSha);
  assert.equal(plan.newSha256, amendedSha);
  assert.equal(plan.by, "André");

  // Run repin-apply
  let applyOutput = "";
  try {
    console.log = (msg) => { applyOutput += msg + "\n"; };
    const applyExit = run([
      "closed-evidence-repin-apply",
      "--feature-id", "agent-pipeline-0.4.7-hotfix",
      "--artifact-path", resultPath,
      "--old-sha256", originalSha,
      "--new-sha256", amendedSha,
      "--by", "André",
      "--plan-sha256", plan.planSha256,
      "--activate",
      "--root", root,
    ], { dir: root });
    assert.equal(applyExit, 0);
  } finally {
    console.log = oldLog;
  }

  const applyResult = JSON.parse(applyOutput);
  assert.equal(applyResult.schema, "pipeline.closed-evidence-repair.v1");
  assert.equal(applyResult.status, "applied");
  assert.equal(applyResult.mutated, true);

  // Inspect state file
  const updatedState = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(updatedState.closedFeatures[0].continuityClose.result.sha256, amendedSha);
  assert.ok(Array.isArray(updatedState.evidenceRepins));
  assert.equal(updatedState.evidenceRepins.length, 1);
  const repinEntry = updatedState.evidenceRepins[0];
  assert.equal(repinEntry.featureId, "agent-pipeline-0.4.7-hotfix");
  assert.equal(repinEntry.artifactPath, resultPath);
  assert.equal(repinEntry.oldSha256, originalSha);
  assert.equal(repinEntry.newSha256, amendedSha);
  assert.equal(repinEntry.by, "André");
  assert.ok(repinEntry.repinnedAt);

  // Now classifyOnboardingContinuity is clean
  const cleanRead = classifyOnboardingContinuity({ rootDir: root });
  assert.equal(cleanRead.status, "valid");
  assert.equal(cleanRead.diagnostics, undefined);
});

test("AUTHORITY-WORKTREE-HEAD-DIVERGENCE emitted when worktree and HEAD diverge", () => {
  const root = setupGitRepo("divergence-test");

  const featureDir = "specs/feat-div";
  mkdirSync(join(root, featureDir), { recursive: true });
  const planPath = `${featureDir}/prd_feat-div.md`;
  const specPath = `${featureDir}/spec.md`;

  const prdContent = "<!-- po-language: en -->\n<!-- technical-spec-sha256: 0000000000000000000000000000000000000000000000000000000000000000 -->\n<!-- po-plan-acknowledged: content-sound-and-spec-consistent -->\n# PRD\n";
  const specContent = "# Spec\n";
  writeFileSync(join(root, planPath), prdContent);
  writeFileSync(join(root, specPath), specContent);

  const state = {
    schema: "pipeline.state.v0",
    activeFeature: {
      id: "feat-div",
      planPath,
      phase: "design",
    },
    planApproved: false,
    updatedAt: "2026-08-28T10:00:00.000Z",
  };
  writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify(state, null, 2) + "\n");

  commitAll(root, "Commit authority in HEAD");

  // 1. Initial check: HEAD and worktree match -> no divergence
  const check1 = checkPoGateAuthority({ repoRoot: root });
  const div1 = check1.divergences.filter((d) => d.code === "AUTHORITY-WORKTREE-HEAD-DIVERGENCE");
  assert.equal(div1.length, 0);
  assert.equal(check1.prdCardinality.worktree.ok, true);
  assert.equal(check1.prdCardinality.head.ok, true);

  // 2. Modify PRD in worktree without committing
  writeFileSync(join(root, planPath), prdContent + "\n<!-- worktree amendment -->\n");
  const check2 = checkPoGateAuthority({ repoRoot: root });
  const div2 = check2.divergences.filter((d) => d.code === "AUTHORITY-WORKTREE-HEAD-DIVERGENCE");
  assert.ok(div2.length >= 1);
  const planDiv = div2.find((d) => d.path === planPath);
  assert.ok(planDiv);
  assert.equal(planDiv.divergence, "differs");

  // 3. Rename PRD in worktree (staging addition and deletion without committing removal to HEAD, incident replay)
  // Delete old PRD from disk, add new PRD
  const newPlanPath = `${featureDir}/prd_feat-div-v2.md`;
  writeFileSync(join(root, newPlanPath), prdContent);
  spawnSync("rm", [join(root, planPath)]);

  const check3 = checkPoGateAuthority({ repoRoot: root });
  const div3 = check3.divergences.filter((d) => d.code === "AUTHORITY-WORKTREE-HEAD-DIVERGENCE");
  assert.ok(div3.length >= 1);
  // prdCardinality per view
  assert.equal(check3.prdCardinality.worktree.count, 1);
  assert.equal(check3.prdCardinality.head.count, 1); // old PRD is in HEAD
  // Worktree has newPlanPath (missing in head), HEAD has planPath (missing in worktree)
  const missingInHead = div3.find((d) => d.divergence === "missing-in-head");
  const missingInWorktree = div3.find((d) => d.divergence === "missing-in-worktree");
  assert.ok(missingInHead, "new PRD must be reported as missing in HEAD");
  assert.ok(missingInWorktree, "old PRD must be reported as missing in worktree");
});

test("check-evidence-drift CLI inspects and reports drift across closedFeatures", () => {
  const root = setupGitRepo("cli-test");

  const featureDir = "specs/2026-07-27-agent-pipeline-0.4.7-hotfix";
  mkdirSync(join(root, featureDir), { recursive: true });
  const resultPath = `${featureDir}/result.md`;
  writeFileSync(join(root, resultPath), "# Clean\n");
  const resultSha = sha256("# Clean\n");
  const evidencePath = `${featureDir}/close-evidence.md`;
  writeFileSync(join(root, evidencePath), "# Evidence\n");
  const evidenceSha = sha256("# Evidence\n");
  const prdPath = `${featureDir}/prd.md`;
  writeFileSync(join(root, prdPath), "# PRD\n");
  const commit = commitAll(root, "Clean commit");

  const state = {
    schema: "pipeline.state.v0",
    planApproved: false,
    updatedAt: "2026-07-31T12:06:00.000Z",
    closedFeatures: [
      {
        id: "feat-1",
        planPath: prdPath,
        phaseAtClose: "implementation",
        closedAt: "2026-07-31T12:06:00.000Z",
        closedBy: "PO",
        forCommit: commit,
        continuityClose: {
          schema: "pipeline.continuity-close.v0",
          featureId: "feat-1",
          expectedRevision: 1,
          result: { path: resultPath, sha256: resultSha },
          closeEvidence: { path: evidencePath, sha256: evidenceSha },
        },
      },
    ],
  };
  writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify(state, null, 2) + "\n");

  // Clean check via library function
  const cleanResult = checkEvidenceDrift({ rootDir: root });
  assert.equal(cleanResult.ok, true);
  assert.equal(cleanResult.driftCount, 0);

  // Clean check via CLI main
  assert.equal(checkEvidenceDriftMain(["--root", root, "--format", "json"]), 0);
  assert.equal(checkEvidenceDriftMain(["--root", root, "--format", "text"]), 0);

  // Tamper with result
  writeFileSync(join(root, resultPath), "# Drifted\n");

  const driftResult = checkEvidenceDrift({ rootDir: root });
  assert.equal(driftResult.ok, false);
  assert.equal(driftResult.driftCount, 1);
  assert.equal(driftResult.drifts[0].code, "CLOSED-EVIDENCE-DRIFT");

  // Drifted check via CLI main
  assert.equal(checkEvidenceDriftMain(["--root", root, "--format", "json"]), 1);
  assert.equal(checkEvidenceDriftMain(["--root", root, "--format", "text"]), 1);
});
