#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./project-authority-migration.mjs";
const root = mkdtempSync(join(tmpdir(), "project-authority-cli-"));
try {
  mkdirSync(join(root, ".claude")); writeFileSync(join(root, ".claude/pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  let stdout = ""; let stderr = "";
  assert.equal(main(["plan", "--root", root], { write: (chunk) => { stdout += chunk; }, previewWrite: (chunk) => { stderr += chunk; } }), 0);
  assert.equal(stderr, ""); assert.equal(JSON.parse(stdout).status, "ready"); stdout = "";
  assert.equal(main(["apply", "--root", root, "--activate"], { write: (chunk) => { stdout += chunk; }, previewWrite: (chunk) => { stderr += chunk; } }), 0);
  assert.equal(JSON.parse(stdout).status, "applied"); assert.equal(JSON.parse(stderr).status, "pre-write-preview");
  writeFileSync(join(root, "project/pipeline-state.json"), `${JSON.stringify({ continuity: { authority: { result: { path: "specs/sprint-phoenix-epic/Result.md", sha256: "a".repeat(64) } } } })}\n`);
  stdout = ""; stderr = "";
  assert.equal(main(["reconcile-state", "--root", root, "--activate"], { write: (chunk) => { stdout += chunk; }, previewWrite: (chunk) => { stderr += chunk; } }), 0);
  assert.equal(JSON.parse(stdout).status, "applied"); assert.equal(JSON.parse(stderr).operation, "state-reconciliation");
  assert.equal(JSON.parse(readFileSync(join(root, "project/pipeline-state.json"), "utf8")).continuity.authority.result.path, "specs/sprint-phoenix-epic/result.md");
  console.log("project-authority-cli: 7 passed, 0 failed");
} finally { rmSync(root, { recursive: true, force: true }); }
