#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyPendingProjectAuthorityRecovery, applyProjectAuthorityMigration,
  LEGACY_MANIFEST, LEGACY_STATE, NEUTRAL_MANIFEST, NEUTRAL_STATE,
  planPendingProjectAuthorityRecovery, planProjectAuthorityMigration, readProjectAuthority,
} from "./project-authority.mjs";

const roots = [];
function root() { const value = mkdtempSync(join(tmpdir(), "project-authority-")); roots.push(value); return value; }
function write(base, path, value) { mkdirSync(join(base, path, ".."), { recursive: true }); writeFileSync(join(base, path), value); }
function legacy(base, { state = true } = {}) { write(base, LEGACY_MANIFEST, "schema: pipeline.manifest.v0\n"); if (state) write(base, LEGACY_STATE, "{\"stage\":\"legacy\"}\n"); }
let passed = 0;
let interruptedRoot;
function ok(name, callback) { callback(); passed += 1; }
try {
  ok("legacy reader and preview are write-free", () => {
    const base = root(); legacy(base); const plan = planProjectAuthorityMigration({ rootDir: base });
    assert.equal(readProjectAuthority({ rootDir: base }).source, "legacy"); assert.equal(plan.status, "ready");
    assert.equal(plan.compatibility, "dual-read-one-write"); assert.equal(existsSync(join(base, NEUTRAL_MANIFEST)), false);
  });
  ok("activation is explicit and preserves legacy", () => {
    const base = root(); legacy(base); const plan = planProjectAuthorityMigration({ rootDir: base });
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base }).status, "activation-required");
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base, activate: true }).status, "applied");
    assert.equal(readProjectAuthority({ rootDir: base }).source, "neutral");
    assert.equal(readFileSync(join(base, LEGACY_MANIFEST), "utf8"), readFileSync(join(base, NEUTRAL_MANIFEST), "utf8"));
    assert.equal(readFileSync(join(base, LEGACY_STATE), "utf8"), readFileSync(join(base, NEUTRAL_STATE), "utf8"));
  });
  ok("neutral authority is a no-op", () => {
    const base = root(); legacy(base); assert.equal(applyProjectAuthorityMigration(planProjectAuthorityMigration({ rootDir: base }), { rootDir: base, activate: true }).status, "applied");
    const plan = planProjectAuthorityMigration({ rootDir: base }); assert.equal(plan.status, "noop"); assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base }).status, "noop");
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
