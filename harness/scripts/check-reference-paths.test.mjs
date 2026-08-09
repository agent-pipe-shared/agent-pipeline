#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALLOWLIST,
  candidateFromToken,
  candidatesInLine,
  checkRepository,
  LIMITATIONS,
  reachLines,
  ROOT_SEGMENTS,
  scopeExclusion,
} from "./check-reference-paths.mjs";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const FIXTURE_ROOT = join(REPO, "scratch", "check-reference-paths-fixture");
const CHECK = "harness/scripts/check-reference-paths.mjs";

/**
 * The two references the 2026-08-08 sweep missed, verbatim, as the files
 * carried them before they were corrected. They are the reason this check
 * exists, so they are pinned here rather than left to a one-off worktree
 * run: the worktree evidence proves the check WAS red once, this proves it
 * stays red for the same input forever.
 */
const MISSED_WORKFLOW_LINE = "        run: node trusted-gate/harness/scripts/security-scan.mjs --root candidate || true";
const MISSED_ENV_LINE = "# The security-scan adapters (harness/scripts/security-adapters/*.mjs) look";

/** The corrected form both files carry at HEAD. */
const FIXED_WORKFLOW_LINE = "        run: node trusted-gate/plugins/pipeline-core/scripts/security-scan.mjs --root candidate || true";
const FIXED_ENV_LINE = "# The security-scan adapters (plugins/pipeline-core/scripts/security-adapters/*.mjs) look";

const TRACKED_NOW = [
  "plugins/pipeline-core/scripts/security-scan.mjs",
  "plugins/pipeline-core/scripts/security-adapters/gitleaks.mjs",
  "harness/scripts/check-doc-contracts.mjs",
];

function writeFixture(name, text) {
  writeFileSync(join(FIXTURE_ROOT, name), text, "utf8");
}

test.before(() => {
  mkdirSync(FIXTURE_ROOT, { recursive: true });
  writeFixture("live-good.yml", `${FIXED_WORKFLOW_LINE}\n`);
  writeFixture("live-bad.yml", `${MISSED_WORKFLOW_LINE}\n`);
  writeFixture("env-good.example", `${FIXED_ENV_LINE}\n`);
  writeFixture("env-bad.example", `${MISSED_ENV_LINE}\n`);
  writeFixture("allowlisted.md", "See `harness/scripts/retired-tool.mjs` for the historical shape.\n");
});

test.after(() => {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

function run(scanPaths, extra = {}) {
  return checkRepository(FIXTURE_ROOT, { scanPaths, trackedPaths: TRACKED_NOW, allowlist: [], ...extra });
}

test("a reference to a tracked path passes", () => {
  const { findings, stats } = run(["live-good.yml", "env-good.example"]);
  assert.deepEqual(findings, []);
  assert.equal(stats.filesScanned, 2);
  assert.equal(stats.referencesResolved, 2);
});

test("a reference to a missing path fails", () => {
  const { findings } = run(["live-bad.yml"]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0], 'live-bad.yml:1: references "harness/scripts/security-scan.mjs", which is not a tracked file');
});

test("a glob reference matching no tracked file fails, and one that matches passes", () => {
  assert.equal(run(["env-bad.example"]).findings.length, 1);
  assert.deepEqual(run(["env-good.example"]).findings, []);
});

test("both references the real sweep missed are found together (REFCHECK-1 regression)", () => {
  const { findings } = run(["live-bad.yml", "env-bad.example"]);
  assert.equal(findings.length, 2);
  assert.ok(findings.some((item) => item.includes("harness/scripts/security-scan.mjs")));
  assert.ok(findings.some((item) => item.includes("harness/scripts/security-adapters/*.mjs")));
});

test("an allowlisted exception passes", () => {
  const { findings } = run(["allowlisted.md"], {
    allowlist: [
      {
        file: "allowlisted.md",
        match: "harness/scripts/retired-tool.mjs",
        reason: "fixture: a reference that is right as written",
      },
    ],
  });
  assert.deepEqual(findings, []);
});

test("an allowlist entry that matches nothing is itself a finding, so a stale exception cannot rot in place", () => {
  const { findings } = run(["live-good.yml"], {
    allowlist: [{ file: "live-good.yml", match: "harness/scripts/gone.mjs", reason: "fixture: stale entry" }],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /never matched anything -- remove it$/u);
});

test("the shipped ALLOWLIST has no unused entries against the real repository", () => {
  const { findings } = checkRepository(REPO);
  assert.deepEqual(
    findings.filter((item) => item.startsWith("allowlist:")),
    [],
  );
  for (const entry of ALLOWLIST) {
    assert.equal(typeof entry.file, "string");
    assert.equal(typeof entry.match, "string");
    assert.ok((entry.reason ?? "").length >= 20, "every allowlist entry states why the reference is right as written");
  }
});

test("a checkout prefix is dropped but a URL host is not treated as one", () => {
  assert.equal(candidateFromToken("trusted-gate/harness/scripts/x.mjs"), "harness/scripts/x.mjs");
  assert.equal(candidateFromToken("//github.com/org/repo/blob/main/harness/scripts/x.mjs"), null);
  assert.equal(candidateFromToken("harness/../plugins/x.mjs"), null);
  assert.equal(candidateFromToken("scripts/x.mjs"), null);
  assert.equal(candidateFromToken("myharness/scripts/x.mjs"), null);
  assert.deepEqual(candidatesInLine("see harness/a.mjs and plugins/b.sh and nothing.txt"), ["harness/a.mjs", "plugins/b.sh"]);
});

test("record surfaces and test suites are out of scope, and the output says so", () => {
  assert.equal(scopeExclusion("specs/sprint-nova-epic/plans/nova-a.md"), "record");
  assert.equal(scopeExclusion("backlog/items/x.md"), "record");
  assert.equal(scopeExclusion("evidence/x.json"), "record");
  assert.equal(scopeExclusion("docs/state.md"), "record");
  assert.equal(scopeExclusion("plugins/pipeline-core/lib/security-evidence-v1-migration-fixture.test.mjs"), "test-suite");
  assert.equal(scopeExclusion("docs/operating-model.md"), null);
  const reach = reachLines(checkRepository(REPO).stats).join("\n");
  assert.match(reach, /record file\(s\)/u);
  assert.match(reach, /test suite\(s\)/u);
  for (const limitation of LIMITATIONS) assert.ok(reach.includes(limitation), `reach output omits: ${limitation}`);
});

test("ROOT_SEGMENTS excludes the two segments that would produce false positives", () => {
  assert.ok(!ROOT_SEGMENTS.includes("scripts"));
  assert.ok(!ROOT_SEGMENTS.includes(".claude"));
  for (const segment of ["harness", "plugins", ".github", "docs", "templates"]) {
    assert.ok(ROOT_SEGMENTS.includes(segment), `missing root segment ${segment}`);
  }
});

test("the result does not depend on the process working directory", () => {
  const original = process.cwd();
  try {
    process.chdir(REPO);
    const fromRepo = checkRepository(REPO);
    process.chdir(FIXTURE_ROOT);
    const fromElsewhere = checkRepository(REPO);
    assert.deepEqual(fromElsewhere.findings, fromRepo.findings);
    assert.deepEqual(fromElsewhere.stats, fromRepo.stats);
  } finally {
    process.chdir(original);
  }
});

test("the real repository passes, and the CLI writes its own machine report", () => {
  const outDir = mkdtempSync(join(tmpdir(), "refcheck-"));
  try {
    const reportPath = join(outDir, "report.json");
    const result = spawnSync(process.execPath, [join(REPO, CHECK), "--report", reportPath], { cwd: outDir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.result, "passed");
    assert.equal(report.exitCode, 0);
    assert.deepEqual(report.findings, []);
    assert.ok(report.stats.filesScanned > 0);
    assert.ok(report.reach.some((line) => line.startsWith("reach: NOT detected")));
    assert.match(result.stdout, /Reference-path check passed/u);
    assert.match(result.stdout, /REFERENCE-PATH reach: scanned/u);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

process.stdout.write("check-reference-paths: fixture, scope, allowlist and repository checks passed\n");
