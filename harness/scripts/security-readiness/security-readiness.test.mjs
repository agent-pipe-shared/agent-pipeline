#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { probeGitleaks } from "./gitleaks-readiness.mjs";
import { probeOsvScanner } from "./osv-scanner-readiness.mjs";
import { probeSemgrep } from "./semgrep-readiness.mjs";
import { runPreparedScanner } from "./prepared-scanner-run.mjs";

let passed = 0;
async function check(name, fn) { await fn(); passed += 1; process.stdout.write(`PASS STR${String(passed).padStart(2, "0")} ${name}\n`); }
function fixture(name) { const root = mkdtempSync(join(tmpdir(), `${name}-readiness-`)); const path = join(root, name); writeFileSync(path, "binary\n"); chmodSync(path, 0o700); return { root, path }; }
function spawnSequence(outputs, calls) { return (command, args, options) => { calls.push({ command, args, options }); return outputs.shift(); }; }

await check("Gitleaks probe binds version, required detect capabilities and fixed child boundary", () => {
  const f = fixture("gitleaks"); const calls = [];
  try {
    const result = probeGitleaks({ executablePath: f.path, rootDir: f.root, tempDir: f.root }, { spawnFn: spawnSequence([
      { status: 0, stdout: "gitleaks version 8.28.0\n", stderr: "" },
      { status: 0, stdout: "--source --report-format --report-path --no-banner --exit-code", stderr: "" },
    ], calls), now: new Date("2026-07-18T12:00:00.000Z") });
    assert.equal(result.handle.version, "8.28.0"); assert.equal(result.handle.capabilities.length, 5);
    assert.deepEqual(calls.map(({ args }) => args), [["version"], ["detect", "--help"]]);
    assert.equal(calls.every(({ options }) => options.shell === false && options.timeout === 5000 && typeof options.env.PATH === "string" && !("HOME" in options.env)), true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
await check("Go-installed Gitleaks binds the canonical embedded module version when release ldflags are absent", () => {
  const f = fixture("gitleaks"); const calls = [];
  try {
    const result = probeGitleaks({ executablePath: f.path, rootDir: f.root, tempDir: f.root }, {
      spawnFn: spawnSequence([
        { status: 0, stdout: "version is set by build process\n", stderr: "" },
        { status: 0, stdout: `${f.path}: go1.26.0\n\tpath\tgithub.com/zricethezav/gitleaks/v8\n\tmod\tgithub.com/zricethezav/gitleaks/v8\tv8.30.1\th1:test=\n`, stderr: "" },
        { status: 0, stdout: "--source --report-format --report-path --no-banner --exit-code", stderr: "" },
      ], calls),
      resolveExecutableFn: (name) => name === "go" ? "/usr/bin/go" : null,
      now: new Date("2026-07-20T00:00:00.000Z"),
    });
    assert.equal(result.handle.version, "8.30.1");
    assert.deepEqual(calls.map(({ command, args }) => ({ command, args })), [
      { command: f.path, args: ["version"] },
      { command: "/usr/bin/go", args: ["version", "-m", f.path] },
      { command: f.path, args: ["detect", "--help"] },
    ]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
await check("OSV and Semgrep probes expose only their required source-scan capabilities", () => {
  for (const [name, probe, outputs, expected] of [
    ["osv-scanner", probeOsvScanner, [{ status: 0, stdout: "osv-scanner version 2.3.1\n", stderr: "" }, { status: 0, stdout: "--format json  -r, --recursive", stderr: "" }], ["--format", "recursive-source"]],
    ["semgrep", probeSemgrep, [{ status: 0, stdout: "1.130.0\n", stderr: "" }, { status: 0, stdout: "--json --config", stderr: "" }], ["--json", "--config"]],
  ]) {
    const f = fixture(name);
    try { const result = probe({ executablePath: f.path, rootDir: f.root, tempDir: f.root }, { spawnFn: spawnSequence(outputs, []), now: new Date("2026-07-18T12:00:00.000Z") }); assert.deepEqual(result.handle.capabilities, expected); }
    finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});
await check("prepared Semgrep run executes the exact prepared path with unchanged scan argv", async () => {
  const f = fixture("semgrep"); const probeCalls = [];
  try {
    const observed = probeSemgrep({ executablePath: f.path, rootDir: f.root, tempDir: f.root }, { spawnFn: spawnSequence([{ status: 0, stdout: "1.130.0\n", stderr: "" }, { status: 0, stdout: "--json --config", stderr: "" }], probeCalls), now: new Date("2026-07-18T12:00:00.000Z") });
    const runCalls = [];
    const result = await runPreparedScanner("semgrep", observed.handle, { rootDir: f.root, tempDir: f.root, config: { rulesDir: "rules" }, spawnFn: (command, args, options) => { runCalls.push({ command, args, options }); return { status: 0, stdout: JSON.stringify({ results: [], errors: [] }), stderr: "" }; } });
    assert.equal(result.status, "PASS"); assert.equal(runCalls[0].command, observed.handle.identity.realPath);
    assert.deepEqual(runCalls[0].args, ["scan", "--json", "--config", "rules", f.root]); assert.equal(runCalls[0].options.shell, false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
await check("prepared run fails closed before spawn after executable substitution", async () => {
  const f = fixture("semgrep");
  try {
    const observed = probeSemgrep({ executablePath: f.path, rootDir: f.root, tempDir: f.root }, { spawnFn: spawnSequence([{ status: 0, stdout: "1.130.0\n", stderr: "" }, { status: 0, stdout: "--json --config", stderr: "" }], []), now: new Date("2026-07-18T12:00:00.000Z") });
    writeFileSync(f.path, "substituted\n"); let spawned = false;
    const result = await runPreparedScanner("semgrep", observed.handle, { rootDir: f.root, spawnFn: () => { spawned = true; } });
    assert.equal(result.status, "ERROR"); assert.equal(result.classification, "execution_environment"); assert.equal(spawned, false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
process.stdout.write(`${passed}/5 checks passed.\n`);
