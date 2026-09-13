#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  parseReportInterruptionsArgs,
  formatDeterministicTextReport,
  generateInterruptionReport,
  REPORT_RESULT_SCHEMA,
  LOCAL_REPORT_SCHEMA,
} from "./report-interruptions.mjs";

const here = new URL(".", import.meta.url);
const reportScript = new URL("report-interruptions.mjs", here).pathname;
const observedScript = new URL("observe-critic-preflight.mjs", here).pathname;
const workspace = process.cwd();

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function commit(root, message) {
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

function fixture() {
  const root = mkdtempSync("scratch/report-interruptions-test-");
  for (const path of ["project", "specs/sprint-alfred-epic", ".claude", "governance/guidelines", "governance/policies", "evidence"]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  for (const path of [
    "project/pipeline.yaml",
    "project/pipeline-state.json",
    "project/pipeline.json",
    "project/guard-config.json",
    "project/guard-override.log.jsonl",
    "specs/sprint-alfred-epic/spec.md",
  ]) {
    cpSync(join(workspace, path), join(root, path));
  }
  writeFileSync(join(root, ".claude/pipeline.yaml"), "governance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  writeFileSync(join(root, "governance/guidelines/review.md"), "Review changed code.\n");
  writeFileSync(join(root, "governance/policies/checklist.md"), "- verify\n");
  writeFileSync(join(root, "work.txt"), "base\n");
  git(root, ["init", "-q"]);
  const base = commit(root, "base");
  writeFileSync(join(root, "work.txt"), "candidate\n");
  const candidate = commit(root, "candidate");
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  writeFileSync(join(root, "evidence/verify.json"), `${JSON.stringify({ candidate: { commit: candidate, tree } })}\n`);
  return { root, base, candidate };
}

test("parseReportInterruptionsArgs parses flags and validates arguments", () => {
  assert.equal(parseReportInterruptionsArgs(["--help"]).help, true);
  assert.equal(parseReportInterruptionsArgs(["-h"]).help, true);

  const missingRoot = parseReportInterruptionsArgs([]);
  assert.equal(missingRoot.ok, false);
  assert.equal(missingRoot.code, "C1S-SHAPE");

  const unknownArg = parseReportInterruptionsArgs(["--root", "/tmp", "--unknown"]);
  assert.equal(unknownArg.ok, false);
  assert.equal(unknownArg.code, "C1S-SHAPE");

  const invalidFormat = parseReportInterruptionsArgs(["--root", "/tmp", "--format", "yaml"]);
  assert.equal(invalidFormat.ok, false);
  assert.equal(invalidFormat.code, "C1S-SHAPE");

  const invalidFrom = parseReportInterruptionsArgs(["--root", "/tmp", "--from", "not-a-date"]);
  assert.equal(invalidFrom.ok, false);
  assert.equal(invalidFrom.code, "C1S-SHAPE");

  const invalidThrough = parseReportInterruptionsArgs(["--root", "/tmp", "--through", "not-a-date"]);
  assert.equal(invalidThrough.ok, false);
  assert.equal(invalidThrough.code, "C1S-SHAPE");

  const invertedRange = parseReportInterruptionsArgs([
    "--root", "/tmp",
    "--from", "2026-09-10T00:00:00.000Z",
    "--through", "2026-09-01T00:00:00.000Z",
  ]);
  assert.equal(invertedRange.ok, false);
  assert.equal(invertedRange.code, "C1S-SHAPE");

  const invalidFeature = parseReportInterruptionsArgs(["--root", "/tmp", "--feature", "bad feature!"]);
  assert.equal(invalidFeature.ok, false);
  assert.equal(invalidFeature.code, "C1S-SHAPE");

  const valid = parseReportInterruptionsArgs([
    "--root", "/my/root",
    "--from", "2026-09-01T00:00:00.000Z",
    "--through", "2026-09-10T00:00:00.000Z",
    "--feature", "feat-1",
    "--package", "pkg-1",
    "--dispatch", "disp-1",
    "--format", "text",
  ]);
  assert.equal(valid.ok, true);
  assert.equal(valid.options.root, "/my/root");
  assert.equal(valid.options.from, "2026-09-01T00:00:00.000Z");
  assert.equal(valid.options.through, "2026-09-10T00:00:00.000Z");
  assert.equal(valid.options.feature, "feat-1");
  assert.equal(valid.options.packageId, "pkg-1");
  assert.equal(valid.options.dispatchId, "disp-1");
  assert.equal(valid.options.format, "text");
});

test("CLI invocation with --help prints usage and exits 0 with empty stderr", () => {
  const result = run(reportScript, ["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: report-interruptions\.mjs/);
  assert.equal(result.stderr, "");

  const shortResult = run(reportScript, ["-h"]);
  assert.equal(shortResult.status, 0);
  assert.match(shortResult.stdout, /Usage: report-interruptions\.mjs/);
  assert.equal(shortResult.stderr, "");
});

test("CLI rejects invalid arguments with exit 2 and C1S-SHAPE error JSON on stderr", () => {
  const cases = [
    [],
    ["--root"],
    ["--root", "/tmp", "--bogus"],
    ["--root", "/tmp", "--format", "csv"],
    ["--root", "/tmp", "--from", "invalid-date"],
    ["--root", "/tmp", "--through", "invalid-date"],
    ["--root", "/tmp", "--from", "2026-09-02T00:00:00.000Z", "--through", "2026-09-01T00:00:00.000Z"],
    ["--root", "/tmp", "--feature", "spaces in id"],
  ];

  for (const args of cases) {
    const result = run(reportScript, args);
    assert.equal(result.status, 2, `expected exit 2 for args: ${JSON.stringify(args)}`);
    assert.equal(result.stdout, "", "stdout must be clean/empty on failure");
    const err = JSON.parse(result.stderr);
    assert.equal(err.schema, REPORT_RESULT_SCHEMA);
    assert.equal(err.status, "rejected");
    assert.equal(err.code, "C1S-SHAPE");
  }
});

test("CLI on absent store emits C1S-NOT-FOUND on stderr and exits 2", () => {
  const emptyDir = mkdtempSync("scratch/report-absent-");
  try {
    const result = run(reportScript, ["--root", emptyDir]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    const err = JSON.parse(result.stderr);
    assert.equal(err.schema, REPORT_RESULT_SCHEMA);
    assert.equal(err.status, "rejected");
    assert.equal(err.code, "C1S-NOT-FOUND");
  } finally {
    rmSync(emptyDir, { recursive: true, force: true });
  }
});

test("CLI on initialized store with 0 receipts produces valid json and text reports", () => {
  const fx = fixture();
  try {
    // Initialize store via createOperation
    const create = run(observedScript, ["create", "--root", fx.root, "--spec", "specs/sprint-alfred-epic/spec.md"]);
    assert.equal(create.status, 0, `${create.stdout}${create.stderr}`);

    // Run report default format (json)
    const jsonReport = run(reportScript, ["--root", fx.root]);
    assert.equal(jsonReport.status, 0, `${jsonReport.stdout}${jsonReport.stderr}`);
    assert.equal(jsonReport.stderr, "");
    const parsed = JSON.parse(jsonReport.stdout);
    assert.equal(parsed.schema, LOCAL_REPORT_SCHEMA);
    assert.ok(parsed.snapshot);
    assert.ok(parsed.aggregate);
    assert.equal(parsed.snapshot.receipts.length, 0);
    assert.equal(parsed.aggregate.totals.eventCount.value, 0);
    assert.equal(parsed.aggregate.totals.eventCount.status, "measured");
    assert.equal(parsed.aggregate.categoryRanking.length, 0);

    // Run report text format
    const textReport = run(reportScript, ["--root", fx.root, "--format", "text"]);
    assert.equal(textReport.status, 0, `${textReport.stdout}${textReport.stderr}`);
    assert.equal(textReport.stderr, "");
    assert.match(textReport.stdout, /=== Interruption Report \(local\) ===/);
    assert.match(textReport.stdout, /Events: 0 \(measured\)/);
    assert.match(textReport.stdout, /Categories:\s+\(none\)/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("CLI reports real receipts and supports filtering by --from, --through, --feature, --package, --dispatch", () => {
  const fx = fixture();
  try {
    // Initialize store and record 2 preflight rejections
    const create = run(observedScript, ["create", "--root", fx.root, "--spec", "specs/sprint-alfred-epic/spec.md"]);
    assert.equal(create.status, 0, `${create.stdout}${create.stderr}`);
    const operationId = JSON.parse(create.stdout).handle.operationId;

    const producerArgs = ["--base", fx.base, "--candidate", fx.candidate, "--spec", "specs/sprint-alfred-epic/spec.md"];
    const run1 = run(observedScript, ["run", "--root", fx.root, "--operation", operationId, "--", ...producerArgs]);
    assert.equal(run1.status, 1);

    const run2 = run(observedScript, ["run", "--root", fx.root, "--operation", operationId, "--", ...producerArgs]);
    assert.equal(run2.status, 1);

    // 1. Full report (json)
    const reportJson = run(reportScript, ["--root", fx.root, "--format", "json"]);
    assert.equal(reportJson.status, 0, `${reportJson.stdout}${reportJson.stderr}`);
    assert.equal(reportJson.stderr, "");
    const parsed = JSON.parse(reportJson.stdout);
    assert.equal(parsed.schema, LOCAL_REPORT_SCHEMA);
    assert.equal(parsed.snapshot.receipts.length, 2);
    assert.equal(parsed.aggregate.totals.eventCount.value, 2);
    assert.equal(parsed.aggregate.totals.episodeCount.value, 1);
    assert.ok(parsed.aggregate.categoryRanking.length > 0);

    // 2. Full report (text)
    const reportText = run(reportScript, ["--root", fx.root, "--format", "text"]);
    assert.equal(reportText.status, 0, `${reportText.stdout}${reportText.stderr}`);
    assert.equal(reportText.stderr, "");
    assert.match(reportText.stdout, /Events: 2 \(measured\)/);
    assert.match(reportText.stdout, /Episodes: 1 \(measured\)/);

    // 3. Filter by --feature matching
    const matchFeature = run(reportScript, ["--root", fx.root, "--feature", "sprint-alfred-epic"]);
    assert.equal(matchFeature.status, 0);
    assert.equal(JSON.parse(matchFeature.stdout).snapshot.receipts.length, 2);

    // 4. Filter by --feature non-matching
    const noMatchFeature = run(reportScript, ["--root", fx.root, "--feature", "non-existent-feature"]);
    assert.equal(noMatchFeature.status, 0);
    assert.equal(JSON.parse(noMatchFeature.stdout).snapshot.receipts.length, 0);

    // 5. Filter by --package
    const matchPackage = run(reportScript, ["--root", fx.root, "--package", "pkg-other"]);
    assert.equal(matchPackage.status, 0);
    assert.equal(JSON.parse(matchPackage.stdout).snapshot.receipts.length, 0);

    // 6. Filter by --dispatch
    const matchDispatch = run(reportScript, ["--root", fx.root, "--dispatch", "disp-other"]);
    assert.equal(matchDispatch.status, 0);
    assert.equal(JSON.parse(matchDispatch.stdout).snapshot.receipts.length, 0);

    // 7. Filter by --from and --through
    const now = new Date();
    const pastIso = new Date(now.getTime() - 3600000).toISOString();
    const futureIso = new Date(now.getTime() + 3600000).toISOString();
    const distantPast = new Date(now.getTime() - 7200000).toISOString();

    // Window containing receipts
    const inWindow = run(reportScript, ["--root", fx.root, "--from", pastIso, "--through", futureIso]);
    assert.equal(inWindow.status, 0);
    assert.equal(JSON.parse(inWindow.stdout).snapshot.receipts.length, 2);

    // Window before receipts (distant past)
    const beforeWindow = run(reportScript, ["--root", fx.root, "--through", distantPast]);
    assert.equal(beforeWindow.status, 0);
    assert.equal(JSON.parse(beforeWindow.stdout).snapshot.receipts.length, 0);

    // Window after receipts (distant future)
    const afterWindow = run(reportScript, ["--root", fx.root, "--from", futureIso]);
    assert.equal(afterWindow.status, 0);
    assert.equal(JSON.parse(afterWindow.stdout).snapshot.receipts.length, 0);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});
