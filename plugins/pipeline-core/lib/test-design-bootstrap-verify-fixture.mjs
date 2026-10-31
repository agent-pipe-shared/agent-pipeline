// SPDX-License-Identifier: SUL-1.0
// Synthetic test-only approval and architecture decision, never live PO proof.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareApprovedItemCourseFixture } from "./test-item-approved-course-fixture.mjs";
import { materializeArchitectureDesignFixture } from "./architecture-design-test-fixture.mjs";
import { inspectArchitectureEntryReadiness } from "./architecture-entry-readiness.mjs";
import { observeCurrentPlanApprovalForCalibration } from "../scripts/pipeline-state.mjs";

export function prepareDesignBootstrapVerifyFixture({ root, verify, now }) {
  prepareApprovedItemCourseFixture({ root, initialPlanSurfacePath: "src/change.mjs" });
  mkdirSync(join(root, "project"), { recursive: true });
  const calibration = { project: "fresh-testless", verify, handover: "docs/state.md" };
  const twins = ["project/pipeline.json", ".claude/pipeline.json"];
  for (const path of twins) writeFileSync(join(root, path), `${JSON.stringify(calibration, null, 2)}\n`);
  // Real isolated fixture Git history, with only inert fixture identity.
  const git = (...args) => {
    const result = spawnSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git("add", "--", ...twins);
  git("commit", "-q", "-m", "seed baseline calibration fixture");
  const legacyState = join(root, ".claude/pipeline-state.json");
  const state = JSON.parse(readFileSync(legacyState, "utf8"));
  // A legacy deferred adoption is answered with ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED since D162; the fixture
  // therefore carries a real approved-scoped design package over the feature's own surface.
  materializeArchitectureDesignFixture({ rootDir: root, planPath: state.activeFeature.planPath, sourcePath: "src/change.mjs",
    decisionRef: "TEST-D124-A3", by: "Synthetic fixture PO" });
  // Keep the original pin's neutral State readbacks on a supported private tier.
  cpSync(join(root, ".claude/pipeline.yaml"), join(root, "project/pipeline.yaml"));
  state.activeFeature.phase = "design";
  writeFileSync(join(root, "project/pipeline-state.json"), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  rmSync(legacyState);
  const architecture = inspectArchitectureEntryReadiness({ rootDir: root, taskScope: state.activeFeature.planPath, now: new Date(now) });
  assert.equal(architecture.status, "ready", architecture.code);
  const approval = observeCurrentPlanApprovalForCalibration({ rootDir: root, phaseEntry: true });
  assert.equal(approval.status, "eligible", JSON.stringify(approval));
  return { root, deps: { dir: root, now: () => now } };
}
