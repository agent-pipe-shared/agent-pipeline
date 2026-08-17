#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  // A marketplace-installed project: mixed authority, no vendored plugin copy,
  // and therefore no provable package provenance until it syncs one.
  const io = { write: (chunk) => { stdout += chunk; }, previewWrite: (chunk) => { stderr += chunk; } };
  const marketplace = (base, { ignore = true } = {}) => {
    assert.equal(spawnSync("git", ["init", "-q"], { cwd: base, shell: false }).status, 0);
    mkdirSync(join(base, ".claude"));
    mkdirSync(join(base, "project"));
    if (ignore) writeFileSync(join(base, ".gitignore"), "/plugins/pipeline-core/\n");
    writeFileSync(join(base, ".claude/pipeline.yaml"), "schema: pipeline.manifest.v0\n");
    writeFileSync(join(base, ".claude/pipeline-state.json"), "{\"schema\":\"pipeline.state.v0\"}\n");
    writeFileSync(join(base, ".claude/pipeline.json"), "{\"project\":\"fixture\"}\n");
    writeFileSync(join(base, "project/pipeline.yaml"), "schema: pipeline.manifest.v0\nprovisional: kickoff\n");
    return base;
  };
  const vendor = mkdtempSync(join(tmpdir(), "project-authority-cli-vendor-"));
  try {
    marketplace(vendor);
    stdout = ""; stderr = "";
    assert.equal(main(["plan", "--root", vendor], io), 1);
    const redirect = JSON.parse(stdout);
    assert.equal(redirect.status, "vendor-sync-required");
    assert.equal(redirect.code, "PA-VENDOR-COPY-MISSING");
    assert.equal(redirect.nextAction.argv[1], "vendor-sync");
    assert.equal(redirect.nextAction.mutation, false);
    stdout = "";
    assert.equal(main(["apply", "--root", vendor, "--plan-sha256", "0".repeat(64), "--activate"], io), 1);
    assert.equal(JSON.parse(stdout).status, "vendor-sync-required");
    stdout = "";
    assert.equal(main(["vendor-sync", "--root", vendor], io), 0);
    const sync = JSON.parse(stdout);
    assert.equal(sync.status, "ready");
    assert.equal(stderr, "");
    assert.equal(sync.nextAction.argv[1], "vendor-sync");
    assert.equal(sync.nextAction.expected.schema, "pipeline.project-authority-vendor-sync.v1");
    stdout = "";
    assert.equal(main(["vendor-sync", "--root", vendor, "--plan-sha256", "1".repeat(64), "--activate"], io), 1);
    assert.equal(JSON.parse(stdout).status, "invalid-plan");
    stdout = "";
    assert.equal(main(["vendor-sync", "--root", vendor, "--plan-sha256", sync.planSha256, "--activate"], io), 0);
    assert.equal(JSON.parse(stdout).status, "applied");
    assert.equal(JSON.parse(stderr).operation, "vendored-package-sync");
    stdout = "";
    assert.equal(main(["plan", "--root", vendor], io), 0);
    const adoption = JSON.parse(stdout);
    assert.equal(adoption.status, "ready");
    assert.equal(adoption.operation, "adopt-existing-neutral");
    // The redirect is specific to a repairable copy: a neutral project never
    // needed provenance, and a BROKEN copy is not a missing one.
    stdout = "";
    assert.equal(main(["plan", "--root", root], io), 0);
    assert.equal(JSON.parse(stdout).status, "noop");
  } finally { rmSync(vendor, { recursive: true, force: true }); }
  const broken = mkdtempSync(join(tmpdir(), "project-authority-cli-broken-"));
  try {
    marketplace(broken);
    mkdirSync(join(broken, "plugins/pipeline-core"), { recursive: true });
    symlinkSync(join(broken, ".claude/pipeline.json"), join(broken, "plugins/pipeline-core/escape.json"));
    stdout = "";
    assert.equal(main(["plan", "--root", broken], io), 1);
    const refused = JSON.parse(stdout);
    assert.equal(refused.status, "provenance-rejected");
    assert.equal(refused.code, "PA-PROVENANCE-REQUIRED");
    assert.equal(refused.nextAction, undefined);
  } finally { rmSync(broken, { recursive: true, force: true }); }
  console.log("project-authority-cli: 21 passed, 0 failed");
} finally { rmSync(root, { recursive: true, force: true }); }
