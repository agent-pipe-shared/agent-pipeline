#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-maintenance-window.test.mjs — test suite for lib/guard-maintenance-window.mjs
 * (ADR-0058, NOVA-GMW-1).
 *
 * Covers the "Test expectations" list in
 * specs/sprint-nova-epic/design/2026-08-07-guard-maintenance-window-design.md:
 * scope rejection, fail-closed expiry parsing, TTL clamp beyond a signed claim,
 * physical-repository binding, and tamper detection. Guard-integration end-to-end
 * cases (kernel-path refusal under a REAL armed window, GS-6/TP-* lift) live in
 * guard-gate-strength.test.mjs and guard-testpath.test.mjs respectively, since they
 * exercise the calling guards, not this library alone.
 *
 * Run: node plugins/pipeline-core/lib/guard-maintenance-window.test.mjs
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import {
  GuardMaintenanceWindowError,
  MAX_WINDOW_TTL_MS,
  closeGuardMaintenanceWindow,
  currentGuardMaintenanceWindow,
  guardMaintenanceWindowInternals,
  installGuardMaintenanceWindow,
  isLiftableRuleId,
  isNeverLiftableKernelPath,
  prepareGuardMaintenanceWindowRequest,
  windowCoversRule,
} from "./guard-maintenance-window.mjs";

const roots = [];
let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.stack ?? error.message}`); failed += 1; }
}

// One shared Ed25519 test keypair for the whole suite (never a real PO key —
// po-approval-proof.test.mjs uses exactly this generateKeyPairSync pattern).
const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const publicKeySha256 = createHash("sha256").update(publicKey).digest("hex");
const trustPolicy = { keyReference: "gmw-test-key", publicKeySha256 };

function proofFor(intent) {
  return {
    schema: PO_APPROVAL_PROOF_SCHEMA,
    intentSha256: intent.sha256,
    keyReference: "gmw-test-key",
    publicKey,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), pair.privateKey).toString("base64"),
  };
}

/** A real, freshly initialized git repository carrying this key as its trust anchor. */
function repoFixture(prefix = "gmw-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "README.md"), "# fixture\n");
  writeFileSync(join(root, "plan.md"), "plan\n");
  writeFileSync(join(root, "spec.md"), "spec\n");
  writeFileSync(
    join(root, "project", "critical-human-proof.json"),
    JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v1",
      requiredKinds: ["push"],
      trustAnchor: { keyReference: "gmw-test-key", publicKeySha256 },
    }),
  );
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: root });
  return root;
}

// A synthetic "live plugin root" fixture -- small and self-contained, so tree
// hashing in these tests is fast and hermetic (no dependency on this checkout's
// real, much larger plugins/pipeline-core tree).
function pluginRootFixture() {
  const root = mkdtempSync(join(tmpdir(), "gmw-plugin-"));
  roots.push(root);
  mkdirSync(join(root, "hooks"), { recursive: true });
  writeFileSync(join(root, "hooks", "guard-example.mjs"), "// example\n");
  return root;
}

function planSpecShas(root) {
  return {
    planSha256: createHash("sha256").update(readFileSync(join(root, "plan.md"))).digest("hex"),
    specSha256: createHash("sha256").update(readFileSync(join(root, "spec.md"))).digest("hex"),
  };
}

try {
  // ---- isLiftableRuleId / scope validation ------------------------------------------
  check("GMW01 GS-6 and TP-* are liftable; GS-1..GS-5/GS-7 and arbitrary ids are not", () => {
    assert.equal(isLiftableRuleId("GS-6"), true);
    assert.equal(isLiftableRuleId("TP-1"), true);
    assert.equal(isLiftableRuleId("TP-custom"), true);
    for (const id of ["GS-1", "GS-2", "GS-3", "GS-4", "GS-5", "GS-7", "CUSTOM-01", "gs-6", ""]) {
      assert.equal(isLiftableRuleId(id), false, `${id} must not be liftable`);
    }
  });

  check("GMW02 prepare rejects a scope naming a non-liftable rule id", () => {
    const root = repoFixture();
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    for (const scope of [["GS-2"], ["GS-1"], ["unknown-id"], ["GS-6", "GS-3"]]) {
      assert.throws(
        () => prepareGuardMaintenanceWindowRequest({
          rootDir: root, scopeRuleIds: scope, ttlSeconds: 60, reason: "r", featureId: "f",
          planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
        }),
        GuardMaintenanceWindowError,
        `scope ${JSON.stringify(scope)} must be rejected`,
      );
    }
  });

  // ---- happy path: prepare -> install -> active -> covers -> close -----------------
  check("GMW03 prepare -> install -> active -> windowCoversRule -> close -> absent", () => {
    const root = repoFixture();
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent");

    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6", "TP-1"], ttlSeconds: 120, reason: "smoke",
      featureId: "f", planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    const installed = installGuardMaintenanceWindow({
      rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin,
    });
    assert.equal(installed.status, "active");
    assert.deepEqual([...installed.scopeRuleIds].sort(), ["GS-6", "TP-1"]);

    assert.equal(windowCoversRule({ rootDir: root, ruleId: "GS-6" }).covered, true);
    assert.equal(windowCoversRule({ rootDir: root, ruleId: "TP-1" }).covered, true);
    assert.equal(windowCoversRule({ rootDir: root, ruleId: "TP-2" }).covered, false);
    assert.equal(windowCoversRule({ rootDir: root, ruleId: "GS-2" }).covered, false, "GS-2 can never be covered");

    assert.equal(closeGuardMaintenanceWindow({ rootDir: root }).status, "closed");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent");
    assert.equal(closeGuardMaintenanceWindow({ rootDir: root }).status, "absent", "closing twice is a no-op");
  });

  // ---- fail-closed expiry parsing ---------------------------------------------------
  check("GMW04 a missing/malformed expiresAt resolves to NOT active (fail-closed)", () => {
    const root = repoFixture("gmw-expiry-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 60, reason: "expiry", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin });
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "active");

    const repo = guardMaintenanceWindowInternals.topology(root);
    const paths = guardMaintenanceWindowInternals.storagePaths(repo.common);
    for (const mutate of [
      (record) => { delete record.expiresAt; return record; },
      (record) => { record.expiresAt = "not-a-date"; return record; },
      (record) => { record.expiresAt = 12345; return record; },
    ]) {
      const record = mutate(JSON.parse(readFileSync(paths.window, "utf8")));
      writeFileSync(paths.window, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      const status = currentGuardMaintenanceWindow({ rootDir: root }).status;
      assert.notEqual(status, "active", `expiresAt=${JSON.stringify(record.expiresAt)} must not read as active`);
    }
  });

  // ---- TTL clamp: a signed claim beyond MAX_WINDOW_TTL_MS is honored only up to the clamp
  check("GMW05 a signed ttlSeconds beyond MAX_WINDOW_TTL_MS is clamped, not honored in full", () => {
    const root = repoFixture("gmw-ttl-");
    const plugin = pluginRootFixture();
    const repo = guardMaintenanceWindowInternals.topology(root);
    const subject = {
      scopeRuleIds: ["GS-6"],
      ttlSeconds: (MAX_WINDOW_TTL_MS / 1000) * 100, // far beyond the 4h ceiling, bypassing prepare()'s own clamp
      reason: "excessive ttl claim",
      repoFingerprintSha256: guardMaintenanceWindowInternals.sha({ physicalRoot: repo.root, physicalCommon: repo.common }),
      openingTreeSha256: guardMaintenanceWindowInternals.pluginTreeSha256(plugin),
      nonce: "deadbeef".repeat(4),
    };
    const subjectSha256 = guardMaintenanceWindowInternals.sha(subject);
    const intent = createPoApprovalIntent({
      kind: "guard-lift", featureId: "f", planSha256: "a".repeat(64), specSha256: "b".repeat(64),
      candidate: { commit: "c".repeat(40), tree: "d".repeat(40) }, policyRevision: "gmw-test-v1",
      subjectSha256, decision: "lift",
    });
    const request = { schema: "pipeline.guard-maintenance-window-request.v1", subject, intent };
    const before = Date.now();
    const installed = installGuardMaintenanceWindow({
      rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin,
    });
    assert.equal(installed.status, "active");
    assert.ok(installed.remainingMs <= MAX_WINDOW_TTL_MS, `remainingMs=${installed.remainingMs} exceeds the clamp`);
    assert.ok(installed.expiresAtMs <= before + MAX_WINDOW_TTL_MS + 5_000, "effective expiry exceeds openedAt + MAX_WINDOW_TTL_MS");
  });

  // ---- physical-repository binding --------------------------------------------------
  check("GMW06 a window prepared for one physical repository does not verify for another", () => {
    const rootA = repoFixture("gmw-repoA-");
    const rootB = repoFixture("gmw-repoB-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(rootA);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: rootA, scopeRuleIds: ["GS-6"], ttlSeconds: 60, reason: "cross-repo", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    assert.throws(
      () => installGuardMaintenanceWindow({ rootDir: rootB, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin }),
      GuardMaintenanceWindowError,
    );
    assert.equal(currentGuardMaintenanceWindow({ rootDir: rootB }).status, "absent");
  });

  // ---- tamper detection ---------------------------------------------------------------
  check("GMW07 a tampered window.json (any byte changed post-install) fails currentGuardMaintenanceWindow", () => {
    const root = repoFixture("gmw-tamper-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "tamper", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin });
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "active");

    const repo = guardMaintenanceWindowInternals.topology(root);
    const paths = guardMaintenanceWindowInternals.storagePaths(repo.common);
    const record = JSON.parse(readFileSync(paths.window, "utf8"));
    record.subject.reason = "tampered reason";
    writeFileSync(paths.window, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    assert.notEqual(currentGuardMaintenanceWindow({ rootDir: root }).status, "active");
  });

  // ---- kernel-path anchoring (both anchors: project-relative and plugin-root-relative)
  check("GMW08 isNeverLiftableKernelPath matches both anchors and nothing else", () => {
    const root = repoFixture("gmw-kernel-");
    assert.equal(isNeverLiftableKernelPath("project/critical-human-proof.json", { rootDir: root }), true);
    assert.equal(isNeverLiftableKernelPath("README.md", { rootDir: root }), false);
    // Project-root anchor: a self-hosted checkout where `plugins/pipeline-core/...` sits
    // directly under `rootDir`.
    assert.equal(
      isNeverLiftableKernelPath(join(root, "plugins", "pipeline-core", "hooks", "guard-gate-strength.mjs"), { rootDir: root }),
      true,
    );
    assert.equal(
      isNeverLiftableKernelPath(join(root, "plugins", "pipeline-core", "hooks", "guard-git.mjs"), { rootDir: root }),
      false,
      "an ordinary plugin file must not be claimed as kernel",
    );
    // Plugin-root anchor: a globally-installed copy whose live plugin root is NOT inside
    // `rootDir` at all -- only reachable via the `livePluginRoot` parameter's grandparent.
    const globalRoot = mkdtempSync(join(tmpdir(), "gmw-global-"));
    roots.push(globalRoot);
    const globalPluginRoot = join(globalRoot, "marketplace", "plugins", "pipeline-core");
    mkdirSync(join(globalPluginRoot, "hooks"), { recursive: true });
    assert.equal(isNeverLiftableKernelPath(join(globalPluginRoot, "hooks", "guard-lifecycle-ready.mjs"), { rootDir: root }), false, "unreachable via rootDir alone");
    assert.equal(
      isNeverLiftableKernelPath(join(globalPluginRoot, "hooks", "guard-lifecycle-ready.mjs"), { rootDir: root, livePluginRoot: globalPluginRoot }),
      true,
      "must be caught via the livePluginRoot anchor",
    );
    assert.equal(
      isNeverLiftableKernelPath(join(globalPluginRoot, "hooks", "guard-git.mjs"), { rootDir: root, livePluginRoot: globalPluginRoot }),
      false,
    );
  });

  console.log(`\nguard-maintenance-window: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
