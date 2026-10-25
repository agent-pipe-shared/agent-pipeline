// SPDX-License-Identifier: SUL-1.0
// Synthetic test-only approval and architecture decision, never live PO proof.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareApprovedItemCourseFixture } from "./test-item-approved-course-fixture.mjs";
import { prepareAdoptionAuthority } from "./architecture-adoption-authority.mjs";
import { inspectArchitectureEntryReadiness } from "./architecture-entry-readiness.mjs";
import { applyAdoptionDecision } from "../scripts/architecture-adoption.mjs";
import { observeCurrentPlanApprovalForCalibration } from "../scripts/pipeline-state.mjs";

const SOURCE_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

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
  cpSync(join(SOURCE_ROOT, "architecture"), join(root, "architecture"), { recursive: true });
  cpSync(join(SOURCE_ROOT, "AGENTS.md"), join(root, "AGENTS.md"));
  const adoption = { rootDir: root, decision: "deferred", scope: ["specs/", "architecture/map/"],
    rationale: "Contained synthetic fixture architecture deferral", decidedAt: now,
    reviewDate: "2099-01-01", decisionRef: "TEST-D124-A3" };
  const approvalRequest = prepareAdoptionAuthority(adoption);
  applyAdoptionDecision({ ...adoption, approvalRequest, chatApproval: {
    mode: "chat-attributed-unattested", by: "Synthetic fixture PO", decisionRef: "TEST-D124-A3",
    intentSha256: approvalRequest.intent.sha256,
  } });
  // Keep the original pin's neutral State readbacks on a supported private tier.
  cpSync(join(root, ".claude/pipeline.yaml"), join(root, "project/pipeline.yaml"));
  const legacyState = join(root, ".claude/pipeline-state.json");
  const state = JSON.parse(readFileSync(legacyState, "utf8"));
  state.activeFeature.phase = "design";
  writeFileSync(join(root, "project/pipeline-state.json"), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  rmSync(legacyState);
  const architecture = inspectArchitectureEntryReadiness({ rootDir: root, taskScope: state.activeFeature.planPath, now: new Date(now) });
  assert.equal(architecture.status, "ready", architecture.code);
  const approval = observeCurrentPlanApprovalForCalibration({ rootDir: root, phaseEntry: true });
  assert.equal(approval.status, "eligible", JSON.stringify(approval));
  return { root, deps: { dir: root, now: () => now } };
}
