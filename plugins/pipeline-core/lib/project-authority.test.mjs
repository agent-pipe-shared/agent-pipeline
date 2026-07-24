#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyProjectAuthorityMigration, planProjectAuthorityMigration, readProjectAuthority } from "./project-authority.mjs";
const root = mkdtempSync(join(tmpdir(), "project-authority-"));
try {
  mkdirSync(join(root, ".claude")); writeFileSync(join(root, ".claude/pipeline.yaml"), "schema: pipeline.manifest.v0\n"); writeFileSync(join(root, ".claude/pipeline-state.json"), "{}\n");
  assert.equal(readProjectAuthority({ rootDir: root }).source, "legacy");
  const plan = planProjectAuthorityMigration({ rootDir: root }); assert.equal(plan.status, "ready");
  assert.equal(applyProjectAuthorityMigration(plan, { rootDir: root }).status, "rejected");
  assert.equal(applyProjectAuthorityMigration(plan, { rootDir: root, activate: true }).status, "applied");
  assert.equal(readProjectAuthority({ rootDir: root }).source, "neutral"); console.log("project-authority: 5 passed, 0 failed");
} finally { rmSync(root, { recursive: true, force: true }); }
