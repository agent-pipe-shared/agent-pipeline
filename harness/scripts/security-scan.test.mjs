#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * security-scan.test.mjs -- versioned test suite for the security-scan phase runner
 * (security-scan.mjs) and its four adapters (security-adapters/*.mjs), AP1-P4 "FUNDIN".
 *
 * NO real scanner binaries anywhere in this file (briefing prohibition + this machine's
 * gitleaks/osv-scanner are off the session PATH anyway, semgrep is not installed at all):
 * every gitleaks/osv-scanner/semgrep case uses a small FAKE "binary" -- a plain Node script
 * wrapped so it is directly spawnable cross-platform (see writeFixtureBinary()) -- pointed
 * at via `config.binaryPath` (production-shape: exactly what the runner passes after
 * calling `isInstalled()`) or via `PIPELINE_<TOOL>_PATH`-style env overrides fed straight
 * into `isInstalled(env)` / `run({..., env})`. license-check needs no binary at all (pure
 * Node file reads) -- its cases use plain JSON fixture files instead.
 *
 * Same plain-assertion style + "N/N cases passed." convention as
 * plugins/pipeline-core/hooks/guard-git.test.mjs / scripts/critic-bare.test.mjs.
 *
 * Run:   node harness/scripts/security-scan.test.mjs
 * Exit:  0 = all cases pass, 1 = at least one case failed (failure list on stdout).
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import * as gitleaksAdapter from "./security-adapters/gitleaks.mjs";
import * as osvScannerAdapter from "./security-adapters/osv-scanner.mjs";
import * as semgrepAdapter from "./security-adapters/semgrep.mjs";
import * as licenseCheckAdapter from "./security-adapters/license-check.mjs";
import { runSecurityScan } from "./security-scan.mjs";

const SCRIPT = fileURLToPath(new URL("./security-scan.mjs", import.meta.url));

let pass = 0;
const failures = [];
function record(id, ok, detail) {
  if (ok) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${id} -- ${detail}`);
  }
}
function assertEqual(id, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  record(id, ok, ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertTrue(id, cond, detail) {
  record(id, Boolean(cond), detail);
}
function assertIncludes(id, haystack, needle) {
  const ok = typeof haystack === "string" && haystack.includes(needle);
  record(id, ok, ok ? "" : `expected string to include "${needle}", got ${JSON.stringify(haystack)}`);
}

// ---------------------------------------------------------------------------------------------
// Fixture plumbing
// ---------------------------------------------------------------------------------------------

const FIXTURE_ROOT = mkdtempSync(join(tmpdir(), "pipeline-security-scan-test-"));
const BIN_DIR = join(FIXTURE_ROOT, "bin");
mkdirSync(BIN_DIR, { recursive: true });

/**
 * Writes a "fake binary" that a spawnFn can execute directly, returning its path.
 * Windows requires `shell: true` to execute a `.cmd`/`.bat` file directly (Node's own
 * CVE-2024-27980 hardening -- empirically confirmed in this environment during design:
 * spawnSync on a `.cmd` target without `shell:true` fails EINVAL) -- `fixtureSpawnFn` below
 * wraps the real spawnSync with `shell: true` ONLY for these test fixtures; every adapter's
 * OWN production default spawnFn never sets shell (a real binary needs no shell, ever).
 * On posix: a directly-executable script with a `#!/usr/bin/env node` shebang + chmod 0o755
 * needs no shell wrapper at all.
 */
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
  // Fixture scripts need a shell on Windows, but the Node preflight must retain
  // the production `shell: false` contract.
  return spawnSync(cmd, args, { ...opts, shell: process.platform === "win32" && cmd !== process.execPath });
}

function permissionDeniedSpawnFn(code) {
  const error = new Error("operation not permitted by execution environment");
  error.code = code;
  return { status: null, stdout: "", stderr: "", error };
}

function epermSpawnFn() {
  return permissionDeniedSpawnFn("EPERM");
}

function eaccesSpawnFn() {
  return permissionDeniedSpawnFn("EACCES");
}

function makeRootDir(label) {
  return mkdtempSync(join(FIXTURE_ROOT, `${label}-`));
}

function git(rootDir, ...args) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function commitFixture(rootDir) {
  git(rootDir, "init", "-q");
  git(rootDir, "config", "user.name", "Security Fixture");
  git(rootDir, "config", "user.email", "security-fixture@example.invalid");
  git(rootDir, "remote", "add", "origin", "https://example.invalid/pipeline/security-fixture.git");
  git(rootDir, "add", "-A");
  git(rootDir, "commit", "-qm", "security fixture");
}

function writeManifest(rootDir, yamlText) {
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeFileSync(join(rootDir, ".claude", "pipeline.yaml"), yamlText);
}

function writeLicenseFiles(rootDir, { allowlist, declared, policiesRelPath = "governance/examples/policies" }) {
  const policiesDir = join(rootDir, ...policiesRelPath.split("/"));
  mkdirSync(policiesDir, { recursive: true });
  if (allowlist !== undefined) writeFileSync(join(policiesDir, "license-allowlist.json"), JSON.stringify(allowlist));
  if (declared !== undefined) writeFileSync(join(rootDir, "third-party-licenses.json"), JSON.stringify(declared));
}

/**
 * Test-only trust mock (see security-scan.mjs's injectable `assessTrustedExecutablePath`
 * seam): the real trusted-tool-resolution.mjs (RESERVED, never edited here) enforces a
 * fixed allowlist of real installed-scanner system roots (plus a real `.exe` extension on
 * Windows) that a throwaway fixture binary under BIN_DIR can never satisfy. This mock
 * trusts exactly the fixture binaries this suite itself wrote under BIN_DIR -- nothing
 * else -- so the runner-level tests exercise their real adapter.run() path on every
 * platform without touching the production trust policy.
 */
function mockAssessFixtureBinary(path) {
  return typeof path === "string" && path.startsWith(BIN_DIR)
    ? { ok: true, path }
    : { ok: false, status: "untrusted_path" };
}

// ---------------------------------------------------------------------------------------------
// Gitleaks fixture binaries
// ---------------------------------------------------------------------------------------------

const gitleaksClean = writeFixtureBinary(
  "gitleaks-clean",
  `import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const reportPath = args[args.indexOf("--report-path") + 1];
writeFileSync(reportPath, "[]");
process.exit(0);
`,
);

const gitleaksFindings = writeFixtureBinary(
  "gitleaks-findings",
  `import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const reportPath = args[args.indexOf("--report-path") + 1];
const report = [
  { RuleID: "aws-access-key", File: "config/secrets.txt", StartLine: 3, Description: "AWS Access Key detected" },
  { RuleID: "generic-api-key", File: "src/app.js", StartLine: 42, Description: "Generic API Key detected" },
];
writeFileSync(reportPath, JSON.stringify(report));
process.exit(0);
`,
);

const gitleaksCrash = writeFixtureBinary(
  "gitleaks-crash",
  `process.stderr.write("fatal: internal gitleaks error\\n");
process.exit(1);
`,
);

const gitleaksGarbage = writeFixtureBinary(
  "gitleaks-garbage",
  `import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const reportPath = args[args.indexOf("--report-path") + 1];
writeFileSync(reportPath, "not-json-at-all{{{");
process.exit(0);
`,
);

const gitleaksUnexpectedShape = writeFixtureBinary(
  "gitleaks-unexpected-shape",
  `import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const reportPath = args[args.indexOf("--report-path") + 1];
writeFileSync(reportPath, JSON.stringify({ findings: [] }));
process.exit(0);
`,
);

const gitleaksMutatesCandidate = writeFixtureBinary(
  "gitleaks-mutates-candidate",
  `import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const source = args[args.indexOf("--source") + 1];
const reportPath = args[args.indexOf("--report-path") + 1];
writeFileSync(source + "/scanner-mutation.txt", "scanner must not mutate the candidate\\n");
writeFileSync(reportPath, "[]");
process.exit(0);
`,
);

// ---------------------------------------------------------------------------------------------
// osv-scanner fixture binaries
// ---------------------------------------------------------------------------------------------

const osvClean = writeFixtureBinary(
  "osv-clean",
  `if (process.argv.includes("--version")) {
  process.stdout.write("osv-scanner version: 2.0.3\\n");
  process.exit(0);
}
process.stdout.write(JSON.stringify({ results: [] }));
process.exit(0);
`,
);

const osvFindings = writeFixtureBinary(
  "osv-findings",
  `if (process.argv.includes("--version")) {
  process.stdout.write("osv-scanner version: 2.0.3\\n");
  process.exit(0);
}
const report = {
  results: [
    {
      source: { path: "package-lock.json" },
      packages: [
        {
          package: { name: "lodash", version: "4.17.15" },
          vulnerabilities: [
            { id: "GHSA-xxxx-critical", summary: "Prototype pollution", database_specific: { severity: "CRITICAL" } },
            { id: "GHSA-yyyy-numeric", summary: "ReDoS", severity: [{ type: "CVSS_V3", score: "7.8" }] },
            { id: "GHSA-zzzz-unknown", summary: "Unclear severity vuln" },
          ],
          groups: [{ ids: ["GHSA-xxxx-critical"] }],
        },
      ],
    },
  ],
};
process.stdout.write(JSON.stringify(report));
process.exit(1);
`,
);

const osvCrash = writeFixtureBinary(
  "osv-crash",
  `if (process.argv.includes("--version")) {
  process.stdout.write("osv-scanner version: 2.0.3\\n");
  process.exit(0);
}
process.stdout.write("totally not json {{{");
process.exit(2);
`,
);

const osvMissingResults = writeFixtureBinary(
  "osv-missing-results",
  `if (process.argv.includes("--version")) {
  process.stdout.write("osv-scanner version: 2.0.3\\n");
  process.exit(0);
}
process.stdout.write(JSON.stringify({ schema: "unexpected" }));
process.exit(0);
`,
);

const osvMalformedPackages = writeFixtureBinary(
  "osv-malformed-packages",
  `if (process.argv.includes("--version")) {
  process.stdout.write("osv-scanner version: 2.0.3\\n");
  process.exit(0);
}
process.stdout.write(JSON.stringify({
  results: [{ source: { path: "package-lock.json" }, packages: {} }],
}));
process.exit(0);
`,
);

const osvMissingGroups = writeFixtureBinary(
  "osv-missing-groups",
  `if (process.argv.includes("--version")) {
  process.stdout.write("osv-scanner version: 2.0.3\\n");
  process.exit(0);
}
process.stdout.write(JSON.stringify({
  results: [{
    source: { path: "package-lock.json" },
    packages: [{
      package: { name: "lodash", version: "4.17.15" },
      vulnerabilities: [{ id: "GHSA-xxxx" }],
    }],
  }],
}));
process.exit(1);
`,
);

const osvMalformedVulnerability = writeFixtureBinary(
  "osv-malformed-vulnerability",
  `if (process.argv.includes("--version")) {
  process.stdout.write("osv-scanner version: 2.0.3\\n");
  process.exit(0);
}
process.stdout.write(JSON.stringify({
  results: [{
    source: { path: "package-lock.json" },
    packages: [{
      package: { name: "lodash", version: "4.17.15" },
      vulnerabilities: [{ id: 7 }],
      groups: [],
    }],
  }],
}));
process.exit(1);
`,
);

const osvNoPackageSources = writeFixtureBinary(
  "osv-no-package-sources",
  `if (process.argv.includes("--version")) {
  process.stdout.write("osv-scanner version: 2.0.3\\n");
  process.exit(0);
}
process.stderr.write("No package sources found, --help for usage information.\\n");
process.exit(128);
`,
);

const osvExit128Other = writeFixtureBinary(
  "osv-exit-128-other",
  `if (process.argv.includes("--version")) {
  process.stdout.write("osv-scanner version: 2.0.3\\n");
  process.exit(0);
}
process.stderr.write("fatal: some other unrelated crash\\n");
process.exit(128);
`,
);

const osvV1 = writeFixtureBinary(
  "osv-v1",
  `if (process.argv.includes("--version")) {
  process.stdout.write("osv-scanner version: 1.9.2\\n");
  process.exit(0);
}
process.stderr.write("v1 scan syntax should never run\\n");
process.exit(99);
`,
);

// ---------------------------------------------------------------------------------------------
// semgrep fixture binaries
// ---------------------------------------------------------------------------------------------

const semgrepClean = writeFixtureBinary(
  "semgrep-clean",
  `process.stdout.write(JSON.stringify({ results: [] }));
process.exit(0);
`,
);

const semgrepFindings = writeFixtureBinary(
  "semgrep-findings",
  `const report = {
  results: [
    { check_id: "rules.sql-injection", path: "src/db.js", start: { line: 10 }, extra: { message: "Possible SQL injection", severity: "ERROR" } },
    { check_id: "rules.weak-crypto", path: "src/crypto.js", start: { line: 5 }, extra: { message: "Weak crypto algorithm", severity: "WARNING" } },
    { check_id: "rules.todo-marker", path: "src/todo.js", start: { line: 1 }, extra: { message: "TODO marker found", severity: "INFO" } },
  ],
};
process.stdout.write(JSON.stringify(report));
process.exit(0);
`,
);

const semgrepWarningOnly = writeFixtureBinary(
  "semgrep-warning-only",
  `const report = {
  results: [
    { check_id: "rules.weak-crypto", path: "src/crypto.js", start: { line: 5 }, extra: { message: "Weak crypto algorithm", severity: "WARNING" } },
  ],
};
process.stdout.write(JSON.stringify(report));
process.exit(0);
`,
);

const semgrepCrash = writeFixtureBinary(
  "semgrep-crash",
  `process.stdout.write("<<<not-json>>>");
process.exit(2);
`,
);

const semgrepNonzeroCleanBody = writeFixtureBinary(
  "semgrep-nonzero-clean-body",
  `process.stdout.write(JSON.stringify({ results: [] }));
process.exit(1);
`,
);

const semgrepErrorPayload = writeFixtureBinary(
  "semgrep-error-payload",
  `process.stdout.write(JSON.stringify({ results: [], errors: [{ message: "rule loading failed" }] }));
process.exit(0);
`,
);

const semgrepMissingResults = writeFixtureBinary(
  "semgrep-missing-results",
  `process.stdout.write(JSON.stringify({ version: "1.0" }));
process.exit(0);
`,
);

// ===============================================================================================
// GITLEAKS adapter cases
// ===============================================================================================

{
  const inst = gitleaksAdapter.isInstalled({ PIPELINE_GITLEAKS_PATH: gitleaksClean });
  assertTrue("gitleaks isInstalled: env override to existing fixture", inst.installed === true && inst.path === gitleaksClean, JSON.stringify(inst));
}
{
  const inst = gitleaksAdapter.isInstalled({ PIPELINE_GITLEAKS_PATH: join(FIXTURE_ROOT, "does-not-exist.cmd") });
  assertTrue(
    "gitleaks isInstalled: env override to nonexistent path -> not installed",
    inst.installed === false && inst.reason.includes("PIPELINE_GITLEAKS_PATH"),
    JSON.stringify(inst),
  );
}
{
  const inst = gitleaksAdapter.isInstalled({});
  assertTrue("gitleaks isInstalled: no override, empty PATH -> not installed", inst.installed === false, JSON.stringify(inst));
}

{
  const rootDir = makeRootDir("gitleaks-clean-root");
  const result = await gitleaksAdapter.run({ rootDir, config: { binaryPath: gitleaksClean }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("gitleaks run: clean fixture -> PASS, 0 findings", { status: result.status, count: result.findings.length }, { status: "PASS", count: 0 });
}
{
  const rootDir = makeRootDir("gitleaks-findings-root");
  const result = await gitleaksAdapter.run({ rootDir, config: { binaryPath: gitleaksFindings }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("gitleaks run: findings fixture -> FINDINGS status", result.status, "FINDINGS");
  assertEqual("gitleaks run: findings normalized shape", result.findings, [
    { tool: "gitleaks", severity: "high", rule: "aws-access-key", path: "config/secrets.txt", line: 3, msg: "AWS Access Key detected" },
    { tool: "gitleaks", severity: "high", rule: "generic-api-key", path: "src/app.js", line: 42, msg: "Generic API Key detected" },
  ]);
}
{
  const rootDir = makeRootDir("gitleaks-crash-root");
  const result = await gitleaksAdapter.run({ rootDir, config: { binaryPath: gitleaksCrash }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("gitleaks run: crash (nonzero exit) -> ERROR", result.status, "ERROR");
  assertIncludes("gitleaks run: crash reason mentions exit code", result.reason, "exited 1");
}
{
  const rootDir = makeRootDir("gitleaks-garbage-root");
  const result = await gitleaksAdapter.run({ rootDir, config: { binaryPath: gitleaksGarbage }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("gitleaks run: garbage report JSON -> ERROR", result.status, "ERROR");
  assertIncludes("gitleaks run: garbage reason mentions unparseable", result.reason, "unparseable");
}
{
  const rootDir = makeRootDir("gitleaks-unexpected-shape-root");
  const result = await gitleaksAdapter.run({ rootDir, config: { binaryPath: gitleaksUnexpectedShape }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("gitleaks run: valid JSON object report -> scanner_error", { status: result.status, classification: result.classification, count: result.findings.length }, { status: "ERROR", classification: "scanner_error", count: 0 });
}
{
  const rootDir = makeRootDir("gitleaks-notinstalled-root");
  const result = await gitleaksAdapter.run({ rootDir, config: {}, env: {}, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("gitleaks run: not installed -> SKIPPED", result.status, "SKIPPED");
  assertEqual("gitleaks run: not installed -> binary_missing classification", result.classification, "binary_missing");
  assertTrue("gitleaks run: SKIPPED carries a reason", typeof result.reason === "string" && result.reason.length > 0, result.reason);
}
{
  const rootDir = makeRootDir("gitleaks-eperm-root");
  const result = await gitleaksAdapter.run({ rootDir, config: { binaryPath: gitleaksClean }, spawnFn: epermSpawnFn, timeoutMs: 5000 });
  assertEqual("gitleaks run: EPERM -> execution_environment (not missing/finding)", { status: result.status, classification: result.classification, findings: result.findings.length }, { status: "ERROR", classification: "execution_environment", findings: 0 });
}
{
  const rootDir = makeRootDir("gitleaks-eacces-root");
  const result = await gitleaksAdapter.run({ rootDir, config: { binaryPath: gitleaksClean }, spawnFn: eaccesSpawnFn, timeoutMs: 5000 });
  assertEqual("gitleaks run: EACCES -> execution_environment (not missing/finding)", { status: result.status, classification: result.classification, findings: result.findings.length }, { status: "ERROR", classification: "execution_environment", findings: 0 });
}

// ===============================================================================================
// OSV-SCANNER adapter cases
// ===============================================================================================

{
  const inst = osvScannerAdapter.isInstalled({});
  assertTrue("osv-scanner isInstalled: not installed (no override, empty PATH)", inst.installed === false, JSON.stringify(inst));
}
{
  const rootDir = makeRootDir("osv-clean-root");
  const result = await osvScannerAdapter.run({ rootDir, config: { binaryPath: osvClean }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("osv-scanner run: clean fixture -> PASS", { status: result.status, count: result.findings.length }, { status: "PASS", count: 0 });
}
{
  const rootDir = makeRootDir("osv-findings-root");
  const result = await osvScannerAdapter.run({ rootDir, config: { binaryPath: osvFindings }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("osv-scanner run: exit-code-1-with-findings is a valid run -> FINDINGS (not ERROR)", result.status, "FINDINGS");
  assertEqual(
    "osv-scanner run: severity mapping (db_specific CRITICAL / numeric CVSS 7.8 / fallback)",
    result.findings.map((f) => f.severity),
    ["critical", "high", "high"],
  );
  assertEqual(
    "osv-scanner run: rule ids preserved",
    result.findings.map((f) => f.rule),
    ["GHSA-xxxx-critical", "GHSA-yyyy-numeric", "GHSA-zzzz-unknown"],
  );
}
{
  const rootDir = makeRootDir("osv-crash-root");
  const result = await osvScannerAdapter.run({ rootDir, config: { binaryPath: osvCrash }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("osv-scanner run: garbage output + exit code 2 -> ERROR", result.status, "ERROR");
}
{
  const rootDir = makeRootDir("osv-missing-results-root");
  const result = await osvScannerAdapter.run({ rootDir, config: { binaryPath: osvMissingResults }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("osv-scanner run: valid JSON without top-level results[] -> scanner_error", { status: result.status, classification: result.classification }, { status: "ERROR", classification: "scanner_error" });
}
{
  const rootDir = makeRootDir("osv-malformed-packages-root");
  const result = await osvScannerAdapter.run({ rootDir, config: { binaryPath: osvMalformedPackages }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("osv-scanner run: v2 result with packages object (not array) -> scanner_error", { status: result.status, classification: result.classification, findings: result.findings.length }, { status: "ERROR", classification: "scanner_error", findings: 0 });
  assertIncludes("osv-scanner run: malformed packages failure names results[0].packages", result.reason, "results[0].packages");
}
{
  const rootDir = makeRootDir("osv-missing-groups-root");
  const result = await osvScannerAdapter.run({ rootDir, config: { binaryPath: osvMissingGroups }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("osv-scanner run: v2 package without groups[] -> scanner_error", { status: result.status, classification: result.classification, findings: result.findings.length }, { status: "ERROR", classification: "scanner_error", findings: 0 });
  assertIncludes("osv-scanner run: missing groups failure names results[0].packages[0].groups", result.reason, "results[0].packages[0].groups");
}
{
  const rootDir = makeRootDir("osv-malformed-vulnerability-root");
  const result = await osvScannerAdapter.run({ rootDir, config: { binaryPath: osvMalformedVulnerability }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("osv-scanner run: v2 vulnerability with non-string id -> scanner_error", { status: result.status, classification: result.classification, findings: result.findings.length }, { status: "ERROR", classification: "scanner_error", findings: 0 });
  assertIncludes("osv-scanner run: malformed vulnerability failure names id", result.reason, "id");
}
{
  // F2 fix: exit 128 + "No package sources found" -- project has nothing to scan, honest
  // SKIPPED, not a blocking ERROR (specs/2026-07-07-ap1-tuning/e2e-demo.md Finding F2).
  const rootDir = makeRootDir("osv-no-package-sources-root");
  const result = await osvScannerAdapter.run({ rootDir, config: { binaryPath: osvNoPackageSources }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("osv-scanner run: exit 128 + 'No package sources found' -> SKIPPED (F2 fix)", result.status, "SKIPPED");
  assertIncludes("osv-scanner run: SKIPPED reason mentions no package sources", result.reason, "no package sources");
}
{
  // Any OTHER exit 128 stays ERROR (fail-closed unchanged) -- only the exact "No package
  // sources found" text triggers the SKIPPED special case.
  const rootDir = makeRootDir("osv-exit-128-other-root");
  const result = await osvScannerAdapter.run({ rootDir, config: { binaryPath: osvExit128Other }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("osv-scanner run: exit 128 with DIFFERENT output -> still ERROR (fail-closed)", result.status, "ERROR");
  assertIncludes("osv-scanner run: exit-128-other reason mentions exit code", result.reason, "exited 128");
}
{
  const rootDir = makeRootDir("osv-v1-root");
  const result = await osvScannerAdapter.run({ rootDir, config: { binaryPath: osvV1 }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("osv-scanner run: major v1 -> incompatible_major before scan", { status: result.status, classification: result.classification, findings: result.findings.length }, { status: "ERROR", classification: "incompatible_major", findings: 0 });
  assertIncludes("osv-scanner run: incompatible major names v2 requirement", result.reason, "v2");
}
{
  const rootDir = makeRootDir("osv-eperm-root");
  const result = await osvScannerAdapter.run({ rootDir, config: { binaryPath: osvClean }, spawnFn: epermSpawnFn, timeoutMs: 5000 });
  assertEqual("osv-scanner run: EPERM version probe -> execution_environment", { status: result.status, classification: result.classification, findings: result.findings.length }, { status: "ERROR", classification: "execution_environment", findings: 0 });
}
{
  const rootDir = makeRootDir("osv-eacces-root");
  const result = await osvScannerAdapter.run({ rootDir, config: { binaryPath: osvClean }, spawnFn: eaccesSpawnFn, timeoutMs: 5000 });
  assertEqual("osv-scanner run: EACCES version probe -> execution_environment", { status: result.status, classification: result.classification, findings: result.findings.length }, { status: "ERROR", classification: "execution_environment", findings: 0 });
}

// ===============================================================================================
// SEMGREP adapter cases
// ===============================================================================================

{
  const inst = semgrepAdapter.isInstalled({});
  assertTrue("semgrep isInstalled: not installed (no override, empty PATH)", inst.installed === false, JSON.stringify(inst));
}
{
  const rootDir = makeRootDir("semgrep-clean-root");
  const result = await semgrepAdapter.run({ rootDir, config: { binaryPath: semgrepClean }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("semgrep run: clean fixture -> PASS", { status: result.status, count: result.findings.length }, { status: "PASS", count: 0 });
}
{
  const rootDir = makeRootDir("semgrep-findings-root");
  const result = await semgrepAdapter.run({ rootDir, config: { binaryPath: semgrepFindings }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("semgrep run: findings fixture -> FINDINGS", result.status, "FINDINGS");
  assertEqual(
    "semgrep run: severity mapping ERROR/WARNING/INFO -> high/medium/info",
    result.findings.map((f) => f.severity),
    ["high", "medium", "info"],
  );
}
{
  const rootDir = makeRootDir("semgrep-crash-root");
  const result = await semgrepAdapter.run({ rootDir, config: { binaryPath: semgrepCrash }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("semgrep run: garbage output -> ERROR", result.status, "ERROR");
}
{
  const rootDir = makeRootDir("semgrep-nonzero-clean-body-root");
  const result = await semgrepAdapter.run({ rootDir, config: { binaryPath: semgrepNonzeroCleanBody }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("semgrep run: nonzero exit with clean-looking results[] -> scanner_error", { status: result.status, classification: result.classification }, { status: "ERROR", classification: "scanner_error" });
}
{
  const rootDir = makeRootDir("semgrep-error-payload-root");
  const result = await semgrepAdapter.run({ rootDir, config: { binaryPath: semgrepErrorPayload }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("semgrep run: JSON error payload with empty results[] -> scanner_error", { status: result.status, classification: result.classification }, { status: "ERROR", classification: "scanner_error" });
}
{
  const rootDir = makeRootDir("semgrep-missing-results-root");
  const result = await semgrepAdapter.run({ rootDir, config: { binaryPath: semgrepMissingResults }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("semgrep run: valid JSON without results[] -> scanner_error", { status: result.status, classification: result.classification }, { status: "ERROR", classification: "scanner_error" });
}
{
  const rootDir = makeRootDir("semgrep-eperm-root");
  const result = await semgrepAdapter.run({ rootDir, config: { binaryPath: semgrepClean }, spawnFn: epermSpawnFn, timeoutMs: 5000 });
  assertEqual("semgrep run: EPERM -> execution_environment (not missing/finding)", { status: result.status, classification: result.classification, findings: result.findings.length }, { status: "ERROR", classification: "execution_environment", findings: 0 });
}
{
  const rootDir = makeRootDir("semgrep-eacces-root");
  const result = await semgrepAdapter.run({ rootDir, config: { binaryPath: semgrepClean }, spawnFn: eaccesSpawnFn, timeoutMs: 5000 });
  assertEqual("semgrep run: EACCES -> execution_environment (not missing/finding)", { status: result.status, classification: result.classification, findings: result.findings.length }, { status: "ERROR", classification: "execution_environment", findings: 0 });
}

// ===============================================================================================
// LICENSE-CHECK adapter cases
// ===============================================================================================

{
  const inst = licenseCheckAdapter.isInstalled({});
  assertTrue("license-check isInstalled: always true (no binary)", inst.installed === true, JSON.stringify(inst));
}
{
  const rootDir = makeRootDir("license-allowed-root");
  writeLicenseFiles(rootDir, {
    allowlist: { allow: ["MIT"], deny: ["GPL-3.0"] },
    declared: { dependencies: [{ name: "pkgA", version: "1.0.0", license: "MIT" }] },
  });
  const result = await licenseCheckAdapter.run({
    rootDir,
    config: {
      allowlistPath: join(rootDir, "governance", "examples", "policies", "license-allowlist.json"),
      declaredPath: join(rootDir, "third-party-licenses.json"),
    },
  });
  assertEqual("license-check run: all-allowed -> PASS", { status: result.status, count: result.findings.length }, { status: "PASS", count: 0 });
}
{
  const rootDir = makeRootDir("license-violation-root");
  writeLicenseFiles(rootDir, {
    allowlist: { allow: ["MIT"], deny: ["GPL-3.0"] },
    declared: {
      dependencies: [
        { name: "pkgA", version: "1.0.0", license: "MIT" },
        { name: "pkgB", version: "2.0.0", license: "GPL-3.0" },
        { name: "pkgC", version: "3.0.0", license: "BSD-3-Clause" },
      ],
    },
  });
  const result = await licenseCheckAdapter.run({
    rootDir,
    config: {
      allowlistPath: join(rootDir, "governance", "examples", "policies", "license-allowlist.json"),
      declaredPath: join(rootDir, "third-party-licenses.json"),
    },
  });
  assertEqual("license-check run: allowlist violation -> FINDINGS (denied + not-allowed)", { status: result.status, count: result.findings.length }, { status: "FINDINGS", count: 2 });
  assertIncludes("license-check run: denied-license finding message", result.findings[0].msg, "explicitly denied");
  assertIncludes("license-check run: not-in-allowlist finding message", result.findings[1].msg, "not in the allowlist");
  assertTrue("license-check run: findings severity fixed high", result.findings.every((f) => f.severity === "high"), JSON.stringify(result.findings));
}
{
  const rootDir = makeRootDir("license-missing-declared-root");
  writeLicenseFiles(rootDir, { allowlist: { allow: ["MIT"], deny: [] } });
  const result = await licenseCheckAdapter.run({
    rootDir,
    config: {
      allowlistPath: join(rootDir, "governance", "examples", "policies", "license-allowlist.json"),
      declaredPath: join(rootDir, "third-party-licenses.json"),
    },
  });
  assertEqual("license-check run: missing declared file -> SKIPPED", result.status, "SKIPPED");
}
{
  const rootDir = makeRootDir("license-missing-allowlist-root");
  writeLicenseFiles(rootDir, { declared: { dependencies: [] } });
  const result = await licenseCheckAdapter.run({
    rootDir,
    config: {
      allowlistPath: join(rootDir, "governance", "examples", "policies", "license-allowlist.json"),
      declaredPath: join(rootDir, "third-party-licenses.json"),
    },
  });
  assertEqual("license-check run: missing allowlist file -> SKIPPED", result.status, "SKIPPED");
}
{
  const rootDir = makeRootDir("license-malformed-root");
  mkdirSync(join(rootDir, "governance", "examples", "policies"), { recursive: true });
  writeFileSync(join(rootDir, "governance", "examples", "policies", "license-allowlist.json"), "{not-valid-json");
  writeFileSync(join(rootDir, "third-party-licenses.json"), JSON.stringify({ dependencies: [] }));
  const result = await licenseCheckAdapter.run({
    rootDir,
    config: {
      allowlistPath: join(rootDir, "governance", "examples", "policies", "license-allowlist.json"),
      declaredPath: join(rootDir, "third-party-licenses.json"),
    },
  });
  assertEqual("license-check run: malformed allowlist JSON -> ERROR", result.status, "ERROR");
}
{
  const rootDir = makeRootDir("license-invalid-allowlist-root");
  writeLicenseFiles(rootDir, {
    allowlist: { allow: ["MIT"] },
    declared: { dependencies: [] },
  });
  const result = await licenseCheckAdapter.run({
    rootDir,
    config: {
      allowlistPath: join(rootDir, "governance", "examples", "policies", "license-allowlist.json"),
      declaredPath: join(rootDir, "third-party-licenses.json"),
    },
  });
  assertEqual("license-check run: valid JSON allowlist without deny[] -> scanner_error", { status: result.status, classification: result.classification, count: result.findings.length }, { status: "ERROR", classification: "scanner_error", count: 0 });
}
{
  const rootDir = makeRootDir("license-invalid-declaration-root");
  writeLicenseFiles(rootDir, {
    allowlist: { allow: ["MIT"], deny: [] },
    declared: {},
  });
  const result = await licenseCheckAdapter.run({
    rootDir,
    config: {
      allowlistPath: join(rootDir, "governance", "examples", "policies", "license-allowlist.json"),
      declaredPath: join(rootDir, "third-party-licenses.json"),
    },
  });
  assertEqual("license-check run: valid JSON declaration without dependencies[] -> scanner_error", { status: result.status, classification: result.classification, count: result.findings.length }, { status: "ERROR", classification: "scanner_error", count: 0 });
}

// ===============================================================================================
// RUNNER (security-scan.mjs / runSecurityScan) aggregation cases
// ===============================================================================================

{
  // manifest absent -> defaults applied (all 4 scanners attempted, all SKIPPED here since
  // neither fixture binaries nor governance/license files exist in this bare rootDir).
  const rootDir = makeRootDir("runner-manifest-absent-root");
  const { evidence, exitCode } = await runSecurityScan({ rootDir, env: {}, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("runner: manifest absent -> exit 0 (nothing installed/configured, nothing blocking)", exitCode, 0);
  assertEqual(
    "runner: manifest absent -> all 4 scanners attempted (defaults enabled) and SKIPPED",
    evidence.scanners.map((s) => [s.tool, s.status]),
    [
      ["gitleaks", "SKIPPED"],
      ["osv-scanner", "SKIPPED"],
      ["semgrep", "SKIPPED"],
      ["license-check", "SKIPPED"],
    ],
  );
  assertEqual("runner: manifest absent -> default thresholds", evidence.thresholds, { block_on: ["critical", "high"] });
  assertEqual("runner: manifest absent -> binary-backed SKIPPED entries classify binary_missing", evidence.scanners.slice(0, 3).map((s) => s.classification), ["binary_missing", "binary_missing", "binary_missing"]);
  assertEqual("runner: manifest absent -> child-process preflight succeeds", evidence.execution.childProcessPreflight, { status: "PASS", classification: "success" });
  const evidenceFile = join(rootDir, "evidence", "security-latest.json");
  assertTrue("runner: evidence file written (manifest-absent path)", existsSync(evidenceFile), evidenceFile);
  const onDisk = JSON.parse(readFileSync(evidenceFile, "utf8"));
  assertEqual("runner: evidence file content matches returned evidence", onDisk, evidence);
}

{
  // Mixed statuses + full schema shape assertion.
  const rootDir = makeRootDir("runner-mixed-root");
  writeManifest(
    rootDir,
    `schema: pipeline.manifest.v0

gates:
  security:
    mode: blocking
    type: automated

security:
  scanners:
    gitleaks:
      enabled: true
    osv-scanner:
      enabled: true
    semgrep:
      enabled: true
    license-check:
      enabled: true
  thresholds:
    block_on:
      - critical
      - high

governance:
  policies_path: governance/examples/policies
`,
  );
  writeLicenseFiles(rootDir, {
    allowlist: { allow: ["MIT"], deny: [] },
    declared: { dependencies: [{ name: "pkgA", version: "1.0.0", license: "MIT" }] },
  });
  const env = {
    PIPELINE_GITLEAKS_PATH: gitleaksFindings,
    PIPELINE_OSV_SCANNER_PATH: osvClean,
    PIPELINE_SEMGREP_PATH: semgrepCrash,
  };
  const { evidence, exitCode } = await runSecurityScan({ rootDir, env, spawnFn: fixtureSpawnFn, timeoutMs: 5000, assessTrustedExecutablePath: mockAssessFixtureBinary });

  assertEqual(
    "runner: mixed statuses -> [FINDINGS, PASS, ERROR, PASS]",
    evidence.scanners.map((s) => [s.tool, s.status]),
    [
      ["gitleaks", "FINDINGS"],
      ["osv-scanner", "PASS"],
      ["semgrep", "ERROR"],
      ["license-check", "PASS"],
    ],
  );
  assertEqual("runner: mixed statuses -> exit 2 (ERROR + high findings, mode blocking)", exitCode, 2);
  assertEqual("runner: mixed statuses -> findings array carries the 2 gitleaks findings", evidence.findings.length, 2);
  assertTrue(
    "runner: evidence full schema field set",
    ["schema", "project", "command", "commit", "candidate", "finishedAt", "thresholds", "execution", "scanners", "findings", "exitCode"].every((k) =>
      Object.prototype.hasOwnProperty.call(evidence, k),
    ),
    JSON.stringify(Object.keys(evidence)),
  );
  assertEqual("runner: evidence.schema", evidence.schema, "pipeline.security-evidence.v1");
  assertEqual("runner: non-Git fixture records unavailable candidate binding", evidence.candidate, {
    status: "unavailable", commit: null, tree: null, inputSha256: null,
    repositorySha256: null, inventory: null, reason: "git-identity-unavailable",
    snapshot: { method: null, verifiedBeforeAfter: false },
  });
  assertEqual("runner: evidence.command", evidence.command, "node harness/scripts/security-scan.mjs");
  assertTrue("runner: evidence.commit is a non-empty string", typeof evidence.commit === "string" && evidence.commit.length > 0, evidence.commit);
  assertTrue("runner: evidence.project is a non-empty string", typeof evidence.project === "string" && evidence.project.length > 0, evidence.project);
  assertTrue(
    "runner: evidence file written on a blocking-exit path",
    existsSync(join(rootDir, "evidence", "security-latest.json")),
    "evidence/security-latest.json missing",
  );
}

{
  const rootDir = makeRootDir("runner-child-preflight-eperm-root");
  const env = {
    PIPELINE_GITLEAKS_PATH: gitleaksClean,
    PIPELINE_OSV_SCANNER_PATH: osvClean,
    PIPELINE_SEMGREP_PATH: semgrepClean,
  };
  const { evidence, exitCode } = await runSecurityScan({ rootDir, env, spawnFn: epermSpawnFn, timeoutMs: 5000 });
  assertEqual("runner: child preflight EPERM is execution_environment", evidence.execution.childProcessPreflight.classification, "execution_environment");
  assertEqual(
    "runner: child preflight EPERM preempts all binary scanners without missing/finding classification",
    evidence.scanners.slice(0, 3).map((s) => [s.tool, s.status, s.classification, s.findingCount]),
    [
      ["gitleaks", "ERROR", "execution_environment", 0],
      ["osv-scanner", "ERROR", "execution_environment", 0],
      ["semgrep", "ERROR", "execution_environment", 0],
    ],
  );
  assertEqual("runner: child preflight EPERM is fail-closed", exitCode, 2);
}

{
  const rootDir = makeRootDir("runner-child-preflight-eacces-root");
  const env = {
    PIPELINE_GITLEAKS_PATH: gitleaksClean,
    PIPELINE_OSV_SCANNER_PATH: osvClean,
    PIPELINE_SEMGREP_PATH: semgrepClean,
  };
  const { evidence, exitCode } = await runSecurityScan({ rootDir, env, spawnFn: eaccesSpawnFn, timeoutMs: 5000 });
  assertEqual("runner: child preflight EACCES is execution_environment", evidence.execution.childProcessPreflight.classification, "execution_environment");
  assertEqual("runner: child preflight EACCES preempts binary scanners", evidence.scanners.slice(0, 3).map((s) => s.classification), ["execution_environment", "execution_environment", "execution_environment"]);
  assertEqual("runner: child preflight EACCES is fail-closed", exitCode, 2);
}

{
  // Threshold filtering: a medium finding must not block when block_on = [critical, high].
  const rootDir = makeRootDir("runner-threshold-root");
  writeManifest(
    rootDir,
    `schema: pipeline.manifest.v0

gates:
  security:
    mode: blocking
    type: automated

security:
  scanners:
    gitleaks:
      enabled: false
    osv-scanner:
      enabled: false
    semgrep:
      enabled: true
    license-check:
      enabled: false
  thresholds:
    block_on:
      - critical
      - high
`,
  );
  const env = { PIPELINE_SEMGREP_PATH: semgrepWarningOnly };
  const { evidence, exitCode } = await runSecurityScan({ rootDir, env, spawnFn: fixtureSpawnFn, timeoutMs: 5000, assessTrustedExecutablePath: mockAssessFixtureBinary });
  assertEqual("runner: threshold filtering -> only semgrep ran", evidence.scanners.map((s) => s.tool), ["semgrep"]);
  assertEqual("runner: threshold filtering -> semgrep FINDINGS (1 medium)", evidence.scanners[0].status, "FINDINGS");
  assertEqual("runner: threshold filtering -> medium below block_on -> exit 0 (no block)", exitCode, 0);
}

{
  // mode "warn" -> exit 1 instead of 2, for an otherwise-blocking finding.
  const rootDir = makeRootDir("runner-warn-root");
  writeManifest(
    rootDir,
    `schema: pipeline.manifest.v0

gates:
  security:
    mode: warn
    type: automated

security:
  scanners:
    gitleaks:
      enabled: false
    osv-scanner:
      enabled: false
    semgrep:
      enabled: true
    license-check:
      enabled: false
`,
  );
  const env = { PIPELINE_SEMGREP_PATH: semgrepFindings };
  const { exitCode } = await runSecurityScan({ rootDir, env, spawnFn: fixtureSpawnFn, timeoutMs: 5000, assessTrustedExecutablePath: mockAssessFixtureBinary });
  assertEqual("runner: mode warn -> exit 1 (not 2) for a blocking-class finding", exitCode, 1);
}

{
  // ERROR forces blocking-class even with zero findings.
  const rootDir = makeRootDir("runner-error-zero-findings-root");
  writeManifest(
    rootDir,
    `schema: pipeline.manifest.v0

gates:
  security:
    mode: blocking
    type: automated

security:
  scanners:
    gitleaks:
      enabled: false
    osv-scanner:
      enabled: false
    semgrep:
      enabled: true
    license-check:
      enabled: false
`,
  );
  const env = { PIPELINE_SEMGREP_PATH: semgrepCrash };
  const { evidence, exitCode } = await runSecurityScan({ rootDir, env, spawnFn: fixtureSpawnFn, timeoutMs: 5000, assessTrustedExecutablePath: mockAssessFixtureBinary });
  assertEqual("runner: ERROR + zero findings -> findings array empty", evidence.findings.length, 0);
  assertEqual("runner: ERROR + zero findings -> still blocking-class -> exit 2", exitCode, 2);
}

{
  // Disabled scanners are omitted from scanners[] entirely (never silently "PASS").
  const rootDir = makeRootDir("runner-disabled-root");
  writeManifest(
    rootDir,
    `schema: pipeline.manifest.v0

security:
  scanners:
    gitleaks:
      enabled: false
    osv-scanner:
      enabled: false
    semgrep:
      enabled: false
    license-check:
      enabled: false
`,
  );
  const { evidence, exitCode } = await runSecurityScan({ rootDir, env: {}, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("runner: all scanners disabled -> empty scanners[] and findings[]", { scanners: evidence.scanners.length, findings: evidence.findings.length }, { scanners: 0, findings: 0 });
  assertEqual("runner: all scanners disabled -> exit 0", exitCode, 0);
}

{
  // Exact-candidate evidence is produced only from a detached materialization,
  // never from the caller's attached worktree.
  const rootDir = makeRootDir("runner-exact-candidate-clean-root");
  writeManifest(
    rootDir,
    `schema: pipeline.manifest.v0

gates:
  security:
    mode: blocking
    type: automated

security:
  scanners:
    gitleaks:
      enabled: false
    osv-scanner:
      enabled: false
    semgrep:
      enabled: false
    license-check:
      enabled: false
`,
  );
  writeFileSync(join(rootDir, "governed.txt"), "committed candidate bytes\\n");
  commitFixture(rootDir);
  const { evidence, exitCode } = await runSecurityScan({ rootDir, env: {}, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("runner: clean Git candidate is scanned from a verified detached worktree", {
    exitCode, status: evidence.candidate.status, method: evidence.candidate.snapshot.method,
    verified: evidence.candidate.snapshot.verifiedBeforeAfter,
  }, { exitCode: 0, status: "clean", method: "git-detached-worktree.v1", verified: true });
  assertTrue("runner: exact candidate omits private worktree path", !JSON.stringify(evidence).includes(rootDir), JSON.stringify(evidence));
}

{
  // An uncommitted local fix must not supply a clean verdict for the vulnerable
  // committed subject: no adapter receives the mutable root at all.
  const rootDir = makeRootDir("runner-exact-candidate-dirty-root");
  writeManifest(
    rootDir,
    `schema: pipeline.manifest.v0

gates:
  security:
    mode: blocking
    type: automated

security:
  scanners:
    gitleaks:
      enabled: false
    osv-scanner:
      enabled: false
    semgrep:
      enabled: false
    license-check:
      enabled: false
`,
  );
  writeFileSync(join(rootDir, "governed.txt"), "vulnerable committed bytes\\n");
  commitFixture(rootDir);
  writeFileSync(join(rootDir, "governed.txt"), "uncommitted apparent fix\\n");
  const { evidence, exitCode } = await runSecurityScan({ rootDir, env: {}, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("runner: dirty Git candidate is rejected before a mutable scan", {
    exitCode, status: evidence.candidate.status, verified: evidence.candidate.snapshot.verifiedBeforeAfter,
  }, { exitCode: 2, status: "dirty", verified: false });
}

{
  // A scanner-side mutation of the detached tree invalidates the result even
  // though the attached HEAD and its tree remain unchanged.
  const rootDir = makeRootDir("runner-exact-candidate-mutation-root");
  writeManifest(
    rootDir,
    `schema: pipeline.manifest.v0

gates:
  security:
    mode: blocking
    type: automated

security:
  scanners:
    gitleaks:
      enabled: true
    osv-scanner:
      enabled: false
    semgrep:
      enabled: false
    license-check:
      enabled: false
`,
  );
  writeFileSync(join(rootDir, "governed.txt"), "candidate bytes\\n");
  commitFixture(rootDir);
  const { evidence, exitCode } = await runSecurityScan({
    rootDir,
    env: { PIPELINE_GITLEAKS_PATH: gitleaksMutatesCandidate }, spawnFn: fixtureSpawnFn,
    timeoutMs: 5000, assessTrustedExecutablePath: mockAssessFixtureBinary,
  });
  assertEqual("runner: scanner mutation invalidates an otherwise clean candidate", {
    exitCode, status: evidence.candidate.status, verified: evidence.candidate.snapshot.verifiedBeforeAfter,
  }, { exitCode: 2, status: "clean", verified: false });
}

if (process.platform !== "win32") {
  // POSIX-only: resolveTrustedSystemExecutable's HOME/.local/bin fallback is a POSIX
  // behavior with no Windows equivalent (win32 resolution instead requires a fixed
  // system-root allowlist + a real .exe, per trusted-tool-resolution.mjs, RESERVED).
  // Creating a file symlink here also requires elevated privilege / Developer Mode on
  // Windows, which this suite must not assume -- so this case is win32-gated rather
  // than faked.
  const rootDir = makeRootDir("runner-standard-user-bin-root");
  const fakeHome = makeRootDir("runner-standard-user-bin-home");
  const localBin = join(fakeHome, ".local", "bin");
  mkdirSync(localBin, { recursive: true });
  symlinkSync(semgrepClean, join(localBin, "semgrep"));
  writeManifest(
    rootDir,
    `schema: pipeline.manifest.v0

security:
  scanners:
    gitleaks:
      enabled: false
    osv-scanner:
      enabled: false
    semgrep:
      enabled: true
    license-check:
      enabled: false
`,
  );
  const { evidence, exitCode } = await runSecurityScan({ rootDir, env: { HOME: fakeHome, PATH: `${dirname(process.execPath)}:/usr/bin:/bin` }, spawnFn: fixtureSpawnFn, timeoutMs: 5000 });
  assertEqual("runner: standard user-local Semgrep is discovered outside arbitrary PATH", evidence.scanners.map((entry) => [entry.tool, entry.status]), [["semgrep", "PASS"]]);
  assertEqual("runner: standard user-local Semgrep keeps a clean scan non-blocking", exitCode, 0);
}

// ===============================================================================================
// CLI smoke test (real child process, bare rootDir -> everything SKIPPED, exit 0)
// ===============================================================================================

{
  const rootDir = makeRootDir("cli-smoke-root");
  const { PIPELINE_GITLEAKS_PATH, PIPELINE_OSV_SCANNER_PATH, PIPELINE_SEMGREP_PATH, ...baseEnv } = process.env;
  // A blank PATH plus an empty fixture HOME keeps this bare-root smoke
  // independent from host-installed system and standard per-user scanners.
  const res = spawnSync(process.execPath, [SCRIPT, "--root", rootDir, "--timeout-ms", "5000"], { encoding: "utf8", env: { ...baseEnv, HOME: rootDir, PATH: "", Path: "" }, shell: false });
  assertEqual("CLI: bare rootDir -> exit 0", res.status, 0);
  assertIncludes("CLI: stdout contains verdict line", res.stdout, "Verdict: CLEAN");
  assertIncludes("CLI: stdout reports evidence path", res.stdout, "Evidence written:");
  assertTrue("CLI: evidence file actually created", existsSync(join(rootDir, "evidence", "security-latest.json")), "no evidence file");
}

// ---- Summary -------------------------------------------------------------------------------------
try {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
} catch {
  /* temp cleanup is best-effort */
}
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
