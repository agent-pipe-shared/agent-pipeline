// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { inspectArchitectureEntryReadiness } from "./architecture-entry-readiness.mjs";
import { materializeArchitectureDesignFixture } from "./architecture-design-test-fixture.mjs";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Architecture Fixture",
      GIT_AUTHOR_EMAIL: "architecture-fixture@example.invalid",
      GIT_COMMITTER_NAME: "Architecture Fixture",
      GIT_COMMITTER_EMAIL: "architecture-fixture@example.invalid",
    },
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}

test("real test-only design materialization reaches architecture entry without a readiness stub", () => {
  const root = mkdtempSync(join(tmpdir(), "architecture-design-fixture-"));
  const planPath = "specs/feature/prd_feature.md";
  try {
    mkdirSync(join(root, "project"), { recursive: true });
    mkdirSync(join(root, "specs", "feature"), { recursive: true });
    writeFileSync(join(root, "pipeline.user.yaml"), "gates:\n  human_approval: chat\n  push_approval: chat\n", "utf8");
    writeFileSync(join(root, "project", "pipeline.json"), "{\"schema\":\"pipeline.project.v1\",\"verify\":null}\n", "utf8");
    writeFileSync(join(root, planPath), "# Feature design\n", "utf8");
    writeFileSync(join(root, "project", "pipeline-state.json"), `${JSON.stringify({ activeFeature: { id: "feature", planPath, phase: "design" } })}\n`, "utf8");
    git(root, ["init", "-q"]);
    git(root, ["add", "--", "."]);
    git(root, ["commit", "-qm", "fixture seed"]);

    const materialized = materializeArchitectureDesignFixture({ rootDir: root, planPath });
    const readiness = inspectArchitectureEntryReadiness({ rootDir: root });
    assert.equal(materialized.adoption.state, "approved-scoped");
    assert.equal(readiness.status, "ready", JSON.stringify(readiness));
    assert.equal(readiness.artifacts.map.status, "current");
    assert.equal(readiness.artifacts.fitnessModel.status, "current");
    assert.equal(readiness.artifacts.baseline.status, "current");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
