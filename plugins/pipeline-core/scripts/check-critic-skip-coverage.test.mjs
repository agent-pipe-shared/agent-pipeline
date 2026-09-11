#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { evaluateRepositoryCriticSkipCoverage, walkDispatchRecords } from "./check-critic-skip-coverage.mjs";

const SHA = "a".repeat(40);
function fixture(files) {
  const base = mkdtempSync(join(tmpdir(), "check-critic-skip-coverage-"));
  mkdirSync(join(base, "evidence"), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(base, path)), { recursive: true });
    writeFileSync(join(base, path), content);
  }
  return base;
}
function v3(taskId, disposition) {
  return {
    schema: "pipeline.dispatch-record.v3", taskId, agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium",
    rulesetSha: "0.6.2+local", dispatcher: "Elephant", candidateCommit: SHA, resultSha256: null,
    outcome: "in-progress", commits: [], log: [], report: null, ...disposition,
  };
}
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

test("walkDispatchRecords retains source paths and reports malformed JSON", () => {
  const root = fixture({ "evidence/dispatch-record-A.json": json({ taskId: "A" }), "evidence/dispatch-record-B.json": "{" });
  const result = walkDispatchRecords(root);
  assert.equal(result.filesScanned, 2);
  assert.deepEqual(result.records.map((entry) => entry.path), ["evidence/dispatch-record-A.json"]);
  assert.match(result.findings[0], /dispatch-record-B\.json/u);
});

test("v2 and unversioned dispatch records remain explicit pre-cutover legacy", () => {
  const v2 = v3("V2", {}); v2.schema = "pipeline.dispatch-record.v2";
  const root = fixture({
    "evidence/dispatch-record-OLD.json": json({ taskId: "OLD", outcome: "completed" }),
    "evidence/dispatch-record-V2.json": json(v2),
  });
  const result = evaluateRepositoryCriticSkipCoverage({ root });
  assert.equal(result.ok, true);
  assert.equal(result.legacyRecordCount, 2);
  assert.equal(result.applicableRecordCount, 0);
});

test("each v3 dispatch may carry a structured skip decision", () => {
  const root = fixture({
    "evidence/dispatch-record-A.json": json(v3("A", { criticSkip: { schema: "pipeline.critic-skip-decision.v1", reason: "T5" } })),
    "evidence/dispatch-record-B.json": json(v3("B", { criticSkip: { schema: "pipeline.critic-skip-decision.v1" } })),
  });
  const result = evaluateRepositoryCriticSkipCoverage({ root });
  assert.equal(result.ok, true);
  assert.equal(result.skipRecordCount, 2);
});

test("a v3 Critic reference must resolve and match its exact artifact digest", () => {
  const bytes = Buffer.from("Critic PASS for A\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const criticEvidence = { schema: "pipeline.critic-evidence-reference.v1", taskId: "A", candidateCommit: SHA, path: "backlog/evidence/critic-A.md", sha256: digest };
  const root = fixture({
    "backlog/evidence/critic-A.md": bytes,
    "evidence/dispatch-record-A.json": json(v3("A", { criticEvidence })),
  });
  const result = evaluateRepositoryCriticSkipCoverage({ root });
  assert.equal(result.ok, true);
  assert.equal(result.criticEvidenceRecordCount, 1);
});

test("a global critic-named file never exempts an unrelated v3 dispatch", () => {
  const root = fixture({
    "evidence/critic-report-some-other-task.json": "{}\n",
    "evidence/dispatch-record-A.json": json(v3("A", {})),
  });
  const result = evaluateRepositoryCriticSkipCoverage({ root });
  assert.equal(result.ok, false);
  assert.equal(result.criticEvidenceRecordCount, 0);
  assert.match(result.readFindings.join("\n"), /requires exactly one of criticSkip or criticEvidence/u);
});

test("one valid reference does not cover a second unrelated v3 dispatch", () => {
  const bytes = Buffer.from("Critic PASS for A\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const root = fixture({
    "evidence/critic-A.md": bytes,
    "evidence/dispatch-record-A.json": json(v3("A", { criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId: "A", candidateCommit: SHA, path: "evidence/critic-A.md", sha256: digest } })),
    "evidence/dispatch-record-B.json": json(v3("B", {})),
  });
  const result = evaluateRepositoryCriticSkipCoverage({ root });
  assert.equal(result.ok, false);
  assert.equal(result.criticEvidenceRecordCount, 1);
  assert.equal(result.applicableRecordCount, 2);
});

test("wrong task binding, candidate binding, missing artifact and digest mismatch fail closed", () => {
  const bytes = Buffer.from("Critic PASS\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const variants = [
    { taskId: "OTHER", candidateCommit: SHA, path: "evidence/critic-A.md", sha256: digest },
    { taskId: "A", candidateCommit: "b".repeat(40), path: "evidence/critic-A.md", sha256: digest },
    { taskId: "A", candidateCommit: SHA, path: "evidence/missing.md", sha256: digest },
    { taskId: "A", candidateCommit: SHA, path: "evidence/critic-A.md", sha256: "f".repeat(64) },
  ];
  for (const variant of variants) {
    const criticEvidence = { schema: "pipeline.critic-evidence-reference.v1", ...variant };
    const root = fixture({ "evidence/critic-A.md": bytes, "evidence/dispatch-record-A.json": json(v3("A", { criticEvidence })) });
    assert.equal(evaluateRepositoryCriticSkipCoverage({ root }).ok, false);
  }
});

test("missing evidence directory is operationally not-ok", () => {
  const root = mkdtempSync(join(tmpdir(), "check-critic-skip-no-evidence-"));
  const result = evaluateRepositoryCriticSkipCoverage({ root });
  assert.equal(result.ok, false);
  assert.match(result.readFindings[0], /missing or unreadable/u);
});
