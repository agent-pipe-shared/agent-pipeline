// SPDX-License-Identifier: SUL-1.0
// ADR-0097 (D249, K-28): maintenance-red-check.mjs observe runs one check on the clean HEAD of a real git repository and records the
// result once; it refuses, writing nothing, for a run that proves neither red nor green.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { main, CONFIGURED_VERIFY_TIMEOUT_MS } from "./maintenance-red-check.mjs";
import { maintenanceObservationDirectory, readMaintenanceRedObservation } from "../lib/maintenance-delivery.mjs";

const SCRIPT = fileURLToPath(new URL("./maintenance-red-check.mjs", import.meta.url));
const roots = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function repo({ state = { activeFeature: { id: "epic2" } } } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mrc-"));
  roots.push(dir);
  const git = (...args) => {
    const result = spawnSync("git", ["-C", dir, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  const put = (path, text) => { mkdirSync(join(dir, path, ".."), { recursive: true }); writeFileSync(join(dir, path), text); };
  put(".claude/pipeline-state.json", `${JSON.stringify(state)}\n`);
  put("tests/unit/red.test.mjs", "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('red', () => assert.equal(1, 2));\n");
  put("tests/unit/green.test.mjs", "import test from 'node:test';\ntest('green', () => {});\n");
  git("add", "--all");
  git("commit", "-q", "--no-verify", "-m", "fixture");
  const head = () => ({ commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") });
  return { dir, git, put, head, common: join(dir, ".git") };
}

function run(argv, dependencies = {}) {
  let stdout = "", stderr = "";
  const exitCode = main(argv, { stdout: { write: (text) => { stdout += text; } }, stderr: { write: (text) => { stderr += text; } } }, dependencies);
  return { exitCode, stdout, stderr, json: stdout.trim() === "" ? null : JSON.parse(stdout) };
}
const observations = (r) => (existsSync(maintenanceObservationDirectory(r.common)) ? readdirSync(maintenanceObservationDirectory(r.common)) : []);

test("a red test file is observed red at the clean HEAD and recorded once; a rerun keeps the first record", () => {
  const r = repo();
  const first = run(["observe", "--root", r.dir, "--check", "tests/unit/red.test.mjs"]);
  assert.equal(first.exitCode, 0, first.stderr);
  assert.equal(first.json.status, "red");
  assert.equal(first.json.check, "tests/unit/red.test.mjs");
  assert.equal(first.json.featureId, "epic2");
  assert.deepEqual(first.json.candidate, r.head());
  assert.match(first.json.next, /dispatch-briefing\.mjs binding --maintenance --check tests\/unit\/red\.test\.mjs/u);
  const record = readMaintenanceRedObservation({ commonDir: r.common, check: { path: "tests/unit/red.test.mjs" }, candidate: r.head() });
  assert.equal(record.red, true);
  assert.notEqual(record.exitCode, 0);
  const again = run(["observe", "--root", r.dir, "--check", "tests/unit/red.test.mjs"], { run: () => ({ status: 0, signal: null, stdout: "", stderr: "" }) });
  assert.equal(again.exitCode, 0, "the first observation at a commit stands, a later green run does not replace it");
  assert.equal(again.json.existing, true);
  assert.equal(observations(r).length, 1);
});

test("a green test file is recorded green and exits 1: there is nothing to repair", () => {
  const r = repo();
  const green = run(["observe", "--root", r.dir, "--check", "tests/unit/green.test.mjs"]);
  assert.equal(green.exitCode, 1, green.stderr);
  assert.equal(green.json.status, "green");
  assert.match(green.json.next, /nothing to repair/u);
});

test("refusals write nothing: untracked or non-test check, dirty tree, no active feature, timeout, unrunnable command, drift", () => {
  const r = repo();
  r.put("tests/unit/new.test.mjs", "import test from 'node:test';\ntest('x', () => { throw new Error('x'); });\n");
  const untracked = run(["observe", "--root", r.dir, "--check", "tests/unit/new.test.mjs"]);
  assert.equal(untracked.exitCode, 2);
  assert.match(untracked.stderr, /^MAINTENANCE-RED-CHECK-REFUSED: MRC-CHECK-UNTRACKED: /u);
  for (const spelling of ["src/app.mjs", "tests/unit/red.test.ts", "document:docs/a.md", "../x.test.mjs"]) {
    assert.match(run(["observe", "--root", r.dir, "--check", spelling]).stderr, /MRC-CHECK: /u, spelling);
  }
  r.put("tests/unit/green.test.mjs", "import test from 'node:test';\ntest('changed', () => {});\n");
  assert.match(run(["observe", "--root", r.dir, "--check", "tests/unit/red.test.mjs"]).stderr, /MRC-DIRTY: /u);
  r.git("checkout", "--", "tests/unit/green.test.mjs");
  const timedOut = run(["observe", "--root", r.dir, "--check", "tests/unit/red.test.mjs"], { run: () => ({ status: null, signal: "SIGTERM", error: { code: "ETIMEDOUT" } }) });
  assert.match(timedOut.stderr, /MRC-TIMEOUT: .*nothing was recorded/u);
  const configured = () => ({ fullCommand: "pnpm verify:ci", baseline: [{ id: "lint", command: "pnpm lint" }], areas: [] });
  const missing = run(["observe", "--root", r.dir, "--check", "command:lint"], { readConsumerVerify: configured, run: () => ({ status: 127, signal: null, stdout: "", stderr: "pnpm: not found" }) });
  assert.match(missing.stderr, /MRC-COMMAND-NOT-RUNNABLE: .*exit 127/u);
  const unregistered = run(["observe", "--root", r.dir, "--check", "command:absent"], { readConsumerVerify: configured });
  assert.match(unregistered.stderr, /MRC-COMMAND-UNREGISTERED: /u);
  const drift = run(["observe", "--root", r.dir, "--check", "tests/unit/red.test.mjs"], { run: () => {
    r.put("tests/unit/green.test.mjs", "// changed by the check\n");
    return { status: 1, signal: null, stdout: "", stderr: "" };
  } });
  assert.match(drift.stderr, /MRC-DRIFT: /u);
  assert.deepEqual(observations(r), [], "no refusal recorded anything");
  const noFeature = repo({ state: {} });
  assert.match(run(["observe", "--root", noFeature.dir, "--check", "tests/unit/red.test.mjs"]).stderr, /MRC-NO-FEATURE: /u);
});

test("verify:configured runs the calibration's verify command through the shell with the long timeout", () => {
  const r = repo();
  let seen = null;
  const result = run(["observe", "--root", r.dir, "--check", "verify:configured"], {
    readConsumerVerify: () => ({ fullCommand: "pnpm verify:ci", baseline: [], areas: [] }),
    run: (spec) => { seen = spec; return { status: 1, signal: null, stdout: "1 failed", stderr: "" }; },
  });
  assert.equal(result.exitCode, 0, result.stderr);
  assert.deepEqual(seen, { executable: "pnpm verify:ci", args: [], shell: true, timeout: CONFIGURED_VERIFY_TIMEOUT_MS });
  assert.equal(result.json.check, "verify:configured");
  const unconfigured = run(["observe", "--root", repo().dir, "--check", "verify:configured"], { readConsumerVerify: () => ({ fullCommand: null, baseline: [], areas: [] }) });
  assert.match(unconfigured.stderr, /MRC-VERIFY-UNCONFIGURED: /u);
});

test("usage: --help answers, any other shape is refused with the usage", () => {
  const help = spawnSync(process.execPath, [SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^usage: node maintenance-red-check\.mjs observe --root <repo> --check /u);
  for (const argv of [[], ["inspect"], ["observe", "--root", "."], ["observe", "--root", ".", "--check", "a.test.mjs", "--extra", "x"]]) {
    const refused = run(argv);
    assert.equal(refused.exitCode, 2, JSON.stringify(argv));
    assert.match(refused.stderr, /MRC-USAGE: /u, JSON.stringify(argv));
  }
});
