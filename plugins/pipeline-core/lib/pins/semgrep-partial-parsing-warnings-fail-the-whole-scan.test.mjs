// SPDX-License-Identifier: SUL-1.0
// Regression pin for backlog item pipeline.semgrep-partial-parsing-warnings-fail-the-whole-scan (AC-252).
// Original acceptance (option B, PO decision 2026-10-06): warn-level PartialParsing entries are degraded
// coverage, not a scanner error. Points pinned:
//   P1 warn+PartialParsing errors[] with findings: findings are KEPT (not dropped), status FINDINGS,
//      coverage { degraded, partial-parsing, files } names the partially parsed files (relative, sorted, deduped).
//   P2 warn+PartialParsing with zero findings stays PASS, with the degraded coverage note.
//   P3 the dropped results never disappear silently: through the real runSecurityScan the findings and the
//      coverage note reach the evidence and the verdict is not a scanner error.
//   P4 level "error" PartialParsing, Timeout, mixed entries, missing path/level/type, paths outside the scan
//      root and non-array errors[] all stay scanner_error with zero findings (fail closed).
//   P5 a clean body carries no coverage field (full coverage); a nonzero exit stays scanner_error.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { run } from "../../scripts/security-adapters/semgrep.mjs";
import { runSecurityScan } from "../../scripts/security-scan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const FIXTURE_ROOT = mkdtempSync(join(SCRATCH, "semgrep-partial-warn-"));
const BIN_DIR = join(FIXTURE_ROOT, "bin");
mkdirSync(BIN_DIR, { recursive: true });
const SCAN_ROOT = join(FIXTURE_ROOT, "adapter-root");
mkdirSync(SCAN_ROOT, { recursive: true });

const finding = { check_id: "rule.one", path: "src/a.mjs", start: { line: 7 }, extra: { severity: "ERROR", message: "bad" } };
const warnPartial = (path) => ({ code: 3, level: "warn", type: ["PartialParsing", [{ path }]], path, message: "x" });

function adapt(body, { status = 0 } = {}) {
  let spawned = 0;
  return run({
    rootDir: SCAN_ROOT,
    config: { binaryPath: "semgrep-fixture-binary" },
    spawnFn: () => {
      spawned += 1;
      return { status, stdout: typeof body === "string" ? body : JSON.stringify(body), stderr: "" };
    },
  }).then((r) => {
    assert.equal(spawned, 1, "injected spawnFn is the only process boundary");
    return r;
  });
}

test("P1: warn PartialParsing + a finding keeps the finding and names the partially parsed files", async () => {
  const r = await adapt({
    results: [finding],
    errors: [warnPartial("src/z.mjs"), warnPartial("src/b.mjs"), warnPartial("src/z.mjs")],
  });
  assert.equal(r.status, "FINDINGS");
  assert.equal(r.classification, "findings");
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].rule, "rule.one");
  assert.equal(r.findings[0].severity, "high");
  assert.deepEqual(r.coverage, { status: "degraded", reason: "partial-parsing", files: ["src/b.mjs", "src/z.mjs"] });
});

test("P1: PartialParsing type as a plain string and an absolute in-root path are accepted, path made relative", async () => {
  const r = await adapt({
    results: [finding],
    errors: [{ level: "warn", type: "PartialParsing", path: join(SCAN_ROOT, "src", "c.mjs") }],
  });
  assert.equal(r.status, "FINDINGS");
  assert.deepEqual(r.coverage.files, ["src/c.mjs"]);
  assert.ok(!r.coverage.files.some((f) => /^[A-Za-z]:|^\//.test(f)), "coverage files are never absolute");
});

test("P2: warn PartialParsing with no findings stays PASS with degraded coverage", async () => {
  const r = await adapt({ results: [], errors: [warnPartial("src/b.mjs")] });
  assert.equal(r.status, "PASS");
  assert.equal(r.classification, "success");
  assert.deepEqual(r.coverage, { status: "degraded", reason: "partial-parsing", files: ["src/b.mjs"] });
});

test("P5: clean body has no coverage field; empty errors[] is full coverage", async () => {
  for (const body of [{ results: [] }, { results: [], errors: [] }]) {
    const r = await adapt(body);
    assert.equal(r.status, "PASS");
    assert.equal("coverage" in r, false);
  }
});

const failClosed = [
  ["level error PartialParsing", { level: "error", type: ["PartialParsing", []], path: "src/a.mjs" }],
  ["warn Timeout", { level: "warn", type: "Timeout", path: "src/a.mjs" }],
  ["level error Timeout", { level: "error", type: "Timeout", path: "src/a.mjs" }],
  ["missing level", { type: ["PartialParsing", []], path: "src/a.mjs" }],
  ["missing type", { level: "warn", path: "src/a.mjs" }],
  ["missing path", { level: "warn", type: ["PartialParsing", []] }],
  ["path outside scan root", { level: "warn", type: ["PartialParsing", []], path: "../outside.mjs" }],
  ["foreign absolute path", { level: "warn", type: ["PartialParsing", []], path: "\\\\server\\share\\x.mjs" }],
  ["non-object entry", "boom"],
];
for (const [label, entry] of failClosed) {
  test(`P4: ${label} keeps the whole result scanner_error, zero findings`, async () => {
    const r = await adapt({ results: [finding], errors: [entry] });
    assert.equal(r.status, "ERROR");
    assert.equal(r.classification, "scanner_error");
    assert.deepEqual(r.findings, []);
    assert.equal("coverage" in r, false);
  });
}

test("P4: one warn PartialParsing mixed with one error entry stays scanner_error", async () => {
  const r = await adapt({
    results: [finding],
    errors: [warnPartial("src/a.mjs"), { level: "error", type: "Timeout", path: "src/b.mjs" }],
  });
  assert.equal(r.status, "ERROR");
  assert.equal(r.classification, "scanner_error");
});

test("P4: non-array errors payload stays scanner_error", async () => {
  const r = await adapt({ results: [finding], errors: { level: "warn" } });
  assert.equal(r.status, "ERROR");
  assert.equal(r.classification, "scanner_error");
});

test("P5: nonzero exit stays scanner_error even with a warn-only PartialParsing body", async () => {
  const r = await adapt({ results: [finding], errors: [warnPartial("src/a.mjs")] }, { status: 2 });
  assert.equal(r.status, "ERROR");
  assert.equal(r.classification, "scanner_error");
  assert.deepEqual(r.findings, []);
});

// ---- P3: through the real security-scan runner with a fake semgrep binary (no network) ----
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
const fixtureSpawnFn = (cmd, args, opts) =>
  spawnSync(cmd, args, { ...opts, shell: process.platform === "win32" && cmd !== process.execPath });
const trustFixtureBinary = (p) =>
  typeof p === "string" && p.startsWith(BIN_DIR) ? { ok: true, path: p } : { ok: false, status: "untrusted_path" };
function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}
function makeRoot(label) {
  const root = mkdtempSync(join(FIXTURE_ROOT, `${label}-`));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(
    join(root, ".claude", "pipeline.yaml"),
    `schema: pipeline.manifest.v0\n\nsecurity:\n  scanners:\n    gitleaks:\n      enabled: false\n    osv-scanner:\n      enabled: false\n    semgrep:\n      enabled: true\n    license-check:\n      enabled: false\n`,
  );
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.js"), "export const alpha = 1;\n");
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "remote", "add", "origin", "https://example.invalid/pipeline/fixture.git");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "fixture");
  return root;
}
const scan = (root, binary) =>
  runSecurityScan({
    rootDir: root, env: { PIPELINE_SEMGREP_PATH: binary }, spawnFn: fixtureSpawnFn,
    timeoutMs: 30000, assessTrustedExecutablePath: trustFixtureBinary,
  });
const body = (errorsJs) =>
  `process.stdout.write(JSON.stringify({ results: [{ check_id: "rule.one", path: "src/alpha.js", start: { line: 1 }, extra: { severity: "ERROR", message: "bad" } }], errors: ${errorsJs} }));\nprocess.exit(0);\n`;

test("P3: real runSecurityScan keeps the finding and the degraded-coverage note when semgrep warns about partial parsing", async () => {
  const bin = writeFixtureBinary(
    "semgrep-warn-with-finding",
    body(`[{ code: 3, level: "warn", type: ["PartialParsing", []], path: "src/alpha.js", message: "x" }]`),
  );
  const { evidence } = await scan(makeRoot("warn"), bin);
  const entry = evidence.scanners.find((s) => s.tool === "semgrep");
  assert.ok(entry, "semgrep entry present");
  assert.notEqual(entry.classification, "scanner_error", "partial parsing must not fail the whole scan");
  assert.equal(entry.status, "FINDINGS");
  assert.equal(entry.findingCount, 1, "the finding is shown, not dropped");
  // The runner adds scope fields (subject, exclusions) to the adapter's coverage; the acceptance fields must survive.
  assert.equal(entry.coverage.status, "degraded");
  assert.equal(entry.coverage.reason, "partial-parsing");
  assert.deepEqual(entry.coverage.files, ["src/alpha.js"]);
});

test("P3/P4: real runSecurityScan still reports scanner_error for an error-level entry", async () => {
  const bin = writeFixtureBinary(
    "semgrep-error-level",
    body(`[{ code: 3, level: "error", type: ["PartialParsing", []], path: "src/alpha.js", message: "x" }]`),
  );
  const { evidence } = await scan(makeRoot("err"), bin);
  const entry = evidence.scanners.find((s) => s.tool === "semgrep");
  assert.equal(entry.classification, "scanner_error");
  assert.equal(entry.findingCount, 0);
});

test("cleanup fixtures (best effort: scratch/ is gitignored; host may refuse deleting read-only git objects)", () => {
  try {
    rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  } catch {
    /* host-limitation: leftover fixture stays under ignored scratch/ */
  }
});
