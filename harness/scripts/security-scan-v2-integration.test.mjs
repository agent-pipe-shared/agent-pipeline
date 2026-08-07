#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * security-scan-v2-integration.test.mjs -- CYB-2E integration suite for the additive,
 * EXIT-NEUTRAL `pipeline.security-evidence.v2` emission wired into security-scan.mjs
 * (Option B / D9). Run: `node --test harness/scripts/security-scan-v2-integration.test.mjs`.
 *
 * This suite is SEPARATE from security-scan.test.mjs (which must stay byte-identical to its
 * pre-CYB-2E baseline). It covers, per the CYB-2E DoD:
 *   - v2 envelope validity for a real clean Git candidate (validateSecurityEvidenceV2), and
 *     the on-disk `security-latest.v2.json` validating directly;
 *   - correct per-capability RUN_OUTCOMES mapping (pass / findings / required-capability-
 *     missing / invalid) and the license-check control lane (projectRunOutcomeToControlResult);
 *   - EXIT-NEUTRALITY: the returned exitCode matches pre-CYB-2E v1 behavior across the
 *     representative classes, while the v2 policy-complete verdict may (and does) differ;
 *   - the v1 evidence file staying byte-shape-identical (no v2 field leakage).
 *
 * Fixtures mirror security-scan.test.mjs: fake spawnable "binaries" under a temp BIN_DIR,
 * pointed at via PIPELINE_<TOOL>_PATH + the fixture trust mock; NO real scanner binaries.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { runSecurityScan } from "./security-scan.mjs";
import {
  validateSecurityEvidenceV2,
  evaluateCapability,
  FINDING_SEVERITIES,
} from "../../plugins/pipeline-core/lib/security-evidence-evaluator.mjs";

// The real repo control catalog, seeded into every Git fixture so `sourceCapabilityPlan`
// exercises the actual catalog + baseline-assurance sourcing this task committed to.
const REPO_CATALOG = readFileSync(new URL("../../governance/security-controls/catalog.json", import.meta.url), "utf8");

// ---------------------------------------------------------------------------------------------
// Fixture plumbing (minimal replication of security-scan.test.mjs's helpers).
// ---------------------------------------------------------------------------------------------

const FIXTURE_ROOT = mkdtempSync(join(tmpdir(), "pipeline-security-v2-test-"));
const BIN_DIR = join(FIXTURE_ROOT, "bin");
mkdirSync(BIN_DIR, { recursive: true });
after(() => {
  try { rmSync(FIXTURE_ROOT, { recursive: true, force: true }); } catch { /* best-effort */ }
});

function writeFixtureBinary(name, jsBody) {
  const mjsPath = join(BIN_DIR, `${name}.mjs`);
  writeFileSync(mjsPath, jsBody);
  if (process.platform === "win32") {
    const cmdPath = join(BIN_DIR, `${name}.cmd`);
    writeFileSync(cmdPath, `@echo off\r\nnode "${mjsPath}" %*\r\n`);
    return cmdPath;
  }
  const shPath = join(BIN_DIR, name);
  writeFileSync(shPath, `#!/usr/bin/env node\n${jsBody}`);
  chmodSync(shPath, 0o755);
  return shPath;
}

function fixtureSpawnFn(cmd, args, opts) {
  return spawnSync(cmd, args, { ...opts, shell: process.platform === "win32" && cmd !== process.execPath });
}

function mockAssessFixtureBinary(path) {
  return typeof path === "string" && path.startsWith(BIN_DIR)
    ? { ok: true, path }
    : { ok: false, status: "untrusted_path" };
}

let fixtureCounter = 0;
function makeRootDir(label) {
  return mkdtempSync(join(FIXTURE_ROOT, `${label}-${fixtureCounter++}-`));
}

function git(rootDir, ...args) {
  const r = spawnSync("git", args, { cwd: rootDir, encoding: "utf8", shell: false });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function commitFixture(rootDir) {
  git(rootDir, "init", "-q");
  git(rootDir, "config", "user.name", "V2 Fixture");
  git(rootDir, "config", "user.email", "v2-fixture@example.invalid");
  git(rootDir, "remote", "add", "origin", "https://example.invalid/pipeline/v2-fixture.git");
  git(rootDir, "add", "-A");
  git(rootDir, "commit", "-qm", "v2 fixture");
}

function seedCatalog(rootDir) {
  const dir = join(rootDir, "governance", "security-controls");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "catalog.json"), REPO_CATALOG);
}

function writeLicenseFiles(rootDir) {
  const policiesDir = join(rootDir, "governance", "examples", "policies");
  mkdirSync(policiesDir, { recursive: true });
  writeFileSync(join(policiesDir, "license-allowlist.json"), JSON.stringify({ allow: ["MIT"], deny: [] }));
  writeFileSync(join(rootDir, "third-party-licenses.json"), JSON.stringify({ dependencies: [{ name: "pkgA", version: "1.0.0", license: "MIT" }] }));
}

/** Builds a committed, clean Git fixture with the seeded catalog (+ optional license files). */
function makeGitFixture(label, { license = false } = {}) {
  const rootDir = makeRootDir(label);
  seedCatalog(rootDir);
  writeFileSync(join(rootDir, "README.md"), "candidate bytes\n");
  if (license) writeLicenseFiles(rootDir);
  commitFixture(rootDir);
  return rootDir;
}

// ---------------------------------------------------------------------------------------------
// Fixture "binaries".
// ---------------------------------------------------------------------------------------------

const gitleaksClean = writeFixtureBinary(
  "gitleaks-clean",
  `import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
writeFileSync(args[args.indexOf("--report-path") + 1], "[]");
process.exit(0);
`,
);

const gitleaksFindings = writeFixtureBinary(
  "gitleaks-findings",
  `import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify([
  { RuleID: "aws-access-key", File: "config/secrets.txt", StartLine: 3, Description: "AWS Access Key detected" },
  { RuleID: "generic-api-key", File: "src/app.js", StartLine: 42, Description: "Generic API Key detected" },
]));
process.exit(0);
`,
);

const osvClean = writeFixtureBinary(
  "osv-clean",
  `if (process.argv.includes("--version")) { process.stdout.write("osv-scanner version: 2.0.3\\n"); process.exit(0); }
process.stdout.write(JSON.stringify({ results: [] }));
process.exit(0);
`,
);

const osvNoPackageSources = writeFixtureBinary(
  "osv-no-package-sources",
  `if (process.argv.includes("--version")) { process.stdout.write("osv-scanner version: 2.0.3\\n"); process.exit(0); }
process.stderr.write("No package sources found");
process.exit(128);
`,
);

const semgrepClean = writeFixtureBinary(
  "semgrep-clean",
  `process.stdout.write(JSON.stringify({ results: [] }));
process.exit(0);
`,
);

const semgrepCrash = writeFixtureBinary(
  "semgrep-crash",
  `process.stdout.write("<<<not-json>>>");
process.exit(2);
`,
);

const CLEAN_ENV = { PIPELINE_GITLEAKS_PATH: gitleaksClean, PIPELINE_OSV_SCANNER_PATH: osvClean, PIPELINE_SEMGREP_PATH: semgrepClean };

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

test("v2 envelope is valid for a real clean Git candidate and captures all three capabilities", async () => {
  const rootDir = makeGitFixture("v2-valid", { license: true });
  const { exitCode, evidence, evidenceV2, verdictV2 } = await runSecurityScan({
    rootDir, env: CLEAN_ENV, spawnFn: fixtureSpawnFn, timeoutMs: 5000, assessTrustedExecutablePath: mockAssessFixtureBinary,
  });

  assert.equal(exitCode, 0, "all-pass clean candidate -> v1 exit 0");
  assert.ok(evidenceV2, "v2 envelope emitted for a Git candidate");
  assert.equal(validateSecurityEvidenceV2(evidenceV2).valid, true, JSON.stringify(validateSecurityEvidenceV2(evidenceV2).errors));

  // The on-disk envelope file validates DIRECTLY (it is the pure envelope, not a wrapper).
  const onDisk = JSON.parse(readFileSync(join(rootDir, "evidence", "security-latest.v2.json"), "utf8"));
  assert.equal(validateSecurityEvidenceV2(onDisk).valid, true);
  assert.deepEqual(onDisk, evidenceV2);

  assert.deepEqual(evidenceV2.capabilities.map((c) => c.capabilityId), ["cap.secrets", "cap.sca", "cap.sast"]);
  assert.deepEqual(evidenceV2.capabilities.map((c) => c.status), ["PASS", "PASS", "PASS"]);
  assert.equal(evidenceV2.input.commit, evidence.candidate.commit);
  assert.equal(evidenceV2.input.tree, evidence.candidate.tree);
  assert.equal(evidenceV2.policy.configurationSha256, evidence.policy.configurationSha256);
  assert.ok(typeof evidenceV2.environment.platform === "string" && evidenceV2.environment.platform.length > 0);

  // Verdict sidecar records the reporting-only aggregate + is written to disk.
  const verdictOnDisk = JSON.parse(readFileSync(join(rootDir, "evidence", "security-latest.v2.verdict.json"), "utf8"));
  assert.deepEqual(verdictOnDisk, verdictV2);
  assert.equal(verdictV2.exitAuthority, "v1-blocking-logic");
  assert.equal(verdictV2.v1ExitCode, 0);
  assert.equal(verdictV2.plan.source, "repo-catalog");
  assert.deepEqual(verdictV2.plan.required, ["cap.sast", "cap.sca", "cap.secrets"]);
  assert.equal(verdictV2.verdict.blocking, false, "all required capabilities pass -> non-blocking verdict");
});

test("package-source-free repositories make SCA not-applicable without exempting missing tooling", async () => {
  const rootDir = makeGitFixture("v2-no-package-sources", { license: true });
  const { evidenceV2, verdictV2 } = await runSecurityScan({
    rootDir,
    env: {
      PIPELINE_GITLEAKS_PATH: gitleaksClean,
      PIPELINE_OSV_SCANNER_PATH: osvNoPackageSources,
      PIPELINE_SEMGREP_PATH: semgrepClean,
    },
    spawnFn: fixtureSpawnFn,
    timeoutMs: 5000,
    assessTrustedExecutablePath: mockAssessFixtureBinary,
  });

  assert.deepEqual(verdictV2.plan.required, ["cap.sast", "cap.secrets"]);
  assert.equal(verdictV2.capabilityOutcomes["cap.sca"], "not-applicable");
  assert.equal(verdictV2.verdict.blocking, false);
  assert.equal(evidenceV2.capabilities.find((record) => record.capabilityId === "cap.sca")?.status, "SKIPPED");
});

test("EXIT-NEUTRALITY: exit code matches pre-CYB-2E v1 behavior across representative classes", async () => {
  // Pre-CYB-2E v1 semantics, reproduced from the unchanged blocking logic:
  //   all-pass / all-skipped -> 0 (no findings, no ERROR, clean bound candidate)
  //   blocking finding (high) / any ERROR -> 2 (mode "blocking" default)
  const cases = [
    { name: "all-pass", env: CLEAN_ENV, license: true, expectedExit: 0, useMock: true },
    { name: "all-skipped", env: {}, license: false, expectedExit: 0, useMock: false },
    { name: "blocking-finding", env: { PIPELINE_GITLEAKS_PATH: gitleaksFindings }, license: false, expectedExit: 2, useMock: true },
    { name: "error", env: { PIPELINE_SEMGREP_PATH: semgrepCrash }, license: false, expectedExit: 2, useMock: true },
  ];

  const table = [];
  for (const c of cases) {
    const rootDir = makeGitFixture(`v2-exit-${c.name}`, { license: c.license });
    const opts = { rootDir, env: c.env, spawnFn: fixtureSpawnFn, timeoutMs: 5000 };
    if (c.useMock) opts.assessTrustedExecutablePath = mockAssessFixtureBinary;
    const { exitCode, evidence, verdictV2 } = await runSecurityScan(opts);
    assert.equal(exitCode, c.expectedExit, `${c.name}: returned exitCode`);
    assert.equal(evidence.exitCode, c.expectedExit, `${c.name}: v1 evidence.exitCode`);
    assert.equal(evidence.schema, "pipeline.security-evidence.v1");
    table.push({ class: c.name, v1Exit: exitCode, v2Blocking: verdictV2 ? verdictV2.verdict.blocking : null });
  }

  // Machine-checkable exit-neutrality table (also surfaced in the report).
  assert.deepEqual(table, [
    { class: "all-pass", v1Exit: 0, v2Blocking: false },
    { class: "all-skipped", v1Exit: 0, v2Blocking: true },      // v2 DIVERGES: required caps missing
    { class: "blocking-finding", v1Exit: 2, v2Blocking: true },
    { class: "error", v1Exit: 2, v2Blocking: true },
  ]);
});

test("EXIT-NEUTRALITY divergence: all-skipped is v1 exit 0 while the v2 policy-complete verdict blocks (reporting-only)", async () => {
  const rootDir = makeGitFixture("v2-divergence");
  const { exitCode, verdictV2 } = await runSecurityScan({ rootDir, env: {}, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assert.equal(exitCode, 0, "v1: SKIPPED never blocks");
  assert.equal(verdictV2.verdict.blocking, true, "v2: required capabilities missing -> blocking (evidence only)");
  assert.deepEqual(
    Object.values(verdictV2.capabilityOutcomes).sort(),
    ["required-capability-missing", "required-capability-missing", "required-capability-missing"],
  );
  assert.equal(verdictV2.verdict.offendingCapabilities.length, 3);
});

test("per-capability RUN_OUTCOMES mapping: pass, findings, required-capability-missing", async () => {
  const passRoot = makeGitFixture("v2-map-pass", { license: true });
  const passRes = await runSecurityScan({ rootDir: passRoot, env: CLEAN_ENV, spawnFn: fixtureSpawnFn, timeoutMs: 5000, assessTrustedExecutablePath: mockAssessFixtureBinary });
  assert.deepEqual(passRes.verdictV2.capabilityOutcomes, { "cap.secrets": "pass", "cap.sca": "pass", "cap.sast": "pass" });

  const findRoot = makeGitFixture("v2-map-findings");
  const findRes = await runSecurityScan({ rootDir: findRoot, env: { PIPELINE_GITLEAKS_PATH: gitleaksFindings }, spawnFn: fixtureSpawnFn, timeoutMs: 5000, assessTrustedExecutablePath: mockAssessFixtureBinary });
  assert.equal(findRes.verdictV2.capabilityOutcomes["cap.secrets"], "findings");
  assert.equal(findRes.verdictV2.capabilityOutcomes["cap.sca"], "required-capability-missing", "osv-scanner skipped + required");
  assert.equal(findRes.verdictV2.capabilityOutcomes["cap.sast"], "required-capability-missing", "semgrep skipped + required");

  // The v2 capability record carries the mapped, validator-passing findings.
  const secretsRec = findRes.evidenceV2.capabilities.find((c) => c.capabilityId === "cap.secrets");
  assert.equal(secretsRec.status, "FINDINGS");
  assert.equal(secretsRec.findings.length, 2);
  assert.equal(secretsRec.findings.every((f) => f.severity === "high" && FINDING_SEVERITIES.includes(f.severity)), true);
});

test("license-check control lane: PASS -> met, and its run-outcome mirrors the sanctioned evaluator", async () => {
  const rootDir = makeGitFixture("v2-license-pass", { license: true });
  const { verdictV2 } = await runSecurityScan({ rootDir, env: {}, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });

  const lc = verdictV2.controls.find((c) => c.tool === "license-check");
  assert.ok(lc, "license-check recorded in the control lane, not the capability array");
  assert.equal(lc.capabilityId, null, "license-check is kind:control, capabilityId null");
  assert.equal(lc.required, false, "no catalog control binds license-check (controlRef null)");
  assert.equal(lc.runOutcome, "pass");
  assert.equal(lc.controlResult, "met");

  // Fidelity: the same status classified via the sanctioned per-capability evaluator agrees.
  const synthetic = { capabilities: [{ id: "cap.probe", tool: "license-check", status: lc.status, classification: lc.classification, findings: [], raw: null, reason: lc.reason }] };
  const evalOutcome = evaluateCapability(synthetic, "cap.probe", { required: [], optional: ["cap.probe"] }).outcome;
  assert.equal(lc.runOutcome, evalOutcome, "control-lane run-outcome equals evaluateCapability for the same status/required");

  // No cap.* capability record was ever minted for license-check.
  const { evidenceV2 } = await runSecurityScan({ rootDir, env: {}, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assert.equal(evidenceV2.capabilities.some((c) => c.tool.name === "license-check"), false);
});

test("license-check control lane: SKIPPED (no declared file) -> not-applicable", async () => {
  const rootDir = makeGitFixture("v2-license-skip"); // no license files committed
  const { verdictV2 } = await runSecurityScan({ rootDir, env: {}, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  const lc = verdictV2.controls.find((c) => c.tool === "license-check");
  assert.equal(lc.runOutcome, "not-applicable");
  assert.equal(lc.controlResult, "not-applicable");
});

test("dirty/uncertain candidate: v1 exit 2 and v2 marks every capability invalid (candidate-binding poisoning)", async () => {
  const rootDir = makeGitFixture("v2-dirty");
  writeFileSync(join(rootDir, "README.md"), "uncommitted change\n"); // dirty the tree after commit
  const { exitCode, evidenceV2, verdictV2 } = await runSecurityScan({ rootDir, env: {}, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });

  assert.equal(exitCode, 2, "v1: a dirty candidate is blocking-class");
  assert.ok(evidenceV2, "v2 still emitted: a dirty candidate still carries a Git identity");
  assert.equal(validateSecurityEvidenceV2(evidenceV2).valid, true);
  assert.deepEqual(Object.values(verdictV2.capabilityOutcomes), ["invalid", "invalid", "invalid"]);
  assert.equal(verdictV2.verdict.blocking, true);
});

test("v1 evidence + on-disk security-latest.json stay byte-shape-identical (no v2 field leakage)", async () => {
  const rootDir = makeGitFixture("v2-v1-shape", { license: true });
  const { evidence } = await runSecurityScan({ rootDir, env: {}, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });

  const V1_KEYS = ["schema", "project", "command", "commit", "candidate", "finishedAt", "thresholds", "policy", "execution", "scanners", "findings", "exitCode", "payloadSha256"].sort();
  assert.deepEqual(Object.keys(evidence).sort(), V1_KEYS, "v1 evidence key set is unchanged");
  assert.equal(evidence.schema, "pipeline.security-evidence.v1");

  const raw = readFileSync(join(rootDir, "evidence", "security-latest.json"), "utf8");
  assert.equal(raw.includes("security-evidence.v2"), false, "v1 file carries no v2 schema string");
  assert.deepEqual(JSON.parse(raw), evidence, "on-disk v1 file deep-equals the returned evidence");

  // The v2 artifacts live in SEPARATE files only.
  assert.equal(existsSync(join(rootDir, "evidence", "security-latest.v2.json")), true);
  assert.equal(existsSync(join(rootDir, "evidence", "security-latest.v2.verdict.json")), true);
});
