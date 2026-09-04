#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import { normalizeRepoRelativePath, parseAllRegisteredSuiteFiles } from "../../plugins/pipeline-core/scripts/check-suite-registration.mjs";
import { CHECKS, REPO_ROOT, formatReport, runCheck, runPreGate } from "./pre-gate.mjs";

function makeFixtureDir() {
  return mkdtempSync(join(tmpdir(), "pre-gate-test-"));
}

function writeScript(dir, name, body) {
  const path = join(dir, name);
  writeFileSync(path, body, "utf8");
  return path;
}

test("CHECKS names exactly the six checkers, each pointing at a real file, mirrored from verify.mjs's TEST_SUITES", () => {
  assert.equal(CHECKS.length, 6);
  const source = readFileSync(join(REPO_ROOT, "harness", "scripts", "verify.mjs"), "utf8");
  const registered = new Set(parseAllRegisteredSuiteFiles(source));
  for (const check of CHECKS) {
    assert.ok(existsSync(check.file), `${check.name} -> ${check.file} does not exist on disk`);
    assert.deepEqual(check.args, [], `${check.name} carries args, but no CHECKS entry should today`);
    const rel = normalizeRepoRelativePath(relative(REPO_ROOT, check.file));
    assert.ok(
      registered.has(rel),
      `${check.name} -> ${rel} is no longer registered in verify.mjs's TEST_SUITES/SCOPED_VERIFY_SUITES/` +
      "WINDOWS_ASSURANCE_VERIFY_SUITES -- pre-gate has drifted out of sync with the gate it previews",
    );
  }
});

test("all checks passing: exits ok, every result reports its own name, status and a non-negative duration", () => {
  const dir = makeFixtureDir();
  try {
    const checks = [
      { name: "fixture-a", obligation: "obligation A is unmet", file: writeScript(dir, "a.mjs", "process.exit(0);\n"), args: [] },
      { name: "fixture-b", obligation: "obligation B is unmet", file: writeScript(dir, "b.mjs", "process.exit(0);\n"), args: [] },
    ];
    const outcome = runPreGate({ checks, repoRoot: REPO_ROOT });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.results.length, 2);
    for (const result of outcome.results) {
      assert.equal(result.status, "pass");
      assert.equal(result.exitCode, 0);
      assert.equal(typeof result.durationMs, "number");
      assert.ok(result.durationMs >= 0);
    }
    assert.ok(typeof outcome.totalDurationMs === "number" && outcome.totalDurationMs >= 0);
    const report = formatReport(outcome);
    assert.match(report, /PASS fixture-a/);
    assert.match(report, /PASS fixture-b/);
    assert.match(report, /2 check\(s\), 2 passed/);
    assert.match(report, /-> PASS$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("one check failing: exits non-zero, names which check and which obligation is unmet, and still runs the rest", () => {
  const dir = makeFixtureDir();
  try {
    const checks = [
      { name: "fixture-ok", obligation: "obligation OK is unmet", file: writeScript(dir, "ok.mjs", "process.exit(0);\n"), args: [] },
      {
        name: "fixture-broken",
        obligation: "the vendored copy is stale against its source",
        file: writeScript(dir, "broken.mjs", "console.error('boom');\nprocess.exit(2);\n"),
        args: [],
      },
    ];
    const outcome = runPreGate({ checks, repoRoot: REPO_ROOT });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.results.length, 2, "a failing check must not stop the remaining checks from running");
    const ok = outcome.results.find((result) => result.name === "fixture-ok");
    assert.equal(ok.status, "pass");
    const broken = outcome.results.find((result) => result.name === "fixture-broken");
    assert.equal(broken.status, "fail");
    assert.equal(broken.exitCode, 2);
    const report = formatReport(outcome);
    assert.match(report, /FAIL fixture-broken/);
    assert.match(report, /obligation unmet: the vendored copy is stale against its source/);
    assert.match(report, /-> FAIL$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a check whose script is missing: reports a clear, named error and does not crash the run", () => {
  const dir = makeFixtureDir();
  try {
    const missingPath = join(dir, "does-not-exist.mjs");
    const checks = [
      { name: "fixture-missing", obligation: "obligation for the missing script", file: missingPath, args: [] },
    ];
    const outcome = runPreGate({ checks, repoRoot: REPO_ROOT });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.results.length, 1);
    const result = outcome.results[0];
    assert.equal(result.status, "error");
    assert.equal(result.exitCode, null);
    assert.match(result.message, /PRE-GATE-SCRIPT-MISSING/);
    assert.match(result.message, /does-not-exist\.mjs/);
    const report = formatReport(outcome);
    assert.match(report, /ERROR fixture-missing/);
    assert.match(report, /PRE-GATE-SCRIPT-MISSING/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runCheck alone: a passing real fixture reports status pass with matching exitCode 0", () => {
  const dir = makeFixtureDir();
  try {
    const file = writeScript(dir, "solo.mjs", "process.exit(0);\n");
    const result = runCheck({ name: "solo", obligation: "n/a", file, args: [] }, { repoRoot: REPO_ROOT });
    assert.equal(result.status, "pass");
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
