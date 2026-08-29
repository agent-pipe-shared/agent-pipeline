#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-critic-skip-coverage.test.mjs -- covers the repository-scanning wiring against SYNTHETIC
 * fixture directories only (never this repository's real evidence/, whose current dispatch-record
 * population is not scoped or reviewed for this check -- see the module doc's "SCOPE, STATED
 * PLAINLY" note on the forward-looking-cutoff gap that is not yet closed).
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  countCriticArtifactFiles,
  evaluateRepositoryCriticSkipCoverage,
  isCriticArtifactFile,
  walkDispatchRecords,
} from "./check-critic-skip-coverage.mjs";

/** A synthetic repository root with an `evidence/` directory populated per `files`. */
function fixture(files) {
  const base = mkdtempSync(join(tmpdir(), "check-critic-skip-coverage-"));
  mkdirSync(join(base, "evidence"), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(base, "evidence", name), content);
  }
  return base;
}

function record(taskId, extra = {}) {
  return JSON.stringify({ taskId, agentType: "goldfish-implementor", outcome: "completed", ...extra });
}

test("isCriticArtifactFile matches critic-named evidence but not dispatch records", () => {
  assert.equal(isCriticArtifactFile("critic-report-abc-round1.json"), true);
  assert.equal(isCriticArtifactFile("critic-review-diff-abc.patch"), true);
  assert.equal(isCriticArtifactFile("msg-critic.txt"), true);
  assert.equal(isCriticArtifactFile("dispatch-record-NVA-CRITICSKIPWIRE.json"), false);
  assert.equal(isCriticArtifactFile("dispatch-record-CB-1a.json"), false);
  assert.equal(isCriticArtifactFile("plan.md"), false);
});

test("walkDispatchRecords reads only dispatch-record-*.json and reports unreadable files", () => {
  const root = fixture({
    "dispatch-record-A.json": record("A"),
    "dispatch-record-B.json": "{ not json",
    "other-file.json": JSON.stringify({ ignoreMe: true }),
  });
  const { records, findings, filesScanned } = walkDispatchRecords(root);
  assert.equal(filesScanned, 2);
  assert.equal(records.length, 1);
  assert.equal(records[0].taskId, "A");
  assert.equal(findings.length, 1);
  assert.match(findings[0], /dispatch-record-B\.json.*could not be read as valid JSON/u);
});

test("walkDispatchRecords tolerates a missing evidence/ directory", () => {
  const base = mkdtempSync(join(tmpdir(), "check-critic-skip-coverage-noevidence-"));
  const { records, findings, filesScanned } = walkDispatchRecords(base);
  assert.deepEqual(records, []);
  assert.equal(filesScanned, 0);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /evidence is missing or unreadable/u);
});

test("countCriticArtifactFiles counts only critic-named files", () => {
  const root = fixture({
    "critic-report-x-round1.json": "{}",
    "dispatch-record-X.json": record("X"),
    "notes.md": "nothing critic-related here",
  });
  assert.equal(countCriticArtifactFiles(root), 1);
});

test("scenario A: zero Critic artifacts, every dispatched work package logged a skip decision -- not a finding", () => {
  const root = fixture({
    "dispatch-record-A.json": record("A", { criticSkip: { schema: "pipeline.critic-skip-decision.v1", reason: "T5: light profile" } }),
    "dispatch-record-B.json": record("B", { criticSkip: { schema: "pipeline.critic-skip-decision.v1" } }),
  });
  const result = evaluateRepositoryCriticSkipCoverage({ root });
  assert.equal(result.dispatchedWorkCount, 2);
  assert.equal(result.skipRecordCount, 2);
  assert.equal(result.criticArtifactCount, 0);
  assert.equal(result.finding, false);
  assert.equal(result.ok, true);
  assert.match(result.reason, /legitimately never required/u);
});

test("scenario B: zero Critic artifacts, one dispatched work package has neither evidence nor a skip decision -- a finding", () => {
  const root = fixture({
    "dispatch-record-A.json": record("A", { criticSkip: { schema: "pipeline.critic-skip-decision.v1" } }),
    "dispatch-record-B.json": record("B"),
  });
  const result = evaluateRepositoryCriticSkipCoverage({ root });
  assert.equal(result.dispatchedWorkCount, 2);
  assert.equal(result.skipRecordCount, 1);
  assert.equal(result.criticArtifactCount, 0);
  assert.equal(result.finding, true);
  assert.equal(result.ok, false);
  assert.match(result.reason, /critic evidence expected but missing/u);
});

test("scenario C: any Critic artifact present at all suppresses the coverage question entirely", () => {
  const root = fixture({
    "dispatch-record-A.json": record("A"),
    "dispatch-record-B.json": record("B"),
    "critic-report-a-round1.json": "{}",
  });
  const result = evaluateRepositoryCriticSkipCoverage({ root });
  assert.equal(result.criticArtifactCount, 1);
  assert.equal(result.finding, false);
  assert.equal(result.ok, true);
  assert.match(result.reason, /critic artifact\(s\) present/u);
});

test("scenario D: no dispatch records at all -- nothing to evaluate, never a finding", () => {
  const root = fixture({});
  const result = evaluateRepositoryCriticSkipCoverage({ root });
  assert.equal(result.dispatchedWorkCount, 0);
  assert.equal(result.finding, false);
  assert.equal(result.ok, true);
  assert.match(result.reason, /no dispatched work in scope/u);
});

test("an unreadable dispatch record makes the coverage result not-ok even when the finding itself is clean", () => {
  const root = fixture({
    "dispatch-record-A.json": record("A", { criticSkip: { schema: "pipeline.critic-skip-decision.v1" } }),
    "dispatch-record-B.json": "{ malformed",
  });
  const result = evaluateRepositoryCriticSkipCoverage({ root });
  assert.equal(result.finding, false);
  assert.equal(result.ok, false, "a read failure must not silently pass as ok");
  assert.equal(result.readFindings.length, 1);
});

process.stdout.write("check-critic-skip-coverage: fixture checks passed\n");
