// Regression pin: pipeline.semgrep-offline-default-version-check (AC-251).
// The Semgrep adapter must force SEMGREP_ENABLE_VERSION_CHECK=0 AFTER the caller/process
// environment merge, so an offline local-rules scan never blocks on the version check, while
// argv, rules, deadline, ERROR handling and result binding stay unchanged. Exercises the real
// adapter through its documented `spawnFn` seam (captures the actual child environment).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import * as adapter from "../../scripts/security-adapters/semgrep.mjs";

const BINARY = "synthetic-semgrep-binary";
const ROOT = "synthetic-root";

function capture(result, extra = {}) {
  const seen = [];
  const spawnFn = (command, args, options) => {
    seen.push({ command, args, options });
    if (result instanceof Error) throw result;
    return result;
  };
  return { seen, run: (over = {}) => adapter.run({ rootDir: ROOT, config: { binaryPath: BINARY }, timeoutMs: 4321, spawnFn, ...extra, ...over }) };
}
const okResult = { status: 0, stdout: JSON.stringify({ results: [], errors: [] }), stderr: "" };

test("caller env cannot re-enable the version check (explicit env option)", async () => {
  const c = capture(okResult);
  const r = await c.run({ env: { SEMGREP_ENABLE_VERSION_CHECK: "1", SEMGREP_SEND_METRICS: "on" } });
  assert.equal(r.status, "PASS");
  assert.equal(c.seen.length, 1);
  assert.equal(c.seen[0].options.env.SEMGREP_ENABLE_VERSION_CHECK, "0");
  assert.equal(c.seen[0].options.env.SEMGREP_SEND_METRICS, "off");
});

test("ambient process.env cannot re-enable the version check", async () => {
  const prev = process.env.SEMGREP_ENABLE_VERSION_CHECK;
  process.env.SEMGREP_ENABLE_VERSION_CHECK = "1";
  try {
    const c = capture(okResult);
    await c.run({ env: {} });
    assert.equal(c.seen[0].options.env.SEMGREP_ENABLE_VERSION_CHECK, "0");
  } finally {
    if (prev === undefined) delete process.env.SEMGREP_ENABLE_VERSION_CHECK; else process.env.SEMGREP_ENABLE_VERSION_CHECK = prev;
  }
});

test("version check is 0 with no caller value, and other pinned env is private", async () => {
  const c = capture(okResult);
  await c.run({ env: { PIPELINE_PIN_MARKER: "kept" } });
  const env = c.seen[0].options.env;
  assert.equal(env.SEMGREP_ENABLE_VERSION_CHECK, "0");
  assert.equal(env.PIPELINE_PIN_MARKER, "kept");
  for (const k of ["SEMGREP_LOG_FILE", "SEMGREP_SETTINGS_FILE", "SEMGREP_VERSION_CACHE_PATH"]) {
    assert.equal(typeof env[k], "string", k);
    assert.ok(env[k].length > 0, k);
  }
});

test("argv, binary, cwd, deadline and shell are preserved (default and local rules)", async () => {
  const c = capture(okResult);
  await c.run({ env: { SEMGREP_ENABLE_VERSION_CHECK: "1" } });
  const s = c.seen[0];
  assert.equal(s.command, BINARY);
  assert.deepEqual(s.args, ["scan", "--json", "--timeout", "45", "--timeout-threshold", "0", "--config", "auto", ROOT]);
  assert.equal(s.options.cwd, ROOT);
  assert.equal(s.options.timeout, 4321);
  assert.equal(s.options.shell, false);

  const c2 = capture(okResult);
  await c2.run({ config: { binaryPath: BINARY, rulesDir: "local-rules-dir" }, env: {} });
  assert.deepEqual(c2.seen[0].args, ["scan", "--json", "--timeout", "45", "--timeout-threshold", "0", "--config", "local-rules-dir", ROOT]);
  assert.equal(c2.seen[0].options.env.SEMGREP_ENABLE_VERSION_CHECK, "0");
});

test("ERROR handling preserved: timeout, spawn failure, non-zero exit, bad JSON", async () => {
  const timeout = Object.assign(new Error("t"), { code: "ETIMEDOUT" });
  let r = await capture({ error: timeout, status: null, stdout: "", stderr: "" }).run({ env: {} });
  assert.equal(r.status, "ERROR");
  assert.equal(r.classification, "scanner_error");
  assert.match(r.reason, /timed out after 4321ms/);

  r = await capture({ status: 2, stdout: "", stderr: "boom" }).run({ env: {} });
  assert.equal(r.status, "ERROR");
  assert.match(r.reason, /exited 2/);

  r = await capture({ status: 0, stdout: "not json", stderr: "" }).run({ env: {} });
  assert.equal(r.status, "ERROR");
  assert.match(r.reason, /unparseable/);

  r = await capture(new Error("spawn exploded")).run({ env: {} });
  assert.equal(r.status, "ERROR");
});

test("findings and PASS results are bound unchanged", async () => {
  const body = { results: [{ check_id: "r.one", path: "a.js", start: { line: 3 }, extra: { severity: "ERROR", message: "m" } }], errors: [] };
  const r = await capture({ status: 0, stdout: JSON.stringify(body), stderr: "" }).run({ env: {} });
  assert.equal(r.status, "FINDINGS");
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].rule, "r.one");
  assert.equal(r.findings[0].severity, "high");
});

test("scratch dir named in the child env is cleaned up after the scan", async () => {
  const c = capture(okResult);
  await c.run({ env: {} });
  const log = c.seen[0].options.env.SEMGREP_LOG_FILE;
  assert.equal(existsSync(log), false);
  assert.equal(existsSync(c.seen[0].options.env.SEMGREP_VERSION_CACHE_PATH), false);
});

// The test above can pass vacuously: its fake spawnFn creates nothing, so the named paths never
// exist whether or not the adapter cleans up. This probe is the version that can fail. Its fake
// spawnFn behaves like the real semgrep child -- it writes the log file, the settings file and a
// populated version-cache directory into the scratch directory the adapter named in the child env,
// and records that they were really there DURING the spawn. After the scan the whole scratch
// directory must be gone, on every exit path of the adapter that has taken ownership of it.
function scratchProbe(outcome) {
  const probe = { calls: 0, dir: null, during: null };
  probe.spawnFn = (_command, _args, options) => {
    probe.calls += 1;
    const { SEMGREP_LOG_FILE: log, SEMGREP_SETTINGS_FILE: settings, SEMGREP_VERSION_CACHE_PATH: cache } = options.env;
    probe.dir = dirname(log);
    probe.sameDir = dirname(settings) === probe.dir && dirname(cache) === probe.dir;
    writeFileSync(log, "synthetic semgrep log\n");
    writeFileSync(settings, "synthetic: settings\n");
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, "version"), "synthetic cached version\n");
    probe.during = { dir: existsSync(probe.dir), log: existsSync(log), settings: existsSync(settings), cacheFile: existsSync(join(cache, "version")) };
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  return probe;
}

const SCRATCH_CASES = [
  ["a completed scan", okResult, (r) => assert.equal(r.status, "PASS")],
  ["a non-zero exit", { status: 2, stdout: "", stderr: "boom" }, (r) => { assert.equal(r.status, "ERROR"); assert.match(r.reason, /exited 2/); }],
  ["a timeout", { error: Object.assign(new Error("t"), { code: "ETIMEDOUT" }), status: null, stdout: "", stderr: "" }, (r) => { assert.equal(r.status, "ERROR"); assert.match(r.reason, /timed out after 4321ms/); }],
  ["a spawn that throws", new Error("spawn exploded"), (r) => { assert.equal(r.status, "ERROR"); assert.match(r.reason, /spawn error: spawn exploded/); }],
];

for (const [label, outcome, assertResult] of SCRATCH_CASES) {
  test(`scratch dir holding the child's log, settings and version cache is removed after ${label}`, async () => {
    const probe = scratchProbe(outcome);
    try {
      const r = await adapter.run({ rootDir: ROOT, config: { binaryPath: BINARY }, timeoutMs: 4321, spawnFn: probe.spawnFn, env: {} });
      assertResult(r);
      // The fake really ran and really populated the scratch dir (otherwise the final check is vacuous).
      assert.equal(probe.calls, 1);
      assert.match(basename(probe.dir), /^pipeline-semgrep-scan-/);
      assert.equal(probe.sameDir, true, "log, settings and version-cache all live under one scratch dir");
      assert.deepEqual(probe.during, { dir: true, log: true, settings: true, cacheFile: true });
      // Nothing of it may survive the scan.
      assert.equal(existsSync(probe.dir), false);
    } finally {
      // Never leak the temp dir when the assertion above is the thing that fails.
      if (probe.dir && /^pipeline-semgrep-scan-/.test(basename(probe.dir))) rmSync(probe.dir, { recursive: true, force: true });
    }
  });
}
