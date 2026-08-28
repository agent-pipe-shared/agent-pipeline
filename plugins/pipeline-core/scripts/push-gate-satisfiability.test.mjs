#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression suite for `push-gate-satisfiability.mjs` (NVA-B-PUSHPREFLIGHT).
 *
 * Every precondition check takes injected dependencies (`readFile`,
 * `resolveAuthorityArtifactPath`, `checkEvidenceFreshness`,
 * `checkCriticalHumanProofPolicy`, `checkPushThreatModel`, `resolveHeadCommit`,
 * `resolveGitCommonDir`, `readdir`, `now`), mirroring `push-prepare.test.mjs`'s own
 * discipline: a fixture never has to be a real Git working tree with real evidence
 * files. The one exception is the read-only-invariant test near the bottom, which runs
 * the real CLI against THIS repository (read-only by construction) and asserts the
 * working tree is byte-identical before and after.
 *
 * Run: node --test plugins/pipeline-core/scripts/push-gate-satisfiability.test.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assessPushGateSatisfiability,
  checkPushThreatModelMaterialized,
  checkSignatureWindow,
  checkTrustAnchorPresent,
  checkVerifyContractConfigured,
  checkVerifyEvidenceBound,
  parseArgs,
  resolveGitCommonDir,
  SCHEMA,
  USAGE,
} from "./push-gate-satisfiability.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const FIXTURE_DIR = mkdtempSync(join(SCRATCH, "push-gate-satisfiability-"));
after(() => rmSync(FIXTURE_DIR, { recursive: true, force: true }));

const HEAD = "1a757618133eb27b62f1e427b2fb55895da42d85";

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

test("parseArgs: accepts --root and resolves it", () => {
  const parsed = parseArgs(["--root", FIXTURE_DIR]);
  assert.equal(parsed.root, FIXTURE_DIR);
});

test("parseArgs: refuses a missing --root", () => {
  assert.ok(parseArgs([]).error);
});

test("parseArgs: refuses an empty --root", () => {
  assert.ok(parseArgs(["--root", ""]).error);
});

// ---------------------------------------------------------------------------
// checkVerifyContractConfigured -- precondition 1
// ---------------------------------------------------------------------------

test("checkVerifyContractConfigured: no calibration -> status missing, ok:false", () => {
  const result = checkVerifyContractConfigured(FIXTURE_DIR, {
    resolveAuthorityArtifactPath: () => ({ exists: false }),
  });
  assert.equal(result.status, "missing");
  assert.equal(result.ok, false);
});

test("checkVerifyContractConfigured: calibration names the UNCONFIGURED_VERIFY placeholder -> status placeholder, ok:false", () => {
  const result = checkVerifyContractConfigured(FIXTURE_DIR, {
    resolveAuthorityArtifactPath: () => ({ exists: true, path: "project/pipeline.json" }),
    readFile: () => JSON.stringify({
      verify: "node -e \"console.error('pipeline: the verify contract of this project is not configured. Replace the verify command in project/pipeline.json with the real verification command for this project (for example its test suite), then run verify again.'); process.exit(1)\"",
    }),
  });
  assert.equal(result.status, "placeholder");
  assert.equal(result.ok, false);
});

test("checkVerifyContractConfigured: blank verify field -> status missing, ok:false", () => {
  const result = checkVerifyContractConfigured(FIXTURE_DIR, {
    resolveAuthorityArtifactPath: () => ({ exists: true, path: "project/pipeline.json" }),
    readFile: () => JSON.stringify({ verify: "   " }),
  });
  assert.equal(result.status, "missing");
  assert.equal(result.ok, false);
});

test("checkVerifyContractConfigured: a real command -> status configured, ok:true", () => {
  const result = checkVerifyContractConfigured(FIXTURE_DIR, {
    resolveAuthorityArtifactPath: () => ({ exists: true, path: "project/pipeline.json" }),
    readFile: () => JSON.stringify({ verify: "npm test" }),
  });
  assert.equal(result.status, "configured");
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// checkVerifyEvidenceBound -- precondition 2 (reuses push-prepare.mjs's checkEvidenceFreshness)
// ---------------------------------------------------------------------------

test("checkVerifyEvidenceBound: missing evidence -> status missing, ok:false", () => {
  const result = checkVerifyEvidenceBound(FIXTURE_DIR, HEAD, {
    readFile: () => { throw new Error("ENOENT"); },
  });
  assert.equal(result.status, "missing");
  assert.equal(result.ok, false);
});

test("checkVerifyEvidenceBound: non-zero exitCode -> status verify-failed, ok:false", () => {
  const result = checkVerifyEvidenceBound(FIXTURE_DIR, HEAD, {
    readFile: () => JSON.stringify({ exitCode: 2, commit: HEAD }),
  });
  assert.equal(result.status, "verify-failed");
  assert.equal(result.ok, false);
});

test("checkVerifyEvidenceBound: stale commit -> status stale-commit, ok:false", () => {
  const result = checkVerifyEvidenceBound(FIXTURE_DIR, HEAD, {
    readFile: () => JSON.stringify({ exitCode: 0, commit: "deadbeef" }),
  });
  assert.equal(result.status, "stale-commit");
  assert.equal(result.ok, false);
});

test("checkVerifyEvidenceBound: fresh and bound -> status fresh-and-bound, ok:true", () => {
  const result = checkVerifyEvidenceBound(FIXTURE_DIR, HEAD, {
    readFile: () => JSON.stringify({ exitCode: 0, commit: HEAD }),
  });
  assert.equal(result.status, "fresh-and-bound");
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// checkTrustAnchorPresent -- precondition 3 (reuses push-prepare.mjs's checkCriticalHumanProofPolicy)
// ---------------------------------------------------------------------------

test("checkTrustAnchorPresent: unrestricted posture -> status unrestricted, ok:true", () => {
  const result = checkTrustAnchorPresent(FIXTURE_DIR, {
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [] }),
    parseHumanArgs: () => ({ directory: FIXTURE_DIR }),
    exists: () => false,
  });
  assert.equal(result.status, "unrestricted");
  assert.equal(result.ok, true);
});

test("checkTrustAnchorPresent: pinned set, local key IS a member -> status pinned-member, ok:true", () => {
  const anchor = { keyReference: "local-po-key", publicKeySha256: "a".repeat(64) };
  const result = checkTrustAnchorPresent(FIXTURE_DIR, {
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [anchor] }),
    parseHumanArgs: () => ({ directory: FIXTURE_DIR }),
    exists: () => true,
    readFile: () => JSON.stringify({ ...anchor, humanName: "Test Human" }),
  });
  assert.equal(result.status, "pinned-member");
  assert.equal(result.ok, true);
});

test("checkTrustAnchorPresent: pinned set, local key is NOT a member -> status not-member, ok:false", () => {
  const anchor = { keyReference: "local-po-key", publicKeySha256: "a".repeat(64) };
  const result = checkTrustAnchorPresent(FIXTURE_DIR, {
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [anchor] }),
    parseHumanArgs: () => ({ directory: FIXTURE_DIR }),
    exists: () => true,
    readFile: () => JSON.stringify({ keyReference: "other-key", publicKeySha256: "b".repeat(64), humanName: "Someone Else" }),
  });
  assert.equal(result.status, "not-member");
  assert.equal(result.ok, false);
});

test("checkTrustAnchorPresent: unreadable policy file -> status policy-unreadable, ok:false", () => {
  const result = checkTrustAnchorPresent(FIXTURE_DIR, {
    readCriticalHumanProofPolicy: () => ({ ok: false, code: "CRITICAL-PROOF-POLICY-UNREADABLE" }),
  });
  assert.equal(result.status, "policy-unreadable");
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// checkPushThreatModelMaterialized -- precondition 4 (reuses push-prepare.mjs's checkPushThreatModel)
// ---------------------------------------------------------------------------

test("checkPushThreatModelMaterialized: absent -> status absent, ok:false", () => {
  const result = checkPushThreatModelMaterialized(FIXTURE_DIR, { exists: () => false });
  assert.equal(result.status, "absent");
  assert.equal(result.ok, false);
});

test("checkPushThreatModelMaterialized: present -> status present, ok:true", () => {
  const result = checkPushThreatModelMaterialized(FIXTURE_DIR, { exists: () => true });
  assert.equal(result.status, "present");
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// checkSignatureWindow -- precondition 5, the deep-tier reason: an armed capability whose
// window has already closed must be its own typed status, not a generic failure, and must
// be caught WITHOUT trusting the capability's own self-reported "armed" status -- exactly
// the comparison `authorizeHumanGuardOverrideBySignature()` skips.
// ---------------------------------------------------------------------------

test("checkSignatureWindow: no git-common-dir resolvable -> status unreadable, ok:true (advisory, non-blocking)", () => {
  const result = checkSignatureWindow(FIXTURE_DIR, { resolveGitCommonDir: () => null });
  assert.equal(result.status, "unreadable");
  assert.equal(result.ok, true);
});

test("checkSignatureWindow: no capability store -> status none-pending, ok:true", () => {
  const result = checkSignatureWindow(FIXTURE_DIR, {
    resolveGitCommonDir: () => "/nonexistent-git-common-dir",
    readdir: () => { throw new Error("ENOENT"); },
  });
  assert.equal(result.status, "none-pending");
  assert.equal(result.ok, true);
});

test("checkSignatureWindow: an armed capability self-reporting \"armed\" past its own expiresAt -> status expired-armed-capability, ok:false (THE confirmed defect)", () => {
  const now = Date.parse("2026-08-28T10:10:00.000Z");
  const result = checkSignatureWindow(FIXTURE_DIR, {
    resolveGitCommonDir: () => "/fake-common-dir",
    readdir: () => ["cap1.json"],
    readFile: () => JSON.stringify({ status: "armed", expiresAt: "2026-08-28T09:47:32.000Z" }),
    now: () => now,
  });
  assert.equal(result.status, "expired-armed-capability");
  assert.equal(result.ok, false);
  assert.match(result.message, /window closed at/);
});

test("checkSignatureWindow: an armed capability with less than the safety margin remaining -> status near-expiry, ok:false", () => {
  const now = Date.parse("2026-08-28T10:00:00.000Z");
  const result = checkSignatureWindow(FIXTURE_DIR, {
    resolveGitCommonDir: () => "/fake-common-dir",
    readdir: () => ["cap1.json"],
    readFile: () => JSON.stringify({ status: "armed", expiresAt: "2026-08-28T10:01:00.000Z" }), // 60s remaining, well under the 5-minute margin
    now: () => now,
  });
  assert.equal(result.status, "near-expiry");
  assert.equal(result.ok, false);
});

test("checkSignatureWindow: an armed capability with ample time remaining -> status healthy, ok:true", () => {
  const now = Date.parse("2026-08-28T10:00:00.000Z");
  const result = checkSignatureWindow(FIXTURE_DIR, {
    resolveGitCommonDir: () => "/fake-common-dir",
    readdir: () => ["cap1.json"],
    readFile: () => JSON.stringify({ status: "armed", expiresAt: "2026-08-28T10:30:00.000Z" }),
    now: () => now,
  });
  assert.equal(result.status, "healthy");
  assert.equal(result.ok, true);
});

test("checkSignatureWindow: a non-armed (consumed) capability is skipped, not flagged -> status none-pending, ok:true", () => {
  const result = checkSignatureWindow(FIXTURE_DIR, {
    resolveGitCommonDir: () => "/fake-common-dir",
    readdir: () => ["cap1.json"],
    readFile: () => JSON.stringify({ status: "consumed", expiresAt: "2020-01-01T00:00:00.000Z" }),
    now: () => Date.now(),
  });
  assert.equal(result.status, "none-pending");
  assert.equal(result.ok, true);
});

test("checkSignatureWindow: an unreadable/malformed capability entry is skipped, not treated as a hazard", () => {
  const result = checkSignatureWindow(FIXTURE_DIR, {
    resolveGitCommonDir: () => "/fake-common-dir",
    readdir: () => ["cap1.json"],
    readFile: () => "{ not valid json",
    now: () => Date.now(),
  });
  assert.equal(result.status, "none-pending");
  assert.equal(result.ok, true);
});

test("checkSignatureWindow: the worst of multiple capabilities wins (expired beats healthy)", () => {
  const now = Date.parse("2026-08-28T10:10:00.000Z");
  const files = { "cap-healthy.json": { status: "armed", expiresAt: "2026-08-28T11:00:00.000Z" }, "cap-expired.json": { status: "armed", expiresAt: "2026-08-28T09:00:00.000Z" } };
  const result = checkSignatureWindow(FIXTURE_DIR, {
    resolveGitCommonDir: () => "/fake-common-dir",
    readdir: () => Object.keys(files),
    readFile: (path) => JSON.stringify(files[path.split("/").pop()]),
    now: () => now,
  });
  assert.equal(result.status, "expired-armed-capability");
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// assessPushGateSatisfiability -- D1: own schema, per-precondition typed status, D3: each
// unmet precondition named specifically, and D4's all-green case.
// ---------------------------------------------------------------------------

function greenDeps(overrides = {}) {
  return {
    resolveHeadCommit: () => HEAD,
    resolveAuthorityArtifactPath: () => ({ exists: true, path: "project/pipeline.json" }),
    readFile: (path) => {
      if (String(path).endsWith("pipeline.json")) return JSON.stringify({ verify: "npm test" });
      return JSON.stringify({ exitCode: 0, commit: HEAD });
    },
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [] }),
    parseHumanArgs: () => ({ directory: FIXTURE_DIR }),
    exists: () => true,
    resolveGitCommonDir: () => null,
    ...overrides,
  };
}

test("assessPushGateSatisfiability: all-green case -> satisfiable:true, schema present, every check ok", () => {
  const result = assessPushGateSatisfiability(["--root", FIXTURE_DIR], greenDeps());
  assert.equal(result.ok, true);
  assert.equal(result.report.schema, SCHEMA);
  assert.equal(result.report.satisfiable, true);
  assert.equal(result.report.checks.length, 5);
  for (const check of result.report.checks) assert.equal(check.ok, true, `expected ${check.id} to be ok`);
});

test("assessPushGateSatisfiability: HEAD unresolvable -> verify-evidence-bound is head-unresolved, satisfiable:false", () => {
  const result = assessPushGateSatisfiability(["--root", FIXTURE_DIR], greenDeps({ resolveHeadCommit: () => null }));
  assert.equal(result.report.headCommit, null);
  assert.equal(result.report.satisfiable, false);
  const evidence = result.report.checks.find((c) => c.id === "verify-evidence-bound");
  assert.equal(evidence.status, "head-unresolved");
});

test("assessPushGateSatisfiability: each unmet precondition is named specifically -- a threat-model-only failure names ONLY that check", () => {
  const result = assessPushGateSatisfiability(["--root", FIXTURE_DIR], greenDeps({ exists: (path) => !String(path).includes("push-threat-model") }));
  assert.equal(result.report.satisfiable, false);
  const failing = result.report.checks.filter((c) => !c.ok);
  assert.equal(failing.length, 1);
  assert.equal(failing[0].id, "push-threat-model-materialized");
  assert.equal(failing[0].status, "absent");
});

test("assessPushGateSatisfiability: an expired-armed signature window alone flips satisfiable:false, named specifically", () => {
  const now = Date.parse("2026-08-28T10:10:00.000Z");
  const result = assessPushGateSatisfiability(["--root", FIXTURE_DIR], greenDeps({
    resolveGitCommonDir: () => "/fake-common-dir",
    readdir: () => ["cap1.json"],
    now: () => now,
    // the shared readFile above must still serve pipeline.json/evidence.json AND the capability file
    readFile: (path) => {
      const name = String(path);
      if (name.endsWith("pipeline.json")) return JSON.stringify({ verify: "npm test" });
      if (name.endsWith("cap1.json")) return JSON.stringify({ status: "armed", expiresAt: "2026-08-28T09:47:32.000Z" });
      return JSON.stringify({ exitCode: 0, commit: HEAD });
    },
  }));
  assert.equal(result.report.satisfiable, false);
  const failing = result.report.checks.filter((c) => !c.ok);
  assert.equal(failing.length, 1);
  assert.equal(failing[0].id, "signature-window");
  assert.equal(failing[0].status, "expired-armed-capability");
});

test("assessPushGateSatisfiability: usage error on a missing --root", () => {
  const result = assessPushGateSatisfiability([], {});
  assert.equal(result.ok, false);
  assert.ok(result.error.startsWith(USAGE));
});

// ---------------------------------------------------------------------------
// D2: strictly read-only -- capture the working-tree state before and after a real,
// unmocked CLI invocation against this repository and require them identical.
// ---------------------------------------------------------------------------

test("read-only invariant: a real CLI run against this repository leaves the working tree byte-identical", () => {
  const before = spawnSync("git", ["-C", REPO_ROOT, "status", "--porcelain=v1"], { encoding: "utf8" }).stdout;
  const scriptPath = join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "push-gate-satisfiability.mjs");
  const run = spawnSync(process.execPath, [scriptPath, "--root", REPO_ROOT], { encoding: "utf8" });
  assert.ok(run.status === 0 || run.status === 1, `expected exit 0 or 1, got ${run.status}: ${run.stderr}`);
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(run.stdout); });
  assert.equal(parsed.schema, SCHEMA);
  const after = spawnSync("git", ["-C", REPO_ROOT, "status", "--porcelain=v1"], { encoding: "utf8" }).stdout;
  assert.equal(after, before, "push-gate-satisfiability.mjs must never change the working-tree status");
});

// ---------------------------------------------------------------------------
// resolveGitCommonDir -- read-only helper
// ---------------------------------------------------------------------------

test("resolveGitCommonDir: a directory outside any git repository resolves to null", () => {
  // Deliberately outside this repository's own tree (not nested under FIXTURE_DIR/scratch,
  // which IS inside this repo and would resolve to ITS git-common-dir) -- a genuinely
  // unrelated directory under the OS temp root.
  const outside = mkdtempSync(join(tmpdir(), "push-gate-satisfiability-no-git-"));
  after(() => rmSync(outside, { recursive: true, force: true }));
  const result = resolveGitCommonDir(outside, {});
  assert.equal(result, null);
});

test("resolveGitCommonDir: this repository resolves to a real, existing path", () => {
  const result = resolveGitCommonDir(REPO_ROOT, {});
  assert.ok(typeof result === "string" && result.length > 0);
});
