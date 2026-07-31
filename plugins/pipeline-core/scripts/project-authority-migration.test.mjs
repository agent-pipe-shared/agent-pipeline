#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { main } from "./project-authority-migration.mjs";
import { cleanupSession, retireSessionDescriptor, startSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
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
  const upgrade = mkdtempSync(join(tmpdir(), "project-authority-cli-upgrade-"));
  try {
    const initialized = spawnSync("git", ["init", "-q"], { cwd: upgrade, encoding: "utf8", shell: false });
    assert.equal(initialized.status, 0, initialized.stderr);
    const descriptor = startSessionDescriptor(upgrade, { sessionId: "session-cli-closed" });
    assert.equal(cleanupSession(upgrade, { sessionId: descriptor.sessionId, ownerNonce: descriptor.ownerNonce }, { allowAbsent: true }).ok, true);
    retireSessionDescriptor(upgrade, {
      sessionId: descriptor.sessionId, ownerNonce: descriptor.ownerNonce, descriptorSha256: descriptor.descriptorSha256,
    });
    mkdirSync(join(upgrade, "project"));
    writeFileSync(join(upgrade, "project/pipeline.yaml"), "schema: pipeline.manifest.v0\n");
    writeFileSync(join(upgrade, "project/pipeline-state.json"), `${JSON.stringify({
      schema: "pipeline.state.v0", activeFeature: { id: "upgrade" },
      continuity: { runtime: { sessionCleanup: { sessionId: descriptor.sessionId, descriptorSha256: descriptor.descriptorSha256 } } },
    })}\n`);
    stdout = ""; stderr = "";
    assert.equal(main(["recover", "--root", upgrade], { write: (chunk) => { stdout += chunk; }, previewWrite: (chunk) => { stderr += chunk; } }), 0);
    const recovery = JSON.parse(stdout);
    assert.equal(recovery.status, "ready");
    assert.equal(recovery.operation, "sanitize-completed-session-cleanup");
    assert.equal(recovery.nextAction.argv[1], "recover");
    assert.equal(recovery.nextAction.requiresConfirmation, true);
    assert.equal(JSON.stringify(recovery).includes(descriptor.sessionId), false);
    stdout = ""; stderr = "";
    assert.equal(main(["recover", "--root", upgrade, "--plan-sha256", recovery.planSha256, "--activate"], { write: (chunk) => { stdout += chunk; }, previewWrite: (chunk) => { stderr += chunk; } }), 0);
    assert.equal(JSON.parse(stdout).status, "recovered");
    assert.equal(JSON.parse(stderr).operation, "recovery");
    assert.equal(JSON.parse(readFileSync(join(upgrade, "project/pipeline-state.json"), "utf8")).continuity.runtime.sessionCleanup, null);
  } finally { rmSync(upgrade, { recursive: true, force: true }); }
  console.log("project-authority-cli: 13 passed, 0 failed");
} finally { rmSync(root, { recursive: true, force: true }); }
