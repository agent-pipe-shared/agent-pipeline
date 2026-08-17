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
 * later), non-renewability of a repeated install, an install-time bound rejecting any
 * signed expiresAtMs more than one MAX_WINDOW_TTL_MS beyond the actual install time
 * (Critic delta review 2 Finding 1, closing the "walk the read-time ceiling forward
 * from one signature" gap left by the first fix), physical-repository binding, and
 * tamper detection.
 *
 * Guard-integration end-to-end coverage (a REAL armed window installed, then a
 * covered path allowed and a NEVER_LIFTABLE_KERNEL_PATHS path still refused, through
 * the actual guard-gate-strength.mjs/guard-testpath.mjs binaries) lives in
 * guard-gate-strength.test.mjs (GST20) and guard-testpath.test.mjs (TP09), applied by
 * the PO outside this dispatch's guarded session (Critic findings F4/F5, closed).
 *
 * Run: node plugins/pipeline-core/lib/guard-maintenance-window.test.mjs
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import { run as runGuardMaintenanceWindowCli } from "../scripts/guard-maintenance-window.mjs";
// Namespace import ON PURPOSE for the CEREMONY-1 additions below: a missing named
// export fails ESM linking for the WHOLE file, which would turn a red-before run into
// a single "cannot link" line instead of a per-behaviour failure list. Through the
// namespace, an unimplemented function fails exactly the checks that exercise it and
// leaves every other check's PASS/FAIL evidence intact.
import * as gmw from "./guard-maintenance-window.mjs";
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

/**
 * A real, freshly initialized git repository carrying this key as its trust anchor.
 *
 * NVA-GMWFIX-1: `policy`, when supplied, replaces the DEFAULT v1-shaped
 * `critical-human-proof.json` (a legacy singular `trustAnchor`) with a caller-chosen
 * document -- the v3 regression fixtures below use this to write a `trustAnchors`
 * (plural, array) document instead, mirroring the v3 fixture convention already used in
 * critical-action-authorization.test.mjs's own `fixture()` helper.
 */
function repoFixture(prefix = "gmw-", { policy } = {}) {
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
    JSON.stringify(policy ?? {
      schema: "pipeline.critical-human-proof-policy.v1",
      requiredKinds: ["push"],
      trustAnchor: { keyReference: "gmw-test-key", publicKeySha256 },
    }),
  );
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: root });
  return root;
}

/** v3-shaped `critical-human-proof.json` carrying ONLY `trustAnchors` (plural, array) -- no legacy singular `trustAnchor` field at all. */
function v3PolicyWithAnchors(anchors) {
  return { schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: anchors };
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

/**
 * Builds a request+intent from a hand-crafted subject, bypassing prepare()'s own
 * checks/clamp entirely. `candidate` defaults to the same fabricated, never-real
 * {commit, tree} every pre-existing caller of this helper already relied on -- passing
 * one explicitly is how CANDBIND-1's checks construct a candidate that is deliberately
 * true about one half (commit or tree) and false about the other.
 */
function handBuiltRequest({ root, plugin, scopeRuleIds, expiresAtMs, reason = "hand-built", candidate = { commit: "c".repeat(40), tree: "d".repeat(40) } }) {
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
    candidate, policyRevision: "gmw-test-v1",
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

  // ---- TTL clamp / Finding 1 (delta Critic review 2, bounded to 2bc1fc8) -------------
  // Pre-fix, an oversized signed expiresAtMs installed successfully and was merely
  // read-time-clamped -- which a repeated install() (re-anchoring installedAtMs to a
  // later "now" each time) could walk forward indefinitely from one PO signature
  // (Finding 1). Post-fix, install() itself refuses any request whose signed
  // expiresAtMs exceeds one MAX_WINDOW_TTL_MS beyond the ACTUAL install time -- the
  // exploit never gets a first foothold. This check reproduces Finding 1's exact
  // scenario (~100x MAX_WINDOW_TTL_MS, hand-built, bypassing prepare()'s own clamp)
  // and asserts the FIRST installGuardMaintenanceWindow call itself throws.
  check("GMW05 a signed expiresAtMs far beyond nowMs + MAX_WINDOW_TTL_MS is refused at the FIRST install, never silently honored (Finding 1)", () => {
    const root = repoFixture("gmw-ttl-");
    const plugin = pluginRootFixture();
    const before = Date.now();
    // Far beyond the 4h ceiling, bypassing prepare()'s own clamp entirely -- exactly
    // Finding 1's precondition.
    const { request, intent } = handBuiltRequest({
      root, plugin, scopeRuleIds: ["GS-6"], expiresAtMs: before + MAX_WINDOW_TTL_MS * 100, reason: "excessive claim",
    });
    assert.throws(
      () => installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin }),
      GuardMaintenanceWindowError,
      "the first install attempt of a grossly oversized signed expiresAtMs must itself refuse, not silently clamp",
    );
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent", "a refused install must leave no window record behind");
  });

  check("GMW13 the exploit does not get a foothold: re-attempting install() of the same oversized request never succeeds, even much later", () => {
    // Finding 1's actual attack shape was REPEATED install() calls walking the
    // read-time ceiling forward. Confirms the fix holds not just on the first
    // attempt but on every subsequent one -- there is no "wait a bit, try again"
    // route around the new install-time bound for this same oversized request.
    const root = repoFixture("gmw-ttl-repeat-");
    const plugin = pluginRootFixture();
    const before = Date.now();
    const { request, intent } = handBuiltRequest({
      root, plugin, scopeRuleIds: ["GS-6"], expiresAtMs: before + MAX_WINDOW_TTL_MS * 100, reason: "excessive claim, repeated",
    });
    const proof = proofFor(intent);
    for (const nowMs of [before, before + 60_000, before + 2 * 60 * 60 * 1000]) {
      assert.throws(
        () => installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof, livePluginRoot: plugin, nowMs }),
        GuardMaintenanceWindowError,
        `install must still refuse at nowMs=${nowMs}`,
      );
    }
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent");
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

  // F2 (NVA-A7FIX-1, Nova A Slice A7 comprehensive gate Critic review): ADR-0058
  // Decision 3 documents NEVER_LIFTABLE_KERNEL_PATHS as covering "the code that
  // verifies windows", but omitted the two modules this file itself imports and
  // calls to actually perform that verification -- createPoApprovalIntent from
  // po-approval-proof.mjs, and readCriticalHumanProofPolicy/verifyAgainstTrustAnchors
  // from critical-human-proof-policy.mjs (imports above, lines 65-66). A GS-6-scoped
  // window was therefore NOT excluded from covering an edit to the very code that
  // verifies all future windows -- the exact "recursive hole" Decision 3 exists to
  // close, reproduced verbatim in the implemented list but incomplete relative to
  // the ADR's own stated principle.
  check("F2 NVA-A7FIX-1: NEVER_LIFTABLE_KERNEL_PATHS covers the two window-verifier modules", () => {
    const root = repoFixture("gmw-kernel-verifiers-");
    assert.equal(
      isNeverLiftableKernelPath(
        join(root, "plugins", "pipeline-core", "lib", "critical-human-proof-policy.mjs"),
        { rootDir: root },
      ),
      true,
      "critical-human-proof-policy.mjs verifies windows (readCriticalHumanProofPolicy/verifyAgainstTrustAnchors) and must never be liftable",
    );
    assert.equal(
      isNeverLiftableKernelPath(
        join(root, "plugins", "pipeline-core", "lib", "po-approval-proof.mjs"),
        { rootDir: root },
      ),
      true,
      "po-approval-proof.mjs verifies windows (createPoApprovalIntent) and must never be liftable",
    );
  });

  // ---- CEREMONY-1 (A): the record a signing command may show the human ---------------
  // The summary exists so the PO is not asked to authorize a bare digest (ADR-0061
  // Decision 4). Two properties matter more than the text itself: it is READ from the
  // recorded request (never composed), and it is only shown at all when the record
  // re-derives to exactly the digest that is about to be signed -- the same derivation
  // install() performs. A record that does not re-derive is not "shown with a warning",
  // it is not shown.
  check("GMW14 describeGuardMaintenanceWindowRequest shows reason, scope and expiry for the digest it resolves", () => {
    const root = repoFixture("gmw-describe-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, subject } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6", "TP-1"], ttlSeconds: 900, reason: "fix the release preflight base-commit peel",
      featureId: "f", planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    const described = gmw.describeGuardMaintenanceWindowRequest({ rootDir: root, intentSha256: intent.sha256 });
    assert.equal(described.resolved, true, "the freshly prepared request must resolve for its own digest");
    assert.equal(described.kind, "guard-lift");
    assert.equal(described.reason, "fix the release preflight base-commit peel");
    assert.deepEqual(described.scopeRuleIds, ["GS-6", "TP-1"]);
    assert.equal(described.expiresAtMs, subject.expiresAtMs);
    const body = described.lines.join("\n");
    assert.match(body, /fix the release preflight base-commit peel/u, "the reason must be shown");
    assert.match(body, /GS-6/u);
    assert.match(body, /TP-1/u);
    assert.match(body, new RegExp(new Date(subject.expiresAtMs).toISOString(), "u"), "the expiry must be shown");
    assert.match(body, /guard-lift/u);
  });

  check("GMW15 an unresolvable digest yields no lines at all -- no record, no invented description", () => {
    const root = repoFixture("gmw-describe-none-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    // No request recorded yet.
    const empty = gmw.describeGuardMaintenanceWindowRequest({ rootDir: root, intentSha256: "a".repeat(64) });
    assert.equal(empty.resolved, false);
    assert.deepEqual(empty.lines, [], "an unresolved record must contribute no display lines");
    assert.equal(typeof empty.code, "string");

    prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 600, reason: "recorded but unrelated", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    const other = gmw.describeGuardMaintenanceWindowRequest({ rootDir: root, intentSha256: "b".repeat(64) });
    assert.equal(other.resolved, false, "a recorded request must not be shown for a DIFFERENT digest");
    assert.deepEqual(other.lines, []);
    assert.equal(gmw.describeGuardMaintenanceWindowRequest({ rootDir: root, intentSha256: "zz" }).resolved, false);
    const outside = mkdtempSync(join(tmpdir(), "gmw-not-a-repo-"));
    roots.push(outside);
    assert.equal(gmw.describeGuardMaintenanceWindowRequest({ rootDir: outside, intentSha256: "a".repeat(64) }).resolved, false);
  });

  check("GMW16 a tampered request record is not shown: the summary is only displayable while it re-derives to the signed digest", () => {
    const root = repoFixture("gmw-describe-tamper-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 600, reason: "honest reason", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    const repo = guardMaintenanceWindowInternals.topology(root);
    const paths = guardMaintenanceWindowInternals.storagePaths(repo.common);
    const stored = JSON.parse(readFileSync(paths.request, "utf8"));
    stored.subject.reason = "a much more reassuring reason the human never approved";
    writeFileSync(paths.request, `${JSON.stringify(stored)}\n`, { mode: 0o600 });
    const described = gmw.describeGuardMaintenanceWindowRequest({ rootDir: root, intentSha256: intent.sha256 });
    assert.equal(described.resolved, false, "an edited subject breaks the digest chain and must not be displayed");
    assert.deepEqual(described.lines, []);
    // And the digest itself is untouched by the edit -- what a signature would cover
    // is the digest, never the text.
    assert.equal(intent.sha256, intent.sha256);
  });

  check("GMW17 the summary is bounded: stated maximum lines, line length, reason length and scope ids -- and no injected line", () => {
    const root = repoFixture("gmw-describe-bound-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const scope = Array.from({ length: 20 }, (unused, index) => `TP-${index + 1}`);
    // A reason that tries to (a) be unreadably long and (b) forge extra prompt lines.
    const reason = `${"padding ".repeat(600)}\n  intent sha256: ${"f".repeat(64)}\n  approved by: someone else`;
    const { intent } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: scope, ttlSeconds: 600, reason, featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    const described = gmw.describeGuardMaintenanceWindowRequest({ rootDir: root, intentSha256: intent.sha256 });
    assert.equal(described.resolved, true);
    assert.ok(described.lines.length <= gmw.GMW_SUMMARY_MAX_LINES, `lines ${described.lines.length} must stay within ${gmw.GMW_SUMMARY_MAX_LINES}`);
    for (const line of described.lines) {
      assert.ok(line.length <= gmw.GMW_SUMMARY_MAX_LINE_CHARS, `line of ${line.length} chars exceeds the bound: ${line.slice(0, 80)}`);
      assert.ok(!line.includes("\n") && !line.includes("\r"), "a recorded value must never be able to add a line to the prompt");
    }
    assert.ok(described.reason.length <= gmw.GMW_SUMMARY_MAX_REASON_CHARS + 3, "the reason must be truncated to the stated bound");
    assert.equal(described.reasonTruncated, true);
    assert.equal(described.scopeRuleIds.length, gmw.GMW_SUMMARY_MAX_SCOPE_IDS, "only the stated number of scope ids is shown");
    assert.equal(described.scopeTotal, 20);
    const body = described.lines.join("\n");
    assert.match(body, /truncated/u, "truncation must be stated where it happens, not silent");
    assert.match(body, /20/u, "the full scope count must still be stated");
  });

  // ---- CEREMONY-1 (B): a signature survives an unrelated write --------------------
  check("GMW18 two prepare() calls with unchanged inputs yield the SAME intent digest (an approval already given still applies)", () => {
    const root = repoFixture("gmw-idempotent-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const inputs = {
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 600, reason: "same work, prepared twice", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    };
    const first = prepareGuardMaintenanceWindowRequest({ ...inputs, nowMs: 1_800_000_000_000 });
    const second = prepareGuardMaintenanceWindowRequest({ ...inputs, nowMs: 1_800_000_060_000 });
    assert.equal(second.intent.sha256, first.intent.sha256, "a later clock alone must not mint a new digest");
    assert.equal(second.subject.nonce, first.subject.nonce, "the nonce must not be re-rolled for an unchanged intent");
    assert.equal(second.subject.expiresAtMs, first.subject.expiresAtMs, "the signed expiry must not move under a re-prepare");
    assert.equal(second.reused, true);
    assert.equal(first.reused, false);
  });

  check("GMW19 a write into the live plugin tree between prepare and install no longer voids the approval; both hashes are recorded", () => {
    const root = repoFixture("gmw-tree-write-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const inputs = {
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 600, reason: "unrelated write must not cost a signature", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    };
    const prepared = prepareGuardMaintenanceWindowRequest(inputs);
    const preparedTreeSha256 = prepared.subject.openingTreeSha256;

    // Somebody else writes a completely unrelated file into the live plugin tree.
    writeFileSync(join(plugin, "hooks", "unrelated-write.mjs"), "// written by another agent\n");
    const observedTreeSha256 = guardMaintenanceWindowInternals.pluginTreeSha256(plugin);
    assert.notEqual(observedTreeSha256, preparedTreeSha256, "the fixture must really have drifted");

    // Re-preparing after that write still yields the digest the human already signed.
    const again = prepareGuardMaintenanceWindowRequest(inputs);
    assert.equal(again.intent.sha256, prepared.intent.sha256, "an unrelated plugin-tree write must not change the intent digest");

    const installed = installGuardMaintenanceWindow({
      rootDir: root, request: prepared.request, trustPolicy, proof: proofFor(prepared.intent), livePluginRoot: plugin,
    });
    assert.equal(installed.status, "active", "the already-signed approval must still install after an unrelated write");

    const repo = guardMaintenanceWindowInternals.topology(root);
    const paths = guardMaintenanceWindowInternals.storagePaths(repo.common);
    const record = JSON.parse(readFileSync(paths.window, "utf8"));
    assert.equal(record.preparedTreeSha256, preparedTreeSha256, "the prepared tree hash must still be recorded");
    assert.equal(record.observedTreeSha256, observedTreeSha256, "the tree hash observed at install must be recorded too");
    assert.equal(record.subject.openingTreeSha256, preparedTreeSha256, "the signed subject still binds the opening hash (ADR-0058 point 5)");
    assert.equal(installed.observedTreeSha256, observedTreeSha256);
  });

  check("GMW20 a CHANGED scope, expiry basis or reason still mints a new digest and therefore still needs a new signature", () => {
    const root = repoFixture("gmw-changed-inputs-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const base = {
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 600, reason: "baseline", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    };
    const first = prepareGuardMaintenanceWindowRequest(base);
    for (const [label, override] of [
      ["scope", { scopeRuleIds: ["GS-6", "TP-1"] }],
      ["expiry basis", { ttlSeconds: 1200 }],
      ["reason", { reason: "something else entirely" }],
      ["feature", { featureId: "other-feature" }],
    ]) {
      const changed = prepareGuardMaintenanceWindowRequest({ ...base, ...override });
      assert.notEqual(changed.intent.sha256, first.intent.sha256, `a changed ${label} must mint a new digest`);
      assert.equal(changed.reused, false, `a changed ${label} must not reuse the recorded request`);
      // ...and the earlier signature no longer installs against the new request.
      assert.throws(
        () => installGuardMaintenanceWindow({ rootDir: root, request: changed.request, trustPolicy, proof: proofFor(first.intent), livePluginRoot: plugin }),
        GuardMaintenanceWindowError,
        `a proof for the old digest must not install a changed ${label}`,
      );
    }
  });

  // GMW20 varies scope, expiry basis, reason and featureId, but never the plan/spec
  // digests, so "a mismatched plan or spec is still refused" was the one property of
  // the signed intent that the reuse path (`reusablePreparedRequest`) could have
  // silently widened without any check turning red. Addition only: it pins that the
  // idempotency introduced for CEREMONY-1 (B) is keyed on the WHOLE intent envelope,
  // not merely on the fields the human is shown.
  check("GMW20b a CHANGED plan or spec digest also mints a new digest, and the earlier proof still does not install it", () => {
    const root = repoFixture("gmw-changed-plan-spec-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const base = {
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 600, reason: "baseline", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    };
    const first = prepareGuardMaintenanceWindowRequest(base);
    for (const [label, override] of [
      ["plan", { planSha256: "1".repeat(64) }],
      ["spec", { specSha256: "2".repeat(64) }],
    ]) {
      const changed = prepareGuardMaintenanceWindowRequest({ ...base, ...override });
      assert.notEqual(changed.intent.sha256, first.intent.sha256, `a changed ${label} digest must mint a new intent digest`);
      assert.equal(changed.reused, false, `a changed ${label} digest must not reuse the recorded request`);
      let error;
      try {
        installGuardMaintenanceWindow({ rootDir: root, request: changed.request, trustPolicy, proof: proofFor(first.intent), livePluginRoot: plugin });
      } catch (caught) { error = caught; }
      assert.ok(error instanceof GuardMaintenanceWindowError, `a proof for the old digest must not install a changed ${label} digest`);
      assert.equal(error.code, "GMW-PROOF-INVALID", `the refusal must be the signature check itself, not an incidental failure (${label})`);
      assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent", `a refused install must leave no window record behind (${label})`);
    }
  });

  check("GMW21 the four-hour TTL cap still clamps at prepare AND is still enforced at install", () => {
    const root = repoFixture("gmw-ttl-cap-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const nowMs = Date.now();
    const { subject, request, intent } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 10 * 24 * 60 * 60, reason: "ten days requested", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin, nowMs,
    });
    assert.equal(subject.expiresAtMs, nowMs + MAX_WINDOW_TTL_MS, "prepare must clamp to the 4h ceiling");
    const installed = installGuardMaintenanceWindow({
      rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin, nowMs,
    });
    assert.equal(installed.status, "active");
    assert.ok(installed.expiresAtMs <= nowMs + MAX_WINDOW_TTL_MS, "the read-time ceiling must still hold");
    // Installing the same clamped request much later must not walk the ceiling forward.
    assert.throws(
      () => installGuardMaintenanceWindow({
        rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin,
        nowMs: nowMs + MAX_WINDOW_TTL_MS + 1000,
      }),
      GuardMaintenanceWindowError,
      "an already-expired signed bound must still be refused at install",
    );
  });

  // ---- CANDBIND-1: candidate binding at install closes the gap 23d93b0 left open ----
  // 23d93b0 turned the live-plugin-tree equality check into a recorded observation
  // (GMW19 above pins that this stays true). Its consequence: install() performed no
  // freshness check on the repository's committed state at all -- repoFingerprintSha256
  // proves PHYSICAL repository identity, but nothing compared the signed candidate
  // {commit, tree} against the repository's actual HEAD. These checks close exactly
  // that gap, without reintroducing the removed live-plugin-TREE check under another
  // name: they compare against `git rev-parse HEAD`/`HEAD^{tree}`, never against bytes
  // under `livePluginRoot`.
  check("GMW22 install refuses when the current HEAD commit differs from the signed candidate commit (a new commit landed since prepare)", () => {
    const root = repoFixture("gmw-candidate-commit-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "candidate binding, commit", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    const preparedCommit = request.intent.value.candidate.commit;

    // A genuine new commit lands on HEAD between prepare and install -- the committed
    // state the PO's signature covers is no longer the repository's current state.
    writeFileSync(join(root, "README.md"), "# fixture, updated\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "drift"], { cwd: root });
    const newCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    assert.notEqual(newCommit, preparedCommit, "the fixture must really have moved to a new commit, or this test proves nothing");

    let error;
    try {
      installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin });
    } catch (caught) { error = caught; }
    assert.ok(error instanceof GuardMaintenanceWindowError, "install must refuse a candidate commit that no longer matches HEAD");
    assert.equal(error.code, "GMW-CANDIDATE-COMMIT-MISMATCH");
    assert.match(error.message, /candidate/iu, "the message must name the candidate mismatch");
    assert.equal(/tree drifted/u.test(error.message), false, "must not reuse the wording of the removed live-plugin-tree check");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent", "a refused install must leave no window record behind");
  });

  check("GMW23 install refuses when only the HEAD tree differs from the signed candidate tree, even when the candidate commit matches", () => {
    // Honestly constructed: a real commit object's tree is immutable, so "commit
    // matches, tree differs" cannot arise from an unmodified prepare()-derived
    // candidate. It is constructed here as a hand-built candidate that tells the truth
    // about the commit (the fixture's own real HEAD) and lies about the tree -- the
    // only way to exercise the tree check independently of the commit check.
    const root = repoFixture("gmw-candidate-tree-");
    const plugin = pluginRootFixture();
    const realCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const realTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
    const wrongTree = "d".repeat(40);
    assert.notEqual(wrongTree, realTree, "the deliberately wrong tree must really differ from the fixture's real one, or this test proves nothing");

    const { request, intent } = handBuiltRequest({
      root, plugin, scopeRuleIds: ["GS-6"], expiresAtMs: Date.now() + 60_000, reason: "candidate binding, tree",
      candidate: { commit: realCommit, tree: wrongTree },
    });
    let error;
    try {
      installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin });
    } catch (caught) { error = caught; }
    assert.ok(error instanceof GuardMaintenanceWindowError, "install must refuse a candidate tree that no longer matches HEAD^{tree}");
    assert.equal(error.code, "GMW-CANDIDATE-TREE-MISMATCH");
    assert.notEqual(error.code, "GMW-CANDIDATE-COMMIT-MISMATCH", "the commit half of the candidate matched; only the tree check must have fired");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent", "a refused install must leave no window record behind");
  });

  check("GMW24 install admits when only uncommitted working-tree bytes changed since prepare -- the candidate binding checks HEAD, not the working tree", () => {
    // Distinct from GMW19 (which pins the SAME property for the live plugin tree
    // specifically): this confirms the new candidate-binding checks added by
    // CANDBIND-1 do not regress it for the repository's own working tree either. An
    // uncommitted, unstaged edit inside `root` never changes what `git rev-parse
    // HEAD`/`HEAD^{tree}` report, so it must not be refused.
    const root = repoFixture("gmw-candidate-uncommitted-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "uncommitted bytes must not void the signature", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });

    // Modify a tracked file WITHOUT committing (and without even staging) it.
    writeFileSync(join(root, "README.md"), "# fixture, uncommitted edit\n");
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
    assert.match(status, /README\.md/u, "the fixture must really carry an uncommitted change, or this test proves nothing");

    const installed = installGuardMaintenanceWindow({
      rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin,
    });
    assert.equal(installed.status, "active", "an uncommitted working-tree edit must not void an already-signed candidate binding");
  });

  check("GMW25 install fails closed when the candidate check's own git invocation fails, never admitting on an unresolvable HEAD", () => {
    const root = repoFixture("gmw-candidate-git-fail-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "git failure at install", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });

    const brokenOn = (matchArgs) => (command, args, options) => {
      if (command === "git" && args.length === matchArgs.length && args.every((value, index) => value === matchArgs[index])) {
        return { status: 1, stdout: "", stderr: "simulated failure", error: null };
      }
      return spawnSync(command, args, options);
    };

    assert.throws(
      () => installGuardMaintenanceWindow({
        rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin, spawn: brokenOn(["rev-parse", "HEAD"]),
      }),
      GuardMaintenanceWindowError,
      "a failed HEAD lookup must refuse install, not admit it",
    );
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent");

    assert.throws(
      () => installGuardMaintenanceWindow({
        rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin, spawn: brokenOn(["rev-parse", "HEAD^{tree}"]),
      }),
      GuardMaintenanceWindowError,
      "a failed HEAD^{tree} lookup must refuse install, not admit it",
    );
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent");
  });

  // ---- GF-072: the CLI's --authority branch narrows a fresh SETUP-1 (3-field) --------
  // authority file before it becomes trustPolicy, the same fix already applied to
  // pipeline-state.mjs's verifyCriticalHumanProof (GF-067) and po-approval-request.mjs's
  // verify subcommand (GF-069). Exercised at the CLI level (via `run`), not the lib
  // level, because the lib's `installGuardMaintenanceWindow` never saw the bug -- the
  // narrowing belongs to the CLI's own `install --authority` branch.
  check("GMW26 CLI install --authority accepts a fresh SETUP-1 (3-field) authority file, exactly like a legacy 2-field one", () => {
    const root = repoFixture("gmw-cli-authority-");
    const prepared = runGuardMaintenanceWindowCli([
      "prepare", "--repo-root", root, "--scope", "GS-6", "--ttl-seconds", "300",
      "--reason", "cli authority narrowing", "--plan", "plan.md", "--spec", "spec.md",
    ]);
    assert.equal(prepared.ok, true);
    const { request, intent } = prepared.value;

    const external = mkdtempSync(join(tmpdir(), "gmw-cli-external-"));
    roots.push(external);
    const requestPath = join(root, "gmw-request.json");
    writeFileSync(requestPath, JSON.stringify(request));
    const proofPath = join(external, "proof.json");
    writeFileSync(proofPath, JSON.stringify(proofFor(intent)));
    const authorityPath = join(external, "authority-setup1.json");
    writeFileSync(authorityPath, JSON.stringify({ ...trustPolicy, humanName: "Test Operator" }));

    const installed = runGuardMaintenanceWindowCli([
      "install", "--repo-root", root, "--request", requestPath,
      "--proof", proofPath, "--authority", authorityPath,
    ]);
    assert.equal(installed.ok, true);
    assert.equal(installed.value.status, "active");
    assert.equal(closeGuardMaintenanceWindow({ rootDir: root }).status, "closed");
  });

  // ---- NVA-GMWFIX-1: v3 multi-anchor trust anchor read (both bug sites) -------------
  // Live ceremony bug (backlog: 2026-08-16-gmw-install-never-recognizes-its-own-window-
  // under-v3-multi-anchor-schema.md): `currentGuardMaintenanceWindow` and the CLI's
  // default-authority branch used to read ONLY the legacy singular `policy.trustAnchor`
  // field, which is permanently `null` once `critical-human-proof.json` carries the v3
  // `trustAnchors` array -- a correctly signed, correctly installed window read back
  // `absent` on every single check, including the one `install` itself performs to
  // build its own return value. These checks pin the fix at both bug sites.

  check("GMW27 a v3-only critical-human-proof.json (trustAnchors array, no legacy trustAnchor field) reads an installed window back as active, not absent", () => {
    const root = repoFixture("gmw-v3-populated-", { policy: v3PolicyWithAnchors([{ keyReference: "gmw-test-key", publicKeySha256 }]) });
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent", "no window installed yet");

    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "v3 populated set", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    const installed = installGuardMaintenanceWindow({
      rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin,
    });
    // install()'s OWN return value is built by calling currentGuardMaintenanceWindow
    // internally -- this is the exact line the live ceremony broke on.
    assert.equal(installed.status, "active", "install's own re-read must not report absent under a v3-only policy");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "active", "every subsequent read must also see active");
    assert.equal(windowCoversRule({ rootDir: root, ruleId: "GS-6" }).covered, true);
  });

  check("GMW28 an explicit EMPTY v3 trustAnchors: [] is treated as no anchor available and fails closed at install -- GMW never adopts the \"any well-formed key\" posture, unlike the CRITICAL_ACTION_KINDS ceremonies", () => {
    // NVA-GMWFIX-2: GMW28 previously asserted the WRONG (undisclosed) behavior imported by
    // e31f0233/NVA-GMWFIX-1 -- an empty v3 trustAnchors set installing as "active". GMW is
    // the ceremony that LIFTS GS-6/TP-* protection in the first place, so that posture here
    // would make the whole ceremony self-serviceable by an agent with no human involved.
    // Rewritten to pin the CORRECTED behavior: absent/empty is "no anchor available", the
    // same fail-closed posture GMW had before NVA-GMWFIX-1.
    const root = repoFixture("gmw-v3-empty-", { policy: v3PolicyWithAnchors([]) });
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "v3 empty set, must fail closed", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    // `trustPolicy: []` mirrors what the CLI's default-authority branch resolves when the
    // committed policy carries an empty v3 set (see GMW31 for the CLI's default-authority
    // branch exercised end to end against a POPULATED v3 set).
    let error;
    try {
      installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy: [], proof: proofFor(intent), livePluginRoot: plugin });
    } catch (caught) { error = caught; }
    assert.ok(error instanceof GuardMaintenanceWindowError, "an empty trustAnchors set must be refused, not silently admitted as \"any well-formed key\"");
    assert.equal(error.code, "GMW-TRUST-ANCHOR-MISSING", "the refusal must be the empty-anchor-set check, not an incidental failure");
    assert.notEqual(error.code, "GMW-PROOF-INVALID", "must be distinguishable from an ordinary signature-verification failure");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent", "a refused install must leave no window record behind, and a read against an empty committed policy must also report absent");
  });

  check("GMW29 a legacy-only policy (singular trustAnchor, no trustAnchors array at all) still reads an installed window back as active -- the fix is additive, not breaking", () => {
    // The suite's DEFAULT repoFixture() already writes exactly this shape (v1 schema,
    // singular trustAnchor, no `trustAnchors` key present at all) -- pinned here as its
    // own named regression case per NVA-GMWFIX-1's DoD, not merely incidentally covered
    // by every other v1-fixture check in this file.
    const root = repoFixture("gmw-legacy-singular-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "legacy singular anchor", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    const installed = installGuardMaintenanceWindow({
      rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin,
    });
    assert.equal(installed.status, "active");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "active");
  });

  check("GMW30 a populated v3 trustAnchors set refuses a signature from a key that matches neither the legacy singular anchor nor any set entry -- the fix must not widen acceptance", () => {
    const outsider = generateKeyPairSync("ed25519");
    const outsiderPublicKey = outsider.publicKey.export({ type: "spki", format: "pem" });
    const outsiderPublicKeySha256 = createHash("sha256").update(outsiderPublicKey).digest("hex");
    const outsiderProofFor = (intent) => ({
      schema: PO_APPROVAL_PROOF_SCHEMA,
      intentSha256: intent.sha256,
      keyReference: "outsider-key",
      publicKey: outsiderPublicKey,
      signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), outsider.privateKey).toString("base64"),
    });
    // The committed v3 set trusts ONLY "gmw-test-key" -- never "outsider-key".
    const root = repoFixture("gmw-v3-negative-", { policy: v3PolicyWithAnchors([{ keyReference: "gmw-test-key", publicKeySha256 }]) });
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "negative case, outsider key", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    // install() verifies against the trustPolicy it is explicitly given (self-consistent
    // with the outsider proof here), so install itself does not throw -- but its own
    // re-read (and every later read) consults the COMMITTED v3 set, which does not
    // include this key.
    const outsiderTrustPolicy = { keyReference: "outsider-key", publicKeySha256: outsiderPublicKeySha256 };
    const installed = installGuardMaintenanceWindow({
      rootDir: root, request, trustPolicy: outsiderTrustPolicy, proof: outsiderProofFor(intent), livePluginRoot: plugin,
    });
    assert.equal(installed.status, "absent", "a signature outside the committed v3 anchor set must not read back as active");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent");
  });

  check("GMW31 CLI install WITHOUT --authority reads the v3 trustAnchors array from the committed policy and installs successfully -- the exact live ceremony this bug broke", () => {
    const root = repoFixture("gmw-cli-v3-default-", { policy: v3PolicyWithAnchors([{ keyReference: "gmw-test-key", publicKeySha256 }]) });
    const prepared = runGuardMaintenanceWindowCli([
      "prepare", "--repo-root", root, "--scope", "GS-6", "--ttl-seconds", "300",
      "--reason", "v3 default-authority ceremony", "--plan", "plan.md", "--spec", "spec.md",
    ]);
    assert.equal(prepared.ok, true);
    const { request, intent } = prepared.value;

    const external = mkdtempSync(join(tmpdir(), "gmw-cli-v3-external-"));
    roots.push(external);
    const requestPath = join(root, "gmw-request.json");
    writeFileSync(requestPath, JSON.stringify(request));
    const proofPath = join(external, "proof.json");
    writeFileSync(proofPath, JSON.stringify(proofFor(intent)));

    // NO --authority: exercises the CLI's default-authority branch reading the
    // v3-shaped project/critical-human-proof.json this repository fixture committed.
    const installed = runGuardMaintenanceWindowCli([
      "install", "--repo-root", root, "--request", requestPath, "--proof", proofPath,
    ]);
    assert.equal(installed.ok, true);
    assert.equal(installed.value.status, "active", "install's own return value must read back active, not absent, under a v3-only committed policy");

    const status = runGuardMaintenanceWindowCli(["status", "--repo-root", root]);
    assert.equal(status.value.status, "active");
    assert.equal(closeGuardMaintenanceWindow({ rootDir: root }).status, "closed");
  });

  check("GMW32 installGuardMaintenanceWindow's defense-in-depth check refuses a caller-supplied empty trustPolicy array even when the repository's OWN committed policy is populated -- proving the check trusts no caller's shape, not only the CLI's own resolution path", () => {
    // Distinct from GMW28: GMW28's fixture carries an empty v3 set on disk too, so it
    // exercises the resolution-site fix. This fixture uses the suite's DEFAULT (populated
    // legacy trustAnchor) policy, and the caller still hands `trustPolicy: []` directly --
    // bypassing the CLI's own resolution entirely -- to prove the install()-internal
    // defense-in-depth check fires regardless of what a caller passes, per NVA-GMWFIX-2.
    const root = repoFixture("gmw-empty-anchor-defense-");
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "defense in depth, empty caller-supplied trustPolicy", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    let error;
    try {
      installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy: [], proof: proofFor(intent), livePluginRoot: plugin });
    } catch (caught) { error = caught; }
    assert.ok(error instanceof GuardMaintenanceWindowError, "a caller-supplied empty trustPolicy array must be refused regardless of the repository's own committed policy");
    assert.equal(error.code, "GMW-TRUST-ANCHOR-MISSING");
    assert.notEqual(error.code, "GMW-PROOF-INVALID", "must be distinguishable from an ordinary signature-verification failure");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent", "a refused install must leave no window record behind");
  });

  // ---- NVA-GMWFIX-3 (PO decision, 2026-08-17, Option A): tolerate an intervening
  // commit whose own changed files stay entirely within the window's own already-
  // signed scope -- the same idempotency reasoning that already made an unrelated FILE
  // write safe (GMW19/NVA-BL-73), extended to an actual COMMIT landing between prepare
  // and install. `livePluginRoot` is nested INSIDE the git repository for these checks
  // (unlike the disjoint `pluginRootFixture()` used elsewhere in this suite) because a
  // commit inside `root` can only ever touch GS-6 scope when the live plugin root is
  // physically part of the same repository -- exactly the self-hosted layout this
  // defect was filed from (AFK Goldfish dispatches editing this very repository's own
  // plugins/pipeline-core tree).
  function nestedPluginFixture(root) {
    const plugin = join(root, "plugins", "pipeline-core");
    mkdirSync(join(plugin, "hooks"), { recursive: true });
    writeFileSync(join(plugin, "hooks", "guard-example.mjs"), "// example\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "plugin scaffold"], { cwd: root });
    return plugin;
  }

  check("GMW33 install now tolerates a new commit landing between prepare and install, PROVIDED its only changed file is inside the window's own already-signed GS-6 scope", () => {
    const root = repoFixture("gmw-tolerate-commit-");
    const plugin = nestedPluginFixture(root);
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "in-scope commit must not void the signature", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    const preparedCommit = request.intent.value.candidate.commit;

    // A genuine new commit lands on HEAD, touching ONLY a file inside the window's own
    // signed GS-6 scope (the live plugin root).
    writeFileSync(join(plugin, "hooks", "guard-example.mjs"), "// example, updated by a briefed dispatch\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "in-scope plugin edit"], { cwd: root });
    const newCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    assert.notEqual(newCommit, preparedCommit, "the fixture must really have moved to a new commit, or this test proves nothing");

    const installed = installGuardMaintenanceWindow({
      rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin,
    });
    assert.equal(installed.status, "active", "an intervening commit entirely within the window's own signed scope must not void the signature");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "active");
  });

  check("GMW34 install still refuses an intervening commit that ALSO touches a file OUTSIDE the window's own scope -- the tolerance must not weaken this", () => {
    const root = repoFixture("gmw-outofscope-commit-");
    const plugin = nestedPluginFixture(root);
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "mixed-scope commit must still refuse", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    // Changes both an in-scope plugin file AND an out-of-scope repository file, in the
    // SAME commit -- one out-of-scope file must be enough to void the whole commit.
    writeFileSync(join(plugin, "hooks", "guard-example.mjs"), "// in-scope edit\n");
    writeFileSync(join(root, "README.md"), "# fixture, out-of-scope edit\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "mixed scope"], { cwd: root });

    let error;
    try {
      installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin });
    } catch (caught) { error = caught; }
    assert.ok(error instanceof GuardMaintenanceWindowError, "a commit touching even one out-of-scope file must still refuse");
    assert.equal(error.code, "GMW-CANDIDATE-COMMIT-MISMATCH");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent", "a refused install must leave no window record behind");
  });

  check("GMW35 install refuses when a MERGE commit lands between prepare and install, even when every file it touches is inside scope -- fails closed rather than trusting a multi-parent commit", () => {
    const root = repoFixture("gmw-merge-commit-");
    const plugin = nestedPluginFixture(root);
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "merge commit must still refuse", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    const mainBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    execFileSync("git", ["checkout", "-q", "-b", "side"], { cwd: root });
    writeFileSync(join(plugin, "hooks", "side-file.mjs"), "// side branch, in scope\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "side branch edit"], { cwd: root });

    execFileSync("git", ["checkout", "-q", mainBranch], { cwd: root });
    writeFileSync(join(plugin, "hooks", "main-file.mjs"), "// main branch, in scope\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "main branch edit"], { cwd: root });
    execFileSync("git", ["merge", "-q", "--no-ff", "-m", "merge side into main", "side"], { cwd: root });

    let error;
    try {
      installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin });
    } catch (caught) { error = caught; }
    assert.ok(error instanceof GuardMaintenanceWindowError, "a merge commit anywhere in the intervening range must still refuse");
    assert.equal(error.code, "GMW-CANDIDATE-COMMIT-MISMATCH");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent");
  });

  check("GMW36 install refuses when the tolerance check's own git invocation fails, never admitting on an unusable range", () => {
    const root = repoFixture("gmw-tolerance-git-fail-");
    const plugin = nestedPluginFixture(root);
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "tolerance check git failure", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    writeFileSync(join(plugin, "hooks", "guard-example.mjs"), "// in-scope edit\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "in-scope plugin edit"], { cwd: root });

    const brokenMergeBase = (command, args, options) => {
      if (command === "git" && args[0] === "merge-base") return { status: 1, stdout: "", stderr: "simulated failure", error: null };
      return spawnSync(command, args, options);
    };

    let error;
    try {
      installGuardMaintenanceWindow({
        rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin, spawn: brokenMergeBase,
      });
    } catch (caught) { error = caught; }
    assert.ok(error instanceof GuardMaintenanceWindowError, "a failed tolerance-check git invocation must refuse install, not admit it");
    assert.equal(error.code, "GMW-CANDIDATE-COMMIT-MISMATCH");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent");
  });

  check("GMW37 install refuses an intervening commit that RENAMES a file within scope -- fails closed rather than trusting rename detection, even though both halves are individually in-scope", () => {
    const root = repoFixture("gmw-rename-commit-");
    const plugin = nestedPluginFixture(root);
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "rename must still refuse", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });
    execFileSync(
      "git",
      ["mv", "plugins/pipeline-core/hooks/guard-example.mjs", "plugins/pipeline-core/hooks/guard-example-renamed.mjs"],
      { cwd: root },
    );
    execFileSync("git", ["commit", "-q", "-m", "rename in-scope file"], { cwd: root });

    let error;
    try {
      installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin });
    } catch (caught) { error = caught; }
    assert.ok(error instanceof GuardMaintenanceWindowError, "a rename between prepare and install must still refuse");
    assert.equal(error.code, "GMW-CANDIDATE-COMMIT-MISMATCH");
    assert.equal(currentGuardMaintenanceWindow({ rootDir: root }).status, "absent");
  });

  check("GMW38 install tolerates an intervening commit whose only changed file matches the window's own signed TP-* scope, reusing guard-testpath.mjs's own protectedTestPaths config rather than a new mapping", () => {
    const root = repoFixture("gmw-tolerate-tp-commit-");
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "guard-config.json"),
      JSON.stringify({ protectedTestPaths: [{ id: "TP-9", pattern: "special-protected\\.mjs$" }] }),
    );
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "add guard-config"], { cwd: root });

    // Disjoint from `root`: only GS-6 could ever cover it, and GS-6 is not in this
    // window's scope, so this fixture proves the TP-9 path alone carries the tolerance.
    const plugin = pluginRootFixture();
    const { planSha256, specSha256 } = planSpecShas(root);
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["TP-9"], ttlSeconds: 300, reason: "in-scope TP-9 commit must not void the signature", featureId: "f",
      planSha256, specSha256, policyRevision: "gmw-test-v1", livePluginRoot: plugin,
    });

    writeFileSync(join(root, "special-protected.mjs"), "// protected test file\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "add TP-9-matching file"], { cwd: root });

    const installed = installGuardMaintenanceWindow({
      rootDir: root, request, trustPolicy, proof: proofFor(intent), livePluginRoot: plugin,
    });
    assert.equal(installed.status, "active", "a commit whose only changed file matches the window's own signed TP-9 pattern must not void the signature");
  });

  console.log(`\nguard-maintenance-window: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
