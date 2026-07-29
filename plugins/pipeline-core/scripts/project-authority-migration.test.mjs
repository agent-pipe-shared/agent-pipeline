#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./project-authority-migration.mjs";
const root = mkdtempSync(join(tmpdir(), "project-authority-cli-"));
try {
  mkdirSync(join(root, ".claude")); writeFileSync(join(root, ".claude/pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  let stdout = ""; let stderr = "";
  assert.equal(main(["plan", "--root", root], { write: (chunk) => { stdout += chunk; }, previewWrite: (chunk) => { stderr += chunk; } }), 0);
  const plan = JSON.parse(stdout);
  assert.equal(stderr, ""); assert.equal(plan.status, "ready"); stdout = "";
  assert.equal(plan.nextAction.requiresConfirmation, true);
  assert.equal(main(["apply", "--root", root, "--plan-sha256", plan.planSha256, "--activate"], { write: (chunk) => { stdout += chunk; }, previewWrite: (chunk) => { stderr += chunk; } }), 0);
  assert.equal(JSON.parse(stdout).status, "applied"); assert.equal(JSON.parse(stderr).status, "pre-write-preview");
  console.log("project-authority-cli: 5 passed, 0 failed");
} finally { rmSync(root, { recursive: true, force: true }); }
