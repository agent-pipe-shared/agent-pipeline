#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { evaluateRepositoryCriticSkipCoverage, readCommitChangedPaths, walkDispatchRecords } from "./check-critic-skip-coverage.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_SKIP_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../lib/critic-skip-decision.mjs";

const SHA = "a".repeat(40);
const trigger = (overrides = {}) => ({ schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 0, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false }, ...overrides });
const skip = () => ({ schema: CRITIC_SKIP_SCHEMA, trigger: trigger(), appliedRow: "T5" });
const required = () => ({ schema: CRITIC_REQUIRED_SCHEMA, trigger: trigger({ rigorLevel: 2 }), appliedRow: "T3" });
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
const evaluate = (root, paths = ["generated/output.json"]) => evaluateRepositoryCriticSkipCoverage({ root, readChangedPaths: () => paths });

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
  const result = evaluate(root);
  assert.equal(result.ok, true);
  assert.equal(result.legacyRecordCount, 2);
  assert.equal(result.applicableRecordCount, 0);
});

test("each v3 dispatch may carry a structured skip decision", () => {
  const root = fixture({
    "evidence/dispatch-record-A.json": json(v3("A", { criticSkip: { ...skip(), reason: "fast path" } })),
    "evidence/dispatch-record-B.json": json(v3("B", { criticSkip: skip() })),
  });
  const result = evaluate(root);
  assert.equal(result.ok, true);
  assert.equal(result.skipRecordCount, 2);
});

test("required disposition remains valid but blocks coverage until evidence replaces it", () => {
  const root = fixture({
    "evidence/dispatch-record-A.json": json(v3("A", { criticRequired: required() })),
  });
  const pending = evaluate(root);
  assert.equal(pending.ok, false);
  assert.equal(pending.requiredRecordCount, 1);
  assert.match(pending.readFindings.join("\n"), /T3.*criticEvidence is missing/u);

  const bytes = Buffer.from("Critic PASS for A\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(join(root, "evidence", "critic-A.md"), bytes);
  writeFileSync(join(root, "evidence", "dispatch-record-A.json"), json(v3("A", {
    criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId: "A", candidateCommit: SHA, path: "evidence/critic-A.md", sha256: digest },
  })));
  const reviewed = evaluate(root);
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.requiredRecordCount, 0);
  assert.equal(reviewed.criticEvidenceRecordCount, 1);
});

test("false T5 decisions fail validation for A/G/S, high-risk and rigor triggers", () => {
  const variants = [
    trigger({ diff: { mechanical: false, architecture: true, guardrails: false, security: false } }),
    trigger({ diff: { mechanical: false, architecture: false, guardrails: true, security: false } }),
    trigger({ diff: { mechanical: false, architecture: false, guardrails: false, security: true } }),
    trigger({ riskClass: "high" }),
    trigger({ rigorLevel: 2 }),
    trigger({ rigorLevel: 1 }),
  ];
  for (const [index, triggerInput] of variants.entries()) {
    const root = fixture({ [`evidence/dispatch-record-A${index}.json`]: json(v3(`A${index}`, { criticSkip: { ...skip(), trigger: triggerInput } })) });
    const result = evaluate(root);
    assert.equal(result.ok, false);
    assert.match(result.readFindings.join("\n"), /appliedRow must equal evaluated row|not valid for trigger row/u);
  }
});

test("a v3 Critic reference must resolve and match its exact artifact digest", () => {
  const bytes = Buffer.from("Critic PASS for A\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const criticEvidence = { schema: "pipeline.critic-evidence-reference.v1", taskId: "A", candidateCommit: SHA, path: "backlog/evidence/critic-A.md", sha256: digest };
  const root = fixture({
    "backlog/evidence/critic-A.md": bytes,
    "evidence/dispatch-record-A.json": json(v3("A", { criticEvidence })),
  });
  const result = evaluate(root);
  assert.equal(result.ok, true);
  assert.equal(result.criticEvidenceRecordCount, 1);
});

test("a global critic-named file never exempts an unrelated v3 dispatch", () => {
  const root = fixture({
    "evidence/critic-report-some-other-task.json": "{}\n",
    "evidence/dispatch-record-A.json": json(v3("A", {})),
  });
  const result = evaluate(root);
  assert.equal(result.ok, false);
  assert.equal(result.criticEvidenceRecordCount, 0);
  assert.match(result.readFindings.join("\n"), /requires exactly one of criticSkip, criticRequired or criticEvidence/u);
});

test("one valid reference does not cover a second unrelated v3 dispatch", () => {
  const bytes = Buffer.from("Critic PASS for A\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const root = fixture({
    "evidence/critic-A.md": bytes,
    "evidence/dispatch-record-A.json": json(v3("A", { criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId: "A", candidateCommit: SHA, path: "evidence/critic-A.md", sha256: digest } })),
    "evidence/dispatch-record-B.json": json(v3("B", {})),
  });
  const result = evaluate(root);
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
    assert.equal(evaluate(root).ok, false);
  }
});

test("missing evidence directory is operationally not-ok", () => {
  const root = mkdtempSync(join(tmpdir(), "check-critic-skip-no-evidence-"));
  const result = evaluate(root);
  assert.equal(result.ok, false);
  assert.match(result.readFindings[0], /missing or unreadable/u);
});

test("actual commit paths reject false T5/T0 and allow generated lockfile T0", () => {
  const t0 = { schema: CRITIC_SKIP_SCHEMA, trigger: trigger({ diff: { mechanical: true, architecture: false, guardrails: false, security: false } }), appliedRow: "T0" };
  const falseT5Root = fixture({ "evidence/dispatch-record-A.json": json(v3("A", { criticSkip: skip() })) });
  const falseT5 = evaluate(falseT5Root, ["plugins/pipeline-core/hooks/guard-push.mjs"]);
  assert.equal(falseT5.ok, false);
  assert.match(falseT5.readFindings.join("\n"), /undeclared guardrails/u);

  const falseT0Root = fixture({ "evidence/dispatch-record-B.json": json(v3("B", { criticSkip: t0 })) });
  assert.match(evaluate(falseT0Root, ["src/runtime.mjs"]).readFindings.join("\n"), /outside conservative generated\/lockfile/u);

  const trueT0Root = fixture({ "evidence/dispatch-record-C.json": json(v3("C", { criticSkip: t0 })) });
  assert.equal(evaluate(trueT0Root, ["generated/client.mjs", "package-lock.json"]).ok, true);
});

test("empty commit paths preserve T5 admission and reject T0", () => {
  const t0 = { schema: CRITIC_SKIP_SCHEMA, trigger: trigger({ diff: { mechanical: true, architecture: false, guardrails: false, security: false } }), appliedRow: "T0" };
  const t5Root = fixture({ "evidence/dispatch-record-T5.json": json(v3("T5", { criticSkip: skip() })) });
  assert.equal(evaluate(t5Root, []).ok, true);

  const t0Root = fixture({ "evidence/dispatch-record-T0.json": json(v3("T0", { criticSkip: t0 })) });
  const result = evaluate(t0Root, []);
  assert.equal(result.ok, false);
  assert.match(result.readFindings.join("\n"), /T0 mechanical disposition includes a path outside conservative generated\/lockfile surfaces/u);
});

test("git path reader uses argv-only diff-tree and NUL-delimited output", () => {
  const calls = [];
  const paths = readCommitChangedPaths("/repo", [SHA], { execFile(command, args, options) {
    calls.push({ command, args, options });
    return Buffer.from("src/a.mjs\0hooks/guard.mjs\0");
  } });
  assert.deepEqual(paths, ["hooks/guard.mjs", "src/a.mjs"]);
  assert.equal(calls[0].command, "git");
  assert.deepEqual(calls[0].args.at(-1), SHA);
  assert.equal(calls[0].options.cwd, "/repo");
});

test("git path reader returns an empty array for a valid zero-path commit", () => {
  const calls = [];
  const paths = readCommitChangedPaths("/repo", [SHA], { execFile(command, args, options) {
    calls.push({ command, args, options });
    return Buffer.alloc(0);
  } });
  assert.deepEqual(paths, []);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.at(-1), SHA);
});
