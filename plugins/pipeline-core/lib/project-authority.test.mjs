#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  applyPendingProjectAuthorityRecovery, applyProjectAuthorityMigration,
  LEGACY_CALIBRATION, LEGACY_GUARD_AUDIT, LEGACY_GUARD_CONFIG, LEGACY_MANIFEST, LEGACY_STATE,
  NEUTRAL_CALIBRATION, NEUTRAL_GUARD_AUDIT, NEUTRAL_GUARD_CONFIG, NEUTRAL_MANIFEST, NEUTRAL_STATE,
  planPendingProjectAuthorityRecovery, planProjectAuthorityMigration, readProjectAuthority,
} from "./project-authority.mjs";

const roots = [];
function root() { const value = mkdtempSync(join(tmpdir(), "project-authority-")); roots.push(value); return value; }
function write(base, path, value) { mkdirSync(join(base, path, ".."), { recursive: true }); writeFileSync(join(base, path), value); }
function legacy(base, { state = true } = {}) {
  write(base, LEGACY_MANIFEST, "schema: pipeline.manifest.v0\n");
  if (state) write(base, LEGACY_STATE, "{\"stage\":\"legacy\"}\n");
  write(base, LEGACY_CALIBRATION, "{\"project\":\"fixture\"}\n");
  write(base, LEGACY_GUARD_CONFIG, "{\"protectedTestPaths\":[]}\n");
  write(base, LEGACY_GUARD_AUDIT, "{\"event\":\"legacy\"}\n");
}
function git(base, args) {
  const result = spawnSync("git", args, { cwd: base, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}
let passed = 0;
let interruptedRoot;
function ok(name, callback) { callback(); passed += 1; }
try {
  ok("legacy reader and preview are write-free", () => {
    const base = root(); legacy(base); const plan = planProjectAuthorityMigration({ rootDir: base });
    assert.equal(readProjectAuthority({ rootDir: base }).source, "legacy"); assert.equal(plan.status, "ready");
    assert.equal(plan.compatibility, "dual-read-one-write"); assert.equal(existsSync(join(base, NEUTRAL_MANIFEST)), false);
  });
  ok("machine-local cleanup binding blocks planning and apply until sanctioned release", () => {
    const base = root(); legacy(base);
    const sanitizedState = `${JSON.stringify({
      schema: "pipeline.state.v0",
      continuity: { runtime: { sessionCleanup: null } },
    })}\n`;
    const boundState = `${JSON.stringify({
      schema: "pipeline.state.v0",
      continuity: { runtime: { sessionCleanup: {
        sessionId: "private-session-id",
        descriptorSha256: "a".repeat(64),
      } } },
    })}\n`;
    const expectedBlock = {
      status: "session-cleanup-required",
      code: "PA-MIGRATION-SESSION-CLEANUP-BOUND",
      diagnostics: ["legacy State retains a machine-local session cleanup binding"],
      recovery: {
        operation: "sanctioned-session-cleanup-release",
        replan: "project-authority-migration",
      },
      targets: [],
    };

    write(base, LEGACY_STATE, boundState);
    const blockedPlan = planProjectAuthorityMigration({ rootDir: base });
    assert.deepEqual({
      status: blockedPlan.status,
      code: blockedPlan.code,
      diagnostics: blockedPlan.diagnostics,
      recovery: blockedPlan.recovery,
      targets: blockedPlan.targets,
    }, expectedBlock);
    assert.equal(JSON.stringify(blockedPlan).includes("private-session-id"), false);
    assert.equal(JSON.stringify(blockedPlan).includes("descriptorSha256"), false);
    assert.equal(existsSync(join(base, NEUTRAL_MANIFEST)), false);
    assert.equal(existsSync(join(base, ".pipeline-project-authority-migration")), false);

    write(base, LEGACY_STATE, sanitizedState);
    const sanitizedPlan = planProjectAuthorityMigration({ rootDir: base });
    assert.equal(sanitizedPlan.status, "ready");
    write(base, LEGACY_STATE, boundState);
    const blockedApply = applyProjectAuthorityMigration(sanitizedPlan, { rootDir: base, activate: true });
    assert.deepEqual({
      status: blockedApply.status,
      code: blockedApply.code,
      diagnostics: blockedApply.diagnostics,
      recovery: blockedApply.recovery,
      targets: blockedApply.targets,
    }, expectedBlock);
    assert.equal(readFileSync(join(base, LEGACY_STATE), "utf8"), boundState);
    assert.equal(existsSync(join(base, NEUTRAL_STATE)), false);
    assert.equal(existsSync(join(base, ".pipeline-project-authority-migration")), false);

    write(base, LEGACY_STATE, sanitizedState);
    assert.equal(applyProjectAuthorityMigration(sanitizedPlan, { rootDir: base, activate: true }).status, "applied");
    assert.equal(readFileSync(join(base, NEUTRAL_STATE), "utf8"), sanitizedState);
  });
  ok("activation is explicit and preserves legacy", () => {
    const base = root(); legacy(base); const plan = planProjectAuthorityMigration({ rootDir: base });
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base }).status, "activation-required");
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base, activate: true }).status, "applied");
    assert.equal(readProjectAuthority({ rootDir: base }).source, "neutral");
    assert.equal(readFileSync(join(base, LEGACY_MANIFEST), "utf8"), readFileSync(join(base, NEUTRAL_MANIFEST), "utf8"));
    assert.equal(readFileSync(join(base, LEGACY_STATE), "utf8"), readFileSync(join(base, NEUTRAL_STATE), "utf8"));
    assert.equal(readFileSync(join(base, LEGACY_CALIBRATION), "utf8"), readFileSync(join(base, NEUTRAL_CALIBRATION), "utf8"));
    assert.equal(readFileSync(join(base, LEGACY_GUARD_CONFIG), "utf8"), readFileSync(join(base, NEUTRAL_GUARD_CONFIG), "utf8"));
    assert.equal(readFileSync(join(base, LEGACY_GUARD_AUDIT), "utf8"), readFileSync(join(base, NEUTRAL_GUARD_AUDIT), "utf8"));
  });
  ok("neutral authority is a no-op", () => {
    const base = root(); legacy(base); assert.equal(applyProjectAuthorityMigration(planProjectAuthorityMigration({ rootDir: base }), { rootDir: base, activate: true }).status, "applied");
    const plan = planProjectAuthorityMigration({ rootDir: base }); assert.equal(plan.status, "noop"); assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base }).status, "noop");
  });
  ok("a remote checkout mixed layer has an explicit, preserving legacy adoption path", () => {
    const base = root();
    git(base, ["init", "-q"]);
    legacy(base);
    const provisional = "schema: pipeline.manifest.v0\nprovisional: kickoff\n";
    write(base, NEUTRAL_MANIFEST, provisional);
    const plan = planProjectAuthorityMigration({ rootDir: base });
    assert.equal(readProjectAuthority({ rootDir: base }).status, "mixed");
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "adopt-legacy-after-remote-checkout");
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base }).status, "activation-required");
    const applied = applyProjectAuthorityMigration(plan, { rootDir: base, activate: true });
    assert.equal(applied.status, "applied");
    assert.equal(applied.adoptionArchive.entryCount, 1);
    assert.equal(readProjectAuthority({ rootDir: base }).source, "neutral");
    assert.equal(readFileSync(join(base, NEUTRAL_MANIFEST), "utf8"), readFileSync(join(base, LEGACY_MANIFEST), "utf8"));
    const common = git(base, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    const archives = readdirSync(join(common, "agent-pipeline", "project-authority-adoption"));
    assert.equal(archives.length, 1);
    assert.equal(readFileSync(join(common, "agent-pipeline", "project-authority-adoption", archives[0], "preimage-0"), "utf8"), provisional);
  });
  ok("source and destination drift reject before writes", () => {
    const base = root(); legacy(base); let plan = planProjectAuthorityMigration({ rootDir: base }); write(base, LEGACY_MANIFEST, "changed\n");
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base, activate: true }).status, "rejected");
    assert.equal(existsSync(join(base, NEUTRAL_MANIFEST)), false);
    const second = root(); legacy(second); plan = planProjectAuthorityMigration({ rootDir: second }); write(second, NEUTRAL_MANIFEST, "external\n");
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: second, activate: true }).status, "rejected");
    assert.equal(readFileSync(join(second, NEUTRAL_MANIFEST), "utf8"), "external\n");
  });
  ok("ordinary write failure rolls back preimages", () => {
    const base = root(); legacy(base); const plan = planProjectAuthorityMigration({ rootDir: base });
    const result = applyProjectAuthorityMigration(plan, { rootDir: base, activate: true, interruptAfterRename: ({ index }) => { if (index === 0) throw new Error("forced write failure"); } });
    assert.equal(result.status, "rolled-back"); assert.equal(readProjectAuthority({ rootDir: base }).source, "legacy");
    assert.equal(existsSync(join(base, NEUTRAL_MANIFEST)), false);
  });
  ok("interruption requires previewed recovery and restores legacy view", () => {
    const base = root(); legacy(base); const plan = planProjectAuthorityMigration({ rootDir: base });
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base, activate: true, interruptAfterRename: () => true }).status, "interrupted"); interruptedRoot = base;
    const recovery = planPendingProjectAuthorityRecovery({ rootDir: interruptedRoot });
    assert.equal(recovery.status, "ready"); assert.equal(applyPendingProjectAuthorityRecovery(recovery, { rootDir: base }).status, "activation-required");
    assert.equal(applyPendingProjectAuthorityRecovery(recovery, { rootDir: interruptedRoot, activate: true }).status, "recovered");
    assert.equal(readProjectAuthority({ rootDir: interruptedRoot }).source, "legacy"); assert.equal(existsSync(join(interruptedRoot, NEUTRAL_MANIFEST)), false);
  });
  ok("recovery refuses journal drift", () => {
    const base = root(); legacy(base); const plan = planProjectAuthorityMigration({ rootDir: base });
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base, activate: true, interruptAfterRename: () => true }).status, "interrupted");
    const recovery = planPendingProjectAuthorityRecovery({ rootDir: base }); write(base, ".pipeline-project-authority-migration/journal.json", "{}\n");
    assert.equal(applyPendingProjectAuthorityRecovery(recovery, { rootDir: base, activate: true }).status, "rejected");
  });
  console.log(`project-authority: ${passed} passed, 0 failed`);
} finally { for (const entry of roots) rmSync(entry, { recursive: true, force: true }); }
