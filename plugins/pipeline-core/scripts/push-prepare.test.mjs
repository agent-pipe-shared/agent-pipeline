#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression suite for `push-prepare.mjs` (NVA-PUSH-PREPARE).
 *
 * Fixtures live under temporary directories (`scratch/push-prepare-*`), never
 * against the real repository state: every precondition check takes injected
 * dependencies (`gitStatus`, `gitHead`, `readFile`, `exists`,
 * `readCriticalHumanProofPolicy`, `parseHumanArgs`, `readState`, ...), so a
 * fixture never has to be a real Git working tree with real evidence files.
 *
 * The one exception, by design, is the D3 hash-equality test at the bottom:
 * it runs `preparePushSubject()` against THIS repository's real HEAD and
 * separately spawns the real `pipeline-state.mjs prepare-push-subject` CLI as
 * a subprocess, and asserts the two `subjectSha256` values are identical --
 * proving the reuse this script's header comment promises, not merely
 * asserting it by construction. It is read-only and does not pin an exact
 * digest (HEAD is mutable), only equality between the two routes.
 *
 * Run: node --test plugins/pipeline-core/scripts/push-prepare.test.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkCriticalHumanProofPolicy,
  checkEvidenceFreshness,
  checkPushThreatModel,
  checkWorkingTreeClean,
  criticalArtifactPaths,
  isSecurityGateActive,
  parseArgs,
  preparePushSubject,
  pushPrepareReport,
  renderF7Lines,
  resolveFeatureContext,
  resolveVerifyRemedy,
  segmentsForNodeCommand,
} from "./push-prepare.mjs";
import { authorizeRecordedPush } from "../lib/critical-action-authorization.mjs";
import { VERIFY_EVIDENCE_DEFAULT_PATH } from "../lib/verify-evidence-path.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const FIXTURE_DIR = mkdtempSync(join(SCRATCH, "push-prepare-"));
after(() => rmSync(FIXTURE_DIR, { recursive: true, force: true }));

const HEAD = "1a757618133eb27b62f1e427b2fb55895da42d85";

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

test("parseArgs: accepts a well-formed --by/--remote/--destination", () => {
  const parsed = parseArgs(["--by", "tester", "--remote", "origin", "--destination", "refs/heads/main"]);
  assert.deepEqual(parsed, { by: "tester", remote: "origin", destination: "refs/heads/main" });
});

test("parseArgs: refuses a missing --by", () => {
  const parsed = parseArgs(["--remote", "origin", "--destination", "refs/heads/main"]);
  assert.ok(parsed.error);
});

test("parseArgs: refuses an unsafe --remote", () => {
  const parsed = parseArgs(["--by", "tester", "--remote", "o r i g i n", "--destination", "refs/heads/main"]);
  assert.ok(parsed.error);
});

test("parseArgs: refuses a --destination that is not refs/heads/*", () => {
  const parsed = parseArgs(["--by", "tester", "--remote", "origin", "--destination", "refs/tags/v1"]);
  assert.ok(parsed.error);
});

// ---------------------------------------------------------------------------
// D2 -- each precondition, met and unmet, each unmet result carrying a remedy
// ---------------------------------------------------------------------------

test("checkWorkingTreeClean: met -> ok, unmet -> ok:false with remedy", () => {
  assert.equal(checkWorkingTreeClean(FIXTURE_DIR, { gitStatus: () => "" }).ok, true);
  const dirty = checkWorkingTreeClean(FIXTURE_DIR, { gitStatus: () => " M some/file.mjs\n" });
  assert.equal(dirty.ok, false);
  assert.ok(dirty.remedy);
});

test("checkWorkingTreeClean: git failure -> ok:false with remedy", () => {
  const result = checkWorkingTreeClean(FIXTURE_DIR, { gitStatus: () => null });
  assert.equal(result.ok, false);
  assert.ok(result.remedy);
});

test("checkEvidenceFreshness: missing file -> ok:false with remedy", () => {
  const result = checkEvidenceFreshness("verify-evidence", "evidence/verify-latest.json", FIXTURE_DIR, HEAD, {
    readFile: () => { throw new Error("ENOENT"); },
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /missing or unreadable/);
  assert.ok(result.remedy);
});

test("checkEvidenceFreshness: non-zero exitCode -> ok:false with remedy", () => {
  const result = checkEvidenceFreshness("verify-evidence", "evidence/verify-latest.json", FIXTURE_DIR, HEAD, {
    readFile: () => JSON.stringify({ exitCode: 2, commit: HEAD }),
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /exitCode/);
  assert.ok(result.remedy);
});

test("checkEvidenceFreshness: stale commit -> ok:false with remedy", () => {
  const result = checkEvidenceFreshness("verify-evidence", "evidence/verify-latest.json", FIXTURE_DIR, HEAD, {
    readFile: () => JSON.stringify({ exitCode: 0, commit: "deadbeef" }),
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /stale/);
  assert.ok(result.remedy);
});

test("checkEvidenceFreshness: exitCode 0 and matching commit -> ok:true", () => {
  const result = checkEvidenceFreshness("verify-evidence", "evidence/verify-latest.json", FIXTURE_DIR, HEAD, {
    readFile: () => JSON.stringify({ exitCode: 0, commit: HEAD }),
  });
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// NVA-PP-FIX D1/D2 -- resolveVerifyRemedy reads the project's OWN calibrated
// verify command, never a hardcoded source-only path (AC-11).
// ---------------------------------------------------------------------------

test("resolveVerifyRemedy (D1): resolves from the project's own calibration verify key", () => {
  const remedy = resolveVerifyRemedy(FIXTURE_DIR, "evidence/verify-latest.json", {
    resolveAuthorityArtifactPath: () => ({ exists: true, path: "/fixture/.claude/pipeline.json" }),
    readFile: () => JSON.stringify({ verify: "node custom/verify.mjs" }),
  });
  assert.equal(remedy, "node custom/verify.mjs  # regenerates evidence/verify-latest.json");
});

test("resolveVerifyRemedy (D2): no calibration resolves -> honest degradation, never a source-only path", () => {
  const remedy = resolveVerifyRemedy(FIXTURE_DIR, "evidence/verify-latest.json", {
    resolveAuthorityArtifactPath: () => ({ exists: false }),
  });
  assert.match(remedy, /calibrated verify command/);
  assert.match(remedy, /does not define one/);
  assert.doesNotMatch(remedy, /harness\//);
});

test("resolveVerifyRemedy (D2): calibration present but no verify key -> honest degradation", () => {
  const remedy = resolveVerifyRemedy(FIXTURE_DIR, "evidence/verify-latest.json", {
    resolveAuthorityArtifactPath: () => ({ exists: true, path: "/fixture/.claude/pipeline.json" }),
    readFile: () => JSON.stringify({ project: "consumer-project" }),
  });
  assert.match(remedy, /calibrated verify command/);
  assert.doesNotMatch(remedy, /harness\//);
});

test("resolveVerifyRemedy (D2): unreadable calibration -> honest degradation, never invents a command", () => {
  const remedy = resolveVerifyRemedy(FIXTURE_DIR, "evidence/verify-latest.json", {
    resolveAuthorityArtifactPath: () => ({ exists: true, path: "/fixture/.claude/pipeline.json" }),
    readFile: () => { throw new Error("ENOENT"); },
  });
  assert.match(remedy, /calibrated verify command/);
  assert.doesNotMatch(remedy, /harness\//);
});

test("checkEvidenceFreshness (D1): remedy comes from the injected calibration resolver, not a hardcoded path", () => {
  const result = checkEvidenceFreshness("verify-evidence", "evidence/verify-latest.json", FIXTURE_DIR, HEAD, {
    readFile: (path) => {
      if (String(path).endsWith("verify-latest.json")) throw new Error("ENOENT");
      return JSON.stringify({ verify: "node custom/verify.mjs" });
    },
    resolveAuthorityArtifactPath: () => ({ exists: true, path: "/fixture/.claude/pipeline.json" }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.remedy, "node custom/verify.mjs  # regenerates evidence/verify-latest.json");
});

test("checkPushThreatModel: absent -> ok:false with materialize remedy; present -> ok:true", () => {
  const missing = checkPushThreatModel(FIXTURE_DIR, { exists: () => false });
  assert.equal(missing.ok, false);
  assert.match(missing.remedy, /materialize-push-threat-model/);
  const present = checkPushThreatModel(FIXTURE_DIR, { exists: () => true });
  assert.equal(present.ok, true);
});

test("checkCriticalHumanProofPolicy: unrestricted posture (no trust anchors) -> ok:true", () => {
  const result = checkCriticalHumanProofPolicy(FIXTURE_DIR, {
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [] }),
    parseHumanArgs: () => ({ directory: FIXTURE_DIR }),
    exists: () => false,
  });
  assert.equal(result.ok, true);
  assert.match(result.message, /unrestricted/);
});

test("checkCriticalHumanProofPolicy: pinned set, local key IS a member -> ok:true", () => {
  const anchor = { keyReference: "local-po-key", publicKeySha256: "a".repeat(64) };
  const result = checkCriticalHumanProofPolicy(FIXTURE_DIR, {
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [anchor] }),
    parseHumanArgs: () => ({ directory: FIXTURE_DIR }),
    exists: () => true,
    readFile: () => JSON.stringify({ ...anchor, humanName: "Test Human" }),
  });
  assert.equal(result.ok, true);
  assert.match(result.message, /IS a member/);
});

test("checkCriticalHumanProofPolicy: pinned set, local key is NOT a member -> ok:false with remedy", () => {
  const anchor = { keyReference: "local-po-key", publicKeySha256: "a".repeat(64) };
  const result = checkCriticalHumanProofPolicy(FIXTURE_DIR, {
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [anchor] }),
    parseHumanArgs: () => ({ directory: FIXTURE_DIR }),
    exists: () => true,
    readFile: () => JSON.stringify({ keyReference: "other-key", publicKeySha256: "b".repeat(64), humanName: "Someone Else" }),
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /NOT a member/);
  assert.ok(result.remedy);
});

test("checkCriticalHumanProofPolicy: pinned set, directory unresolved -> ok:false with setup remedy", () => {
  const anchor = { keyReference: "local-po-key", publicKeySha256: "a".repeat(64) };
  const result = checkCriticalHumanProofPolicy(FIXTURE_DIR, {
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [anchor] }),
    parseHumanArgs: () => ({ error: "approval directory is required" }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.remedy);
});

test("checkCriticalHumanProofPolicy: unreadable policy file -> ok:false", () => {
  const result = checkCriticalHumanProofPolicy(FIXTURE_DIR, {
    readCriticalHumanProofPolicy: () => ({ ok: false, code: "CRITICAL-PROOF-POLICY-UNREADABLE" }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.remedy);
});

// ---------------------------------------------------------------------------
// NVA-N-PUSHDIAG (b) -- a v1/v2 document with NO trustAnchor must read as
// "route unavailable" here, exactly as `trustAnchorsFor()`
// (../lib/critical-action-authorization.mjs) already reads it -- never as the
// v3-empty-set "unrestricted" posture. This was the two-readers disagreement:
// this reader used to fold "no set concept at all" and "explicit empty v3 set"
// into the same `[]` and report green for both.
// ---------------------------------------------------------------------------

test("checkCriticalHumanProofPolicy: v1/v2 document with no trustAnchor -> ok:false, unavailable (NOT unrestricted)", () => {
  const result = checkCriticalHumanProofPolicy(FIXTURE_DIR, {
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: null }),
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /unavailable/);
  assert.doesNotMatch(result.message, /unrestricted/);
  assert.ok(result.remedy);
});

// ---------------------------------------------------------------------------
// NVA-N-PUSHDIAG (DoD 1/2) -- ONE fixture policy document, driven through BOTH
// readers (this script's checkCriticalHumanProofPolicy and the authorization
// path's exported authorizeRecordedPush), asserting they agree. Each reader
// being independently correct is exactly what let them disagree before this
// fix; a fixture-level agreement test is the point, not a detail.
// ---------------------------------------------------------------------------

const FIXED_CANDIDATE = { commit: "1".repeat(40), tree: "2".repeat(40) };
function agreementFixtureDir(name) {
  const dir = mkdtempSync(join(SCRATCH, `push-prepare-agree-${name}-`));
  after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "project"), { recursive: true });
  return dir;
}
function agreementAuthorize(dir) {
  // No approval is recorded at all -- irrelevant to the trust-anchor step, which
  // `authorizeRecordedPush` checks FIRST, before it ever looks at `state.pushApproval`.
  return authorizeRecordedPush({
    projectDir: dir, anchorDir: dir, state: {}, candidate: FIXED_CANDIDATE,
    remote: "origin", destination: "refs/heads/main", now: new Date().toISOString(),
  });
}

test("agreement: v1 document, no trustAnchor field -> BOTH readers refuse the route as unavailable", () => {
  const dir = agreementFixtureDir("v1-no-anchor");
  writeFileSync(
    join(dir, "project", "critical-human-proof.json"),
    JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"] }),
  );
  const prepared = checkCriticalHumanProofPolicy(dir);
  const authorized = agreementAuthorize(dir);
  assert.equal(prepared.ok, false, "push-prepare must refuse a v1 document with no trustAnchor");
  assert.equal(authorized.authorized, false, "the authorization path must refuse the identical document");
  assert.equal(authorized.code, "PUSH-PROOF-TRUST-ANCHOR-MISSING");
  assert.match(prepared.message, /unavailable/);
});

test("agreement: v3 document, explicit EMPTY trustAnchors -> BOTH readers call it unrestricted, but the push still fails closed", () => {
  const dir = agreementFixtureDir("v3-empty");
  writeFileSync(
    join(dir, "project", "critical-human-proof.json"),
    JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [] }),
  );
  // Hermetic like the pre-existing "unrestricted posture" test above: never touch a real
  // local approval directory, only this fixture.
  const prepared = checkCriticalHumanProofPolicy(dir, { parseHumanArgs: () => ({ directory: dir }), exists: () => false });
  const authorized = agreementAuthorize(dir);
  assert.equal(prepared.ok, true, "push-prepare must call an explicit empty v3 set unrestricted");
  assert.match(prepared.message, /unrestricted/);
  // The empty set must NOT become "any push is authorized": with no approval recorded at
  // all, the route is open to any well-formed KEY, but this specific push still has nothing
  // to verify a signature against, and must still refuse -- fails closed, not silently open.
  assert.equal(authorized.authorized, false, "an empty v3 trustAnchors set must not become an automatic pass");
  assert.notEqual(authorized.code, "PUSH-PROOF-TRUST-ANCHOR-MISSING", "the trust-anchor step itself must NOT be what blocks an empty v3 set");
});

// ---------------------------------------------------------------------------
// NVA-J-PUSHPREPGATE -- isSecurityGateActive() respects gates.security
// ---------------------------------------------------------------------------

test("isSecurityGateActive: no manifest / no security gate configured -> false", () => {
  const active = isSecurityGateActive(FIXTURE_DIR, { loadManifestSafe: () => null });
  assert.equal(active, false);
});

test("isSecurityGateActive: gates.security.mode = 'off' -> false", () => {
  const active = isSecurityGateActive(FIXTURE_DIR, {
    loadManifestSafe: () => ({ gates: { security: { mode: "off" } } }),
  });
  assert.equal(active, false);
});

test("isSecurityGateActive: gates.security.mode = 'blocking' -> true", () => {
  const active = isSecurityGateActive(FIXTURE_DIR, {
    loadManifestSafe: () => ({ gates: { security: { mode: "blocking" } } }),
  });
  assert.equal(active, true);
});

// ---------------------------------------------------------------------------
// resolveFeatureContext / criticalArtifactPaths
// ---------------------------------------------------------------------------

test("resolveFeatureContext: derives specPath as a sibling of planPath", () => {
  const result = resolveFeatureContext(FIXTURE_DIR, {
    readState: () => ({ status: "ok", state: { activeFeature: { id: "nova-x", planPath: "specs/sprint-nova-epic/plans/nova-x.md" } } }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.specPath, "specs/sprint-nova-epic/plans/spec.md");
});

test("resolveFeatureContext: no active feature -> ok:false", () => {
  const result = resolveFeatureContext(FIXTURE_DIR, { readState: () => ({ status: "ok", state: {} }) });
  assert.equal(result.ok, false);
});

test("criticalArtifactPaths: request/proof share a fingerprint suffix; authority is unsuffixed", () => {
  const paths = criticalArtifactPaths(FIXTURE_DIR, "/external/po-dir", {
    gitCommonDir: () => "/external/po-dir/.fake-common",
    derivePoGateRepositoryFingerprint: () => "0123456789ab",
  });
  assert.equal(paths.request, "/external/po-dir/request-0123456789ab-critical-push.json");
  assert.equal(paths.proof, "/external/po-dir/proof-0123456789ab-critical-push.json");
  assert.equal(paths.authority, "/external/po-dir/trust-policy.json");
});

// ---------------------------------------------------------------------------
// D4 -- F7 rendering: one segment per line, backslash continuation, <=100 cols
// ---------------------------------------------------------------------------

test("renderF7Lines: every line but the last ends with a backslash continuation", () => {
  const lines = renderF7Lines(["node", "/short/script.mjs", "authorize-critical", "--kind push"]);
  assert.equal(lines.length, 4);
  for (let index = 0; index < lines.length - 1; index += 1) assert.match(lines[index], / \\$/);
  assert.doesNotMatch(lines[lines.length - 1], / \\$/);
});

test("renderF7Lines: no emitted line exceeds 100 columns for realistic short fixture segments", () => {
  const segments = segmentsForNodeCommand("node", [
    "plugins/pipeline-core/scripts/po-human-approval.mjs", "authorize-critical",
    "--repo-root", "/home/user/src/agent-pipeline",
    "--directory", "/home/user/.po-approval",
    "--feature-id", "nova-push-prepare",
    "--plan", "specs/sprint-nova-epic/plans/nova-push-prepare.md",
    "--spec", "specs/sprint-nova-epic/plans/spec.md",
    "--kind", "push",
    "--subject-sha256", "7fefc0ada3b7726f39460bf7e001ed4b71ad66c173f0132d00fcbd0648f5601a",
    "--expires-at", "2026-08-16T20:00:00.000Z",
  ]);
  const lines = renderF7Lines(segments);
  for (const line of lines) assert.ok(line.length <= 100, `line exceeds 100 columns: ${line}`);
});

test("segmentsForNodeCommand: groups flag/value pairs one per segment after exe/script/subcommand", () => {
  const segments = segmentsForNodeCommand("node", ["script.mjs", "sub", "--a", "1", "--b", "2"]);
  assert.deepEqual(segments, ["node", "script.mjs", "sub", "--a 1", "--b 2"]);
});

// ---------------------------------------------------------------------------
// pushPrepareReport -- end to end, all preconditions met vs. unmet
// ---------------------------------------------------------------------------

function readyDeps(overrides = {}) {
  return {
    dir: FIXTURE_DIR,
    gitHead: () => HEAD,
    gitStatus: () => "",
    exists: (path) => path.endsWith("push-threat-model.md") || path.endsWith("trust-policy.json"),
    readFile: (path) => {
      if (path.endsWith("trust-policy.json")) return JSON.stringify({ keyReference: "local-po-key", publicKeySha256: "a".repeat(64), humanName: "Test Human" });
      if (path.endsWith("verify-latest.json") || path.endsWith("security-latest.json")) return JSON.stringify({ exitCode: 0, commit: HEAD });
      throw new Error(`unexpected read: ${path}`);
    },
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [] }),
    parseHumanArgs: () => ({ directory: "/external/po-dir" }),
    readState: () => ({ status: "ok", state: { activeFeature: { id: "nova-push-prepare", planPath: "specs/sprint-nova-epic/plans/nova-push-prepare.md" } } }),
    gitCommonDir: () => "/external/po-dir/.fake-common",
    derivePoGateRepositoryFingerprint: () => "0123456789ab",
    now: () => new Date("2026-08-16T20:00:00.000Z"),
    pipelineStateRun: (argv) => {
      console.log(JSON.stringify({
        schema: "pipeline.push-subject-preview.v1",
        subjectSha256: "7fefc0ada3b7726f39460bf7e001ed4b71ad66c173f0132d00fcbd0648f5601a",
      }));
      return 0;
    },
    authorizeCriticalPushCommand: ({ repoRoot, directory, featureId, plan, spec, subjectSha256, expiresAt }) => ({
      executable: "node",
      argv: [
        "/plugin-root/scripts/po-human-approval.mjs", "authorize-critical",
        "--repo-root", repoRoot, "--directory", directory, "--feature-id", featureId,
        "--plan", plan, "--spec", spec, "--kind", "push",
        "--subject-sha256", subjectSha256, "--expires-at", expiresAt,
      ],
    }),
    ...overrides,
  };
}

test("pushPrepareReport: all preconditions met -> ready:true, all three commands rendered", () => {
  const result = pushPrepareReport(["--by", "tester", "--remote", "origin", "--destination", "refs/heads/main"], readyDeps());
  assert.equal(result.ok, true);
  assert.equal(result.report.ready, true);
  assert.equal(result.report.subjectSha256, "7fefc0ada3b7726f39460bf7e001ed4b71ad66c173f0132d00fcbd0648f5601a");
  assert.ok(result.lines.authorize.length > 0);
  assert.ok(result.lines.approvePush.length > 0);
  assert.equal(result.lines.gitPush, "git push origin HEAD:refs/heads/main");
});

test("pushPrepareReport: one unmet precondition -> ready:false, no command lines, remedy present", () => {
  const result = pushPrepareReport(
    ["--by", "tester", "--remote", "origin", "--destination", "refs/heads/main"],
    readyDeps({ gitStatus: () => " M dirty.mjs\n" }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.report.ready, false);
  assert.equal(result.lines, null);
  const failing = result.report.checks.find((check) => check.id === "working-tree-clean");
  assert.equal(failing.ok, false);
  assert.ok(failing.remedy);
});

test("pushPrepareReport: verify-evidence check reads the shared VERIFY_EVIDENCE_DEFAULT_PATH constant", () => {
  const readPaths = [];
  const deps = readyDeps({
    readFile: (path) => {
      readPaths.push(path);
      if (path.endsWith("trust-policy.json")) return JSON.stringify({ keyReference: "local-po-key", publicKeySha256: "a".repeat(64), humanName: "Test Human" });
      if (path.endsWith("verify-latest.json") || path.endsWith("security-latest.json")) return JSON.stringify({ exitCode: 0, commit: HEAD });
      throw new Error(`unexpected read: ${path}`);
    },
  });
  const result = pushPrepareReport(["--by", "tester", "--remote", "origin", "--destination", "refs/heads/main"], deps);
  assert.equal(result.ok, true);
  const verifyCheck = result.report.checks.find((check) => check.id === "verify-evidence");
  assert.equal(verifyCheck.ok, true);
  assert.ok(readPaths.some((path) => path.endsWith(VERIFY_EVIDENCE_DEFAULT_PATH)), "expected a read of the shared VERIFY_EVIDENCE_DEFAULT_PATH");
});

test("pushPrepareReport: bad argv -> {ok:false, error}", () => {
  const result = pushPrepareReport(["--remote", "origin"], readyDeps());
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

// ---------------------------------------------------------------------------
// NVA-J-PUSHPREPGATE -- pushPrepareReport() honors gates.security end to end
// (backlog/items/2026-08-28-the-push-gate-is-unsatisfiable-in-any-installed-plugin-deployment.md)
// ---------------------------------------------------------------------------

test("pushPrepareReport: gates.security off -> no security-evidence check, ready:true even without evidence/security-latest.json", () => {
  const deps = readyDeps({
    loadManifestSafe: () => ({ gates: { security: { mode: "off" } } }),
    readFile: (path) => {
      if (path.endsWith("trust-policy.json")) return JSON.stringify({ keyReference: "local-po-key", publicKeySha256: "a".repeat(64), humanName: "Test Human" });
      if (path.endsWith("verify-latest.json")) return JSON.stringify({ exitCode: 0, commit: HEAD });
      if (path.endsWith("security-latest.json")) throw new Error("ENOENT -- security evidence must not be read when the gate is off");
      throw new Error(`unexpected read: ${path}`);
    },
  });
  const result = pushPrepareReport(["--by", "tester", "--remote", "origin", "--destination", "refs/heads/main"], deps);
  assert.equal(result.ok, true);
  assert.equal(result.report.ready, true);
  assert.equal(result.report.checks.find((check) => check.id === "security-evidence"), undefined);
});

test("pushPrepareReport: gates.security blocking, good evidence -> security-evidence check present and ok", () => {
  const deps = readyDeps({ loadManifestSafe: () => ({ gates: { security: { mode: "blocking" } } }) });
  const result = pushPrepareReport(["--by", "tester", "--remote", "origin", "--destination", "refs/heads/main"], deps);
  assert.equal(result.ok, true);
  assert.equal(result.report.ready, true);
  const securityCheck = result.report.checks.find((check) => check.id === "security-evidence");
  assert.equal(securityCheck.ok, true);
});

test("pushPrepareReport: gates.security blocking, missing evidence -> ready:false, security-evidence check present and failing", () => {
  const deps = readyDeps({
    loadManifestSafe: () => ({ gates: { security: { mode: "blocking" } } }),
    readFile: (path) => {
      if (path.endsWith("trust-policy.json")) return JSON.stringify({ keyReference: "local-po-key", publicKeySha256: "a".repeat(64), humanName: "Test Human" });
      if (path.endsWith("verify-latest.json")) return JSON.stringify({ exitCode: 0, commit: HEAD });
      if (path.endsWith("security-latest.json")) throw new Error("ENOENT");
      throw new Error(`unexpected read: ${path}`);
    },
  });
  const result = pushPrepareReport(["--by", "tester", "--remote", "origin", "--destination", "refs/heads/main"], deps);
  assert.equal(result.ok, true);
  assert.equal(result.report.ready, false);
  const securityCheck = result.report.checks.find((check) => check.id === "security-evidence");
  assert.equal(securityCheck.ok, false);
  assert.match(securityCheck.message, /missing or unreadable/);
});

test("pushPrepareReport: HEAD unresolved + gates.security off -> no security-evidence failure pushed", () => {
  const deps = readyDeps({
    gitHead: () => null,
    loadManifestSafe: () => ({ gates: { security: { mode: "off" } } }),
  });
  const result = pushPrepareReport(["--by", "tester", "--remote", "origin", "--destination", "refs/heads/main"], deps);
  assert.equal(result.ok, true);
  assert.equal(result.report.ready, false);
  assert.equal(result.report.checks.find((check) => check.id === "security-evidence"), undefined);
  const verifyCheck = result.report.checks.find((check) => check.id === "verify-evidence");
  assert.equal(verifyCheck.ok, false);
});

test("pushPrepareReport: HEAD unresolved + gates.security blocking -> security-evidence failure still pushed", () => {
  const deps = readyDeps({
    gitHead: () => null,
    loadManifestSafe: () => ({ gates: { security: { mode: "blocking" } } }),
  });
  const result = pushPrepareReport(["--by", "tester", "--remote", "origin", "--destination", "refs/heads/main"], deps);
  assert.equal(result.ok, true);
  assert.equal(result.report.ready, false);
  const securityCheck = result.report.checks.find((check) => check.id === "security-evidence");
  assert.equal(securityCheck.ok, false);
});

// ---------------------------------------------------------------------------
// D3 -- subjectSha256 equality against the real pipeline-state.mjs CLI
// ---------------------------------------------------------------------------

test("D3: preparePushSubject() matches the real `pipeline-state.mjs prepare-push-subject` CLI", () => {
  const args = { dir: REPO_ROOT, by: "nva-push-prepare-d3-check", remote: "origin", destination: "refs/heads/main" };
  const inProcess = preparePushSubject(args);
  assert.equal(inProcess.ok, true, `preparePushSubject failed: ${inProcess.raw}`);

  const spawned = spawnSync(
    process.execPath,
    ["plugins/pipeline-core/scripts/pipeline-state.mjs", "prepare-push-subject",
      "--by", args.by, "--remote", args.remote, "--destination", args.destination],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  assert.equal(spawned.status, 0, `CLI subprocess failed: ${spawned.stderr}`);
  const cliValue = JSON.parse(spawned.stdout);

  assert.equal(inProcess.value.subjectSha256, cliValue.subjectSha256);
  assert.match(inProcess.value.subjectSha256, /^[0-9a-f]{64,}$/);
});
