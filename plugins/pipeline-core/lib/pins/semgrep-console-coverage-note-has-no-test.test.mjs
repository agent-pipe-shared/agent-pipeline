// SPDX-License-Identifier: SUL-1.0
// Regression pin for backlog item pipeline.semgrep-console-coverage-note-has-no-test (AC-250).
// Acceptance points pinned:
//   P1 a semgrep run with warn-level PartialParsing errors yields the visible console note
//      "coverage: degraded (N files partially parsed)" on the scanner's summary line, built from
//      the REAL runSecurityScan evidence (fake semgrep binary, no network, no mocks of the behavior).
//   P2 N counts distinct partially parsed files (one file reported twice counts once).
//   P3 a clean (fully parsed) run carries no coverage suffix.
//   P4 the note is exercised through a pure exported formatter (formatScannerLine) and the CLI
//      summary printer routes every scanner line through it (so a formatter regression is visible).
//   P5 the real CLI prints scanner lines in the formatter's shape, ending in the verdict line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { formatScannerLine, runSecurityScan } from "../../scripts/security-scan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const SCRIPT = join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "security-scan.mjs");
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const FIXTURE_ROOT = mkdtempSync(join(SCRATCH, "semgrep-console-note-"));
const BIN_DIR = join(FIXTURE_ROOT, "bin");
mkdirSync(BIN_DIR, { recursive: true });

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
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.js"), "export const alpha = 1;\n");
  writeFileSync(join(root, "src", "beta.js"), "export const beta = 2;\n");
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

const partial = (...paths) =>
  `const p = (path) => ({ code: 3, level: "warn", type: ["PartialParsing", []], path, message: "<redacted>" });
process.stdout.write(JSON.stringify({ results: [], errors: [${paths.map((x) => `p(${JSON.stringify(x)})`).join(", ")}] }));
process.exit(0);
`;
const clean = `process.stdout.write(JSON.stringify({ results: [], errors: [] }));\nprocess.exit(0);\n`;

test("P1+P2: warn-level PartialParsing yields the console note, counting distinct files", async () => {
  const bin = writeFixtureBinary("semgrep-partial", partial("src/alpha.js", "src/beta.js", "src/alpha.js"));
  const { evidence, exitCode } = await scan(makeRoot("partial"), bin);
  const entry = evidence.scanners.find((s) => s.tool === "semgrep");
  assert.ok(entry, "semgrep entry present");
  assert.equal(exitCode, 0, "partial parsing alone does not block");
  assert.equal(
    formatScannerLine(entry),
    "semgrep: OK [success] (0 findings) -- coverage: degraded (2 files partially parsed)",
  );
});

test("P1: a single partially parsed file reports 1 file", async () => {
  const bin = writeFixtureBinary("semgrep-partial-one", partial("src/alpha.js"));
  const { evidence } = await scan(makeRoot("partial-one"), bin);
  assert.match(
    formatScannerLine(evidence.scanners.find((s) => s.tool === "semgrep")),
    / -- coverage: degraded \(1 files partially parsed\)$/,
  );
});

test("P3: a clean run has no coverage suffix", async () => {
  const bin = writeFixtureBinary("semgrep-clean", clean);
  const { evidence } = await scan(makeRoot("clean"), bin);
  const line = formatScannerLine(evidence.scanners.find((s) => s.tool === "semgrep"));
  assert.equal(line, "semgrep: OK [success] (0 findings)");
  assert.ok(!line.includes("coverage:"));
});

test("P4: formatter contract on literal entries (suffix only for degraded + files array)", () => {
  const base = { tool: "semgrep", status: "PASS", classification: "success", findingCount: 0 };
  assert.equal(
    formatScannerLine({ ...base, coverage: { status: "degraded", reason: "partial-parsing", files: ["a", "b", "c"] } }),
    "semgrep: OK [success] (0 findings) -- coverage: degraded (3 files partially parsed)",
  );
  assert.equal(formatScannerLine({ ...base, coverage: { status: "degraded" } }), "semgrep: OK [success] (0 findings)");
  assert.equal(formatScannerLine({ ...base, coverage: { status: "full", files: ["a"] } }), "semgrep: OK [success] (0 findings)");
  assert.equal(
    formatScannerLine({ ...base, reason: "r", coverage: { status: "degraded", files: ["a"] } }),
    "semgrep: OK [success] (0 findings) -- r -- coverage: degraded (1 files partially parsed)",
  );
});

test("P4: the CLI summary printer routes every scanner line through formatScannerLine", () => {
  const src = readFileSync(SCRIPT, "utf8");
  const m = src.match(/function printSummary\(evidence\) \{[\s\S]*?\n\}/);
  assert.ok(m, "printSummary found");
  assert.match(m[0], /for \(const s of evidence\.scanners\) \{\s*console\.log\(formatScannerLine\(s\)\);\s*\}/);
});

test("P5: the real CLI prints scanner lines in the formatter shape and the verdict line", () => {
  const root = makeRoot("cli");
  const res = spawnSync(process.execPath, [SCRIPT, "--root", root, "--timeout-ms", "5000"], {
    encoding: "utf8", shell: false,
    env: { HOME: root, USERPROFILE: root, SystemRoot: process.env.SystemRoot ?? "", PATH: "", Path: "" },
  });
  assert.ok(res.status === 0 || res.status === 1 || res.status === 2, `cli exit ${res.status}: ${res.stderr}`);
  const out = res.stdout;
  assert.match(out, /^semgrep: \S+ \[[^\]]+\] \(\d+ findings\)/m);
  assert.match(out, /^Verdict: (CLEAN|WARNING|BLOCKING) /m);
});

test("cleanup fixtures (best effort: scratch/ is gitignored; host may refuse deleting read-only git objects)", () => {
  try {
    rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  } catch {
    /* host-limitation: leftover fixture stays under ignored scratch/ */
  }
});
