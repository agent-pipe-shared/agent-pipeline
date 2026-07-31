#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  applyPendingProjectAuthorityRecovery, applyProjectAuthorityMigration,
  classifyProjectAuthority,
  LEGACY_CALIBRATION, LEGACY_GUARD_AUDIT, LEGACY_GUARD_CONFIG, LEGACY_MANIFEST, LEGACY_STATE,
  NEUTRAL_CALIBRATION, NEUTRAL_GUARD_AUDIT, NEUTRAL_GUARD_CONFIG, NEUTRAL_MANIFEST, NEUTRAL_STATE,
  inspectProjectAuthorityProvenance, planPendingProjectAuthorityRecovery, planProjectAuthorityMigration, readProjectAuthority,
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
  ok("classification is versioned and provenance drift fails closed", () => {
    const base = root(); legacy(base);
    const classification = classifyProjectAuthority({ rootDir: base });
    assert.equal(classification.schema, "pipeline.project-authority-classification.v1");
    assert.equal(classification.files.find((entry) => entry.path === NEUTRAL_MANIFEST).classification, "generated");
    const plan = planProjectAuthorityMigration({ rootDir: base, provenance: { contractVersion: "project-authority.v0" } });
    assert.equal(plan.status, "provenance-rejected");
    assert.equal(plan.code, "PA-PROVENANCE-MISMATCH");
  });
  ok("adoption provenance rejects malformed downstream receipts before mutation", () => {
    const base = root(); legacy(base); write(base, NEUTRAL_MANIFEST, "provisional\n");
    const plan = planProjectAuthorityMigration({ rootDir: base, provenance: {
      operation: "adopt-existing-neutral", compatibility: "byte-identical-self-application",
      receipt: { schema: "pipeline.project-authority-adoption-receipt.v1", version: "project-authority.v1", operation: "adopt-existing-neutral", receiptSha256: "0".repeat(64) },
    } });
    assert.equal(plan.status, "provenance-rejected");
    assert.equal(existsSync(join(base, NEUTRAL_MANIFEST)), true);
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
    assert.equal(plan.status, "provenance-rejected");
    assert.equal(plan.code, "PA-PROVENANCE-REQUIRED");
    assert.equal(readFileSync(join(base, NEUTRAL_MANIFEST), "utf8"), provisional);
  });
  ok("byte-identical self-application adopts with persisted receipt and replays as noop", () => {
    const base = root(); git(base, ["init", "-q"]); legacy(base);
    write(base, NEUTRAL_MANIFEST, "schema: pipeline.manifest.v0\nprovisional: kickoff\n");
    cpSync(join(process.cwd(), "plugins/pipeline-core"), join(base, "plugins/pipeline-core"), { recursive: true });
    git(base, ["add", "."]); git(base, ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "-qm", "fixture"]);
    const refsBefore = { commit: git(base, ["rev-parse", "HEAD"]), tree: git(base, ["rev-parse", "HEAD^{tree}"]), branch: git(base, ["branch", "--show-current"]) };
    const provenance = inspectProjectAuthorityProvenance({ rootDir: base });
    assert.equal(provenance.status, "ready");
    const plan = planProjectAuthorityMigration({ rootDir: base, provenance });
    assert.equal(plan.status, "ready"); assert.equal(plan.operation, "adopt-existing-neutral");
    const applied = applyProjectAuthorityMigration(plan, { rootDir: base, activate: true });
    assert.equal(applied.status, "applied"); assert.equal(applied.adoptionReceipt.schema, "pipeline.project-authority-adoption-receipt.v1");
    assert.equal(existsSync(join(base, ".git/agent-pipeline/project-authority-adoption")), true);
    assert.deepEqual({ commit: git(base, ["rev-parse", "HEAD"]), tree: git(base, ["rev-parse", "HEAD^{tree}"]), branch: git(base, ["branch", "--show-current"]) }, refsBefore);
    const replay = planProjectAuthorityMigration({ rootDir: base, provenance: inspectProjectAuthorityProvenance({ rootDir: base }) });
    assert.equal(replay.status, "noop");
  });
  ok("schema-valid downstream receipt-bound adoption plans and applies", () => {
    const base = root(); git(base, ["init", "-q"]); legacy(base);
    write(base, NEUTRAL_MANIFEST, "schema: pipeline.manifest.v0\nprovisional: downstream\n");
    cpSync(join(process.cwd(), "plugins/pipeline-core"), join(base, "plugins/pipeline-core"), { recursive: true });
    git(base, ["add", "."]); git(base, ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "-qm", "fixture"]);
    const first = inspectProjectAuthorityProvenance({ rootDir: base });
    const seed = planProjectAuthorityMigration({ rootDir: base, provenance: first });
    assert.equal(seed.status, "ready");
    const receipt = {
      schema: "pipeline.project-authority-adoption-receipt.v1", version: "project-authority.v1", operation: "adopt-existing-neutral",
      planSha256: "a".repeat(64), entryCount: 1, sanitized: true,
      manifestVersion: first.manifestVersion, manifestSha256: first.manifestSha256, packageSha256: first.packageSha256,
    };
    receipt.receiptSha256 = createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
    const downstream = planProjectAuthorityMigration({ rootDir: base, provenance: { ...first, operation: "adopt-existing-neutral", compatibility: "byte-identical-self-application", receipt } });
    assert.equal(downstream.status, "ready");
    assert.equal(applyProjectAuthorityMigration(downstream, { rootDir: base, activate: true }).status, "applied");
  });
  ok("provenance field drift table rejects before adoption writes", () => {
    const cases = [
      ["commit", (p) => ({ ...p, sourceCommit: "f".repeat(40) })],
      ["tree", (p) => ({ ...p, sourceTree: "e".repeat(40) })],
      ["branch", (p) => ({ ...p, branch: "other-branch" })],
      ["upstream", (p) => ({ ...p, upstream: "origin/other" })],
      ["clean", (p) => ({ ...p, clean: !p.clean })],
      ["manifest", (p) => ({ ...p, manifestVersion: "other" })],
      ["package", (p) => ({ ...p, packageSha256: "b".repeat(64) })],
      ["contract", (p) => ({ ...p, contractVersion: "project-authority.v0" })],
      ["operation", (p) => ({ ...p, operation: "migrate-legacy" })],
    ];
    for (const [name, mutate] of cases) {
      const base = root(); git(base, ["init", "-q"]); legacy(base);
      write(base, NEUTRAL_MANIFEST, `schema: pipeline.manifest.v0\nprovisional: ${name}\n`);
      cpSync(join(process.cwd(), "plugins/pipeline-core"), join(base, "plugins/pipeline-core"), { recursive: true });
      git(base, ["add", "."]); git(base, ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "-qm", "fixture"]);
      const provenance = inspectProjectAuthorityProvenance({ rootDir: base });
      assert.equal(provenance.status, "ready", name);
      const plan = planProjectAuthorityMigration({ rootDir: base, provenance: mutate(provenance) });
      assert.equal(plan.status, "provenance-rejected", name);
      assert.equal(existsSync(join(base, NEUTRAL_STATE)), false, name);
    }
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
