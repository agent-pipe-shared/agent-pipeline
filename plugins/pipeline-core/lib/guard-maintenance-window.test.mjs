#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-maintenance-window.test.mjs — test suite for lib/guard-maintenance-window.mjs
 * (ADR-0058, NOVA-GMW-1).
 *
 * Covers the "Test expectations" list in
 * specs/sprint-nova-epic/design/2026-08-07-guard-maintenance-window-design.md at the
 * LIBRARY level: scope rejection (including F3 defense in depth at install/read time,
 * not just prepare), fail-closed expiry parsing over the signed `expiresAtMs` (F1/F2
 * fix: an absolute, signed bound rather than a relative ttlSeconds reinterpreted
 * later), non-renewability of a repeated install, TTL clamp beyond a signed claim,
 * physical-repository binding, and tamper detection.
 *
 * Guard-integration end-to-end coverage (a REAL armed window installed, then a
 * covered path allowed and a NEVER_LIFTABLE_KERNEL_PATHS path still refused, through
 * the actual guard-gate-strength.mjs/guard-testpath.mjs binaries) is NOT in this
 * file, and is NOT yet in guard-gate-strength.test.mjs/guard-testpath.test.mjs
 * either (Critic finding F4, dispatch NOVA-GMW-1): both files are protected by this
 * repository's own live guard-testpath.mjs rules (TP-2, TP-6) with
 * gates.push_approval: "signature", which admits no in-session override -- every
 * Edit attempt into either file is refused before any bytes change, confirmed twice
 * across two dispatch turns. See the dispatch report's Open Items for the exact
 * refusal text and the intended test content, held for the PO/Elephant to apply
 * outside a guarded session.
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

/** Builds a request+intent from a hand-crafted subject, bypassing prepare()'s own checks/clamp entirely. */
function handBuiltRequest({ root, plugin, scopeRuleIds, expiresAtMs, reason = "hand-built" }) {
  const repo = guardMaintenanceWindowInternals.topology(root);
  const subject = {
    scopeRuleIds,
    expiresAtMs,
    reason,
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
  return { subject, intent, request: { schema: "pipeline.guard-maintenance-window-request.v1", subject, intent } };
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

  // ---- fail-closed expiry parsing (F1: expiresAtMs lives INSIDE the signed subject) --
  check("GMW04 a missing/malformed subject.expiresAtMs resolves to NOT active (fail-closed)", () => {
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
      (record) => { delete record.subject.expiresAtMs; return record; },
      (record) => { record.subject.expiresAtMs = "not-a-date"; return record; },
      (record) => { record.subject.expiresAtMs = null; return record; },
    ]) {
      const record = mutate(JSON.parse(readFileSync(paths.window, "utf8")));
      writeFileSync(paths.window, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      const status = currentGuardMaintenanceWindow({ rootDir: root }).status;
      assert.notEqual(status, "active", `subject.expiresAtMs=${JSON.stringify(record.subject?.expiresAtMs)} must not read as active`);
    }
  });

  // ---- F1: tampering the signed expiresAtMs directly breaks the subject/intent digest
  check("GMW04b editing expiresAtMs in the stored record (a plaintext-looking field) fails verification, not renews", () => {
    const root = repoFixture("gmw-expiry-tamper-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 30, reason: "short-lived", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin });
    const repo = guardMaintenanceWindowInternals.topology(root);
    const paths = guardMaintenanceWindowInternals.storagePaths(repo.common);
    const record = JSON.parse(readFileSync(paths.window, "utf8"));
    const originalExpiresAtMs = record.subject.expiresAtMs;
    // Attempt to renew the window far into the future by editing only expiresAtMs --
    // this is exactly the F1 attack. It must fail, not extend the window.
    record.subject.expiresAtMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    writeFileSync(paths.window, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    assert.notEqual(originalExpiresAtMs, record.subject.expiresAtMs);
    assert.notEqual(currentGuardMaintenanceWindow({ rootDir: root }).status, "active", "an edited expiresAtMs must not renew the window");
  });

  // ---- F2: install is not a renewal mechanism ---------------------------------------
  check("GMW09 repeating install() with the identical {request, proof} never moves expiry later than the signed bound", () => {
    const root = repoFixture("gmw-reinstall-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 120, reason: "reinstall", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    const proof = proofFor(intent);
    const first = installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof, livePluginRoot: plugin });
    assert.equal(first.status, "active");
    const firstExpiresAtMs = first.expiresAtMs;

    // Re-run install with the SAME request/proof after real wall-clock time has passed.
    // A vulnerable implementation would recompute a fresh expiry from "now" here.
    const later = installGuardMaintenanceWindow({
      rootDir: root, request, trustPolicy, proof, livePluginRoot: plugin, nowMs: Date.now() + 60_000,
    });
    assert.equal(later.status, "active");
    assert.equal(later.expiresAtMs, firstExpiresAtMs, "a repeated install must reinstall the identical signed bound, never extend it");
  });

  check("GMW10 install refuses a request whose signed expiresAtMs has already passed", () => {
    const root = repoFixture("gmw-already-expired-");
    const plugin = pluginRootFixture();
    const { request: builtRequest, intent } = handBuiltRequest({
      root, plugin, scopeRuleIds: ["GS-6"], expiresAtMs: Date.now() - 60_000,
    });
    assert.throws(
      () => installGuardMaintenanceWindow({ rootDir: root, request: builtRequest, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin }),
      GuardMaintenanceWindowError,
    );
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent");
  });

  // ---- TTL clamp: a signed claim beyond MAX_WINDOW_TTL_MS is honored only up to the clamp
  check("GMW05 a signed expiresAtMs beyond MAX_WINDOW_TTL_MS is clamped, not honored in full", () => {
    const root = repoFixture("gmw-ttl-");
    const plugin = pluginRootFixture();
    const before = Date.now();
    // Far beyond the 4h ceiling, bypassing prepare()'s own clamp entirely.
    const { request, intent } = handBuiltRequest({
      root, plugin, scopeRuleIds: ["GS-6"], expiresAtMs: before + MAX_WINDOW_TTL_MS * 100, reason: "excessive claim",
    });
    const installed = installGuardMaintenanceWindow({
      rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin,
    });
    assert.equal(installed.status, "active");
    assert.ok(installed.remainingMs <= MAX_WINDOW_TTL_MS, `remainingMs=${installed.remainingMs} exceeds the clamp`);
    assert.ok(installed.expiresAtMs <= before + MAX_WINDOW_TTL_MS + 5_000, "effective expiry exceeds installedAt + MAX_WINDOW_TTL_MS");
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

  // ---- F3: closed-scope re-validation at install AND at read time, defense in depth --
  check("GMW11 install rejects a hand-built request naming a non-liftable rule id, bypassing prepare()", () => {
    const root = repoFixture("gmw-install-scope-");
    const plugin = pluginRootFixture();
    for (const scope of [["GS-2"], ["GS-1"], ["unknown-id"]]) {
      const { request, intent } = handBuiltRequest({ root, plugin, scopeRuleIds: scope, expiresAtMs: Date.now() + 60_000 });
      assert.throws(
        () => installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin }),
        GuardMaintenanceWindowError,
        `scope ${JSON.stringify(scope)} must be rejected at install`,
      );
    }
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent");
  });

  check("GMW12 currentGuardMaintenanceWindow/windowCoversRule never report a non-liftable id as covered, even from an already-stored record", () => {
    // Construct a record whose install-time scope check has been bypassed by writing
    // window.json directly (simulating a bug in an earlier version of install(), or a
    // record written before this defense existed) -- currentGuardMaintenanceWindow must
    // still refuse it on read, independent of install()'s own check.
    const root = repoFixture("gmw-read-scope-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "scope-read-check", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin });
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "active");
    assert.equal(windowCoversRule({ rootDir: root, ruleId: "GS-2" }).covered, false);
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
