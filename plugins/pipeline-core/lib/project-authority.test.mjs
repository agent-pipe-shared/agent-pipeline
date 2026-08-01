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
  applyProjectAuthoritySessionCleanupRecovery, planProjectAuthoritySessionCleanupRecovery,
} from "./project-authority.mjs";
import { cleanupSession, retireSessionDescriptor, startSessionDescriptor } from "./worktree-lifecycle.mjs";

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
function neutral(base, state) {
  write(base, NEUTRAL_MANIFEST, "schema: pipeline.manifest.v0\n");
  write(base, NEUTRAL_STATE, `${JSON.stringify(state)}\n`);
  write(base, NEUTRAL_CALIBRATION, "{\"project\":\"fixture\"}\n");
  write(base, NEUTRAL_GUARD_CONFIG, "{\"protectedTestPaths\":[]}\n");
  write(base, NEUTRAL_GUARD_AUDIT, "{\"event\":\"fixture\"}\n");
}
function leakedState(tuple) {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id: "feature-cleanup-recovery" },
    continuity: { runtime: { sessionCleanup: tuple } },
  };
}
function completeDescriptor(base, sessionId) {
  const started = startSessionDescriptor(base, { sessionId });
  const cleaned = cleanupSession(base, {
    sessionId: started.sessionId,
    ownerNonce: started.ownerNonce,
  }, { allowAbsent: true });
  assert.equal(cleaned.ok, true);
  retireSessionDescriptor(base, {
    sessionId: started.sessionId,
    ownerNonce: started.ownerNonce,
    descriptorSha256: started.descriptorSha256,
  });
  return started;
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
  ok("completed legacy neutral cleanup is sanitized only through a receipt-bound recovery CAS", () => {
    const base = root(); git(base, ["init", "-q"]);
    const completed = completeDescriptor(base, "session-phoenix-closed");
    neutral(base, leakedState({
      sessionId: completed.sessionId,
      descriptorSha256: completed.descriptorSha256,
    }));
    assert.equal(readProjectAuthority({ rootDir: base }).code, "PA-STATE-SESSION-CLEANUP-PRIVATE");
    const plan = planProjectAuthoritySessionCleanupRecovery({ rootDir: base });
    assert.equal(plan.status, "ready");
    assert.equal(plan.operation, "sanitize-completed-session-cleanup");
    assert.equal(plan.targets.length, 1);
    assert.equal(JSON.stringify(plan).includes(completed.sessionId), false);
    assert.equal(JSON.stringify(plan).includes("descriptorSha256"), false);
    assert.equal(applyProjectAuthoritySessionCleanupRecovery(plan, { rootDir: base }).status, "activation-required");
    const applied = applyProjectAuthoritySessionCleanupRecovery(plan, { rootDir: base, activate: true });
    assert.equal(applied.status, "recovered");
    assert.equal(JSON.parse(readFileSync(join(base, NEUTRAL_STATE), "utf8")).continuity.runtime.sessionCleanup, null);
    assert.equal(readProjectAuthority({ rootDir: base }).status, "ready");
    assert.equal(applyProjectAuthoritySessionCleanupRecovery(plan, { rootDir: base, activate: true }).status, "rejected");
  });
  ok("legacy cleanup recovery rejects live, missing, malformed and multiple descriptor evidence", () => {
    const cases = ["live", "missing", "malformed", "multiple"];
    for (const kind of cases) {
      const base = root(); git(base, ["init", "-q"]);
      let tuple;
      if (kind === "live") {
        const started = startSessionDescriptor(base, { sessionId: "session-nova-live" });
        tuple = { sessionId: started.sessionId, descriptorSha256: started.descriptorSha256 };
      } else if (kind === "missing") {
        tuple = { sessionId: "session-nova-missing", descriptorSha256: "b".repeat(64) };
      } else {
        const completed = completeDescriptor(base, `session-nova-${kind}`);
        tuple = { sessionId: completed.sessionId, descriptorSha256: completed.descriptorSha256 };
        if (kind === "malformed") {
          write(base, `.git/agent-pipeline/session-cleanup/receipts/${completed.sessionId}.json`, "{broken\n");
        } else {
          startSessionDescriptor(base, { sessionId: "session-nova-other-active" });
        }
      }
      neutral(base, leakedState(tuple));
      const plan = planProjectAuthoritySessionCleanupRecovery({ rootDir: base });
      assert.notEqual(plan.status, "ready", kind);
      assert.deepEqual(plan.targets, [], kind);
      assert.equal(readProjectAuthority({ rootDir: base }).code, "PA-STATE-SESSION-CLEANUP-PRIVATE", kind);
    }
  });
  ok("legacy cleanup recovery rejects State drift before commit", () => {
    const base = root(); git(base, ["init", "-q"]);
    const completed = completeDescriptor(base, "session-drift-closed");
    neutral(base, leakedState({ sessionId: completed.sessionId, descriptorSha256: completed.descriptorSha256 }));
    const plan = planProjectAuthoritySessionCleanupRecovery({ rootDir: base });
    const statePath = join(base, NEUTRAL_STATE);
    writeFileSync(statePath, `${readFileSync(statePath, "utf8").trimEnd()}\n\n`);
    assert.equal(applyProjectAuthoritySessionCleanupRecovery(plan, { rootDir: base, activate: true }).status, "rejected");
    assert.equal(JSON.parse(readFileSync(statePath, "utf8")).continuity.runtime.sessionCleanup.sessionId, completed.sessionId);
  });
  ok("legacy cleanup recovery fails closed without removing a concurrent State lock", () => {
    const base = root(); git(base, ["init", "-q"]);
    const completed = completeDescriptor(base, "session-lock-closed");
    neutral(base, leakedState({ sessionId: completed.sessionId, descriptorSha256: completed.descriptorSha256 }));
    const plan = planProjectAuthoritySessionCleanupRecovery({ rootDir: base });
    const lock = `${NEUTRAL_STATE}.lock`;
    write(base, lock, "foreign lock\n");
    assert.equal(applyProjectAuthoritySessionCleanupRecovery(plan, { rootDir: base, activate: true }).status, "rejected");
    assert.equal(readFileSync(join(base, lock), "utf8"), "foreign lock\n");
    assert.equal(JSON.parse(readFileSync(join(base, NEUTRAL_STATE), "utf8")).continuity.runtime.sessionCleanup.sessionId, completed.sessionId);
  });
  ok("activation is explicit and retires the mutable legacy State", () => {
    const base = root(); legacy(base); const plan = planProjectAuthorityMigration({ rootDir: base });
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base }).status, "activation-required");
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base, activate: true }).status, "applied");
    assert.equal(readProjectAuthority({ rootDir: base }).source, "neutral");
    assert.equal(readFileSync(join(base, LEGACY_MANIFEST), "utf8"), readFileSync(join(base, NEUTRAL_MANIFEST), "utf8"));
    assert.equal(existsSync(join(base, LEGACY_STATE)), false);
    assert.equal(readFileSync(join(base, LEGACY_CALIBRATION), "utf8"), readFileSync(join(base, NEUTRAL_CALIBRATION), "utf8"));
    assert.equal(readFileSync(join(base, LEGACY_GUARD_CONFIG), "utf8"), readFileSync(join(base, NEUTRAL_GUARD_CONFIG), "utf8"));
    assert.equal(readFileSync(join(base, LEGACY_GUARD_AUDIT), "utf8"), readFileSync(join(base, NEUTRAL_GUARD_AUDIT), "utf8"));
  });
  ok("a stale legacy State requires exact retirement before neutral reads resume", () => {
    const base = root(); legacy(base);
    assert.equal(applyProjectAuthorityMigration(planProjectAuthorityMigration({ rootDir: base }), { rootDir: base, activate: true }).status, "applied");
    const canonical = readFileSync(join(base, NEUTRAL_STATE), "utf8");
    write(base, LEGACY_STATE, '{"schema":"pipeline.state.v0","planApproved":false}\n');
    const blocked = readProjectAuthority({ rootDir: base });
    assert.equal(blocked.status, "migration-required");
    assert.equal(blocked.code, "PA-LEGACY-STATE-RETIREMENT-REQUIRED");
    const plan = planProjectAuthorityMigration({ rootDir: base });
    assert.equal(plan.status, "ready");
    assert.equal(plan.operation, "retire-legacy-state");
    assert.deepEqual(plan.targets.map(({ path, action }) => ({ path, action })), [{ path: LEGACY_STATE, action: "retire" }]);
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base }).status, "activation-required");
    assert.equal(readFileSync(join(base, LEGACY_STATE), "utf8"), '{"schema":"pipeline.state.v0","planApproved":false}\n');
    const applied = applyProjectAuthorityMigration(plan, { rootDir: base, activate: true });
    assert.equal(applied.status, "applied");
    assert.equal(applied.legacyStateRetired, true);
    assert.equal(existsSync(join(base, LEGACY_STATE)), false);
    assert.equal(readFileSync(join(base, NEUTRAL_STATE), "utf8"), canonical);
    assert.equal(readProjectAuthority({ rootDir: base }).status, "ready");
  });
  ok("migration preserves the canonical terminal generated YAML bytes without later drift", () => {
    const base = root(); legacy(base);
    const generated = [
      "modelRouting:",
      "  generated: true",
      "",
      "criticExport:",
      "  policy: pipeline.critic-export-policy.v1",
      "  mode: allowlisted",
      "  policySha256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "  packetSchema: pipeline.critic-candidate-packet.v1",
      "  packetBoundary: candidate-diff-and-allowlisted-references",
      "  hostGate: visible-not-bypassed",
      "  providerGate: visible-not-bypassed",
      "",
    ].join("\n");
    write(base, LEGACY_MANIFEST, generated);

    const plan = planProjectAuthorityMigration({ rootDir: base });
    assert.equal(plan.status, "ready");
    assert.equal(applyProjectAuthorityMigration(plan, { rootDir: base, activate: true }).status, "applied");
    const legacyBytes = readFileSync(join(base, LEGACY_MANIFEST), "utf8");
    const neutralBytes = readFileSync(join(base, NEUTRAL_MANIFEST), "utf8");
    assert.equal(legacyBytes, generated);
    assert.equal(neutralBytes, generated);
    assert.equal(legacyBytes.endsWith("\n\n"), false);
    assert.equal(neutralBytes.endsWith("\n\n"), false);
    assert.equal(neutralBytes.slice(-"  providerGate: visible-not-bypassed\n".length), "  providerGate: visible-not-bypassed\n");
    assert.equal(planProjectAuthorityMigration({ rootDir: base }).status, "noop");
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
