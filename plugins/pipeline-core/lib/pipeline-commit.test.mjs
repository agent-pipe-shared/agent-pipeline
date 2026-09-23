// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { commitPipeline } from "./pipeline-commit.mjs";
function record(root, { taskId = "ALF-COMMIT-WRAPPER", candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), path = `evidence/dispatch-record-${taskId}.json` } = {}) {
  mkdirSync(join(root, "evidence"), { recursive: true });
  const value = { schema: "pipeline.dispatch-record.v3", taskId, agentType: "goldfish-implementor", model: "gpt-5.6-luna", effort: "medium", rulesetSha: "0.7.0", dispatcher: "Elephant", candidateCommit, resultSha256: null, outcome: "in-progress", commits: [], log: [], report: null, criticSkip: { schema: "pipeline.critic-skip-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 0, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T5" } };
  writeFileSync(join(root, path), `${JSON.stringify(value)}\n`); return path;
}
function repo(t) { const root = mkdtempSync(join(tmpdir(), "pipeline-commit-")); t.after(() => rmSync(root, { recursive: true, force: true })); execFileSync("git", ["init", "-q"], { cwd: root }); execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root }); execFileSync("git", ["config", "user.name", "Test"], { cwd: root }); writeFileSync(join(root, "file with spaces.txt"), "one\n"); execFileSync("git", ["add", "--", "file with spaces.txt"], { cwd: root }); execFileSync("git", ["commit", "-qm", "init"], { cwd: root }); writeFileSync(join(root, "file with spaces.txt"), "two\n"); execFileSync("git", ["add", "--", "file with spaces.txt"], { cwd: root }); return root; }
test("preview and execute bind the staged CAS to a real canonical dispatch-record fixture", t => { const root = repo(t); const dispatchRecord = record(root); const args = { root, type: "feat", scope: "core", message: "quoted 'message'\n\nThe wrapper keeps a single staged work package.", dispatchRecord }; const preview = commitPipeline(args); assert.equal(preview.status, "preview"); assert.equal(preview.dispatch.taskId, "ALF-COMMIT-WRAPPER"); assert.equal(preview.dispatch.recordPath, dispatchRecord); assert.match(preview.stagedSnapshotSha256, /^[a-f0-9]{64}$/u); const result = commitPipeline({ ...args, execute: true }); assert.equal(result.status, "committed"); assert.match(execFileSync("git", ["log", "-1", "--format=%B"], { cwd: root, encoding: "utf8" }), /Dispatch: ALF-COMMIT-WRAPPER \(goldfish\)/u); assert.match(execFileSync("git", ["log", "-1", "--format=%B"], { cwd: root, encoding: "utf8" }), /AI-Assisted: true/u); });
test("refuses forged caller attribution, traversal, noncanonical and stale dispatch records", t => { const root = repo(t); const canonical = record(root); const base = { root, type: "fix", scope: "x", message: "x", dispatchRecord: canonical }; assert.throws(() => commitPipeline({ ...base, dispatchTask: "FORGED", dispatchRole: "goldfish" }), (error) => error.code === "PC-DISPATCH"); assert.throws(() => commitPipeline({ ...base, dispatchRecord: "../evidence/dispatch-record-ALF-COMMIT-WRAPPER.json" }), (error) => error.code === "PC-DISPATCH"); const forged = record(root, { taskId: "FORGED", path: canonical }); assert.throws(() => commitPipeline({ ...base, dispatchRecord: forged }), (error) => error.code === "PC-DISPATCH"); const stale = record(root, { taskId: "STALE", candidateCommit: "0".repeat(40) }); assert.throws(() => commitPipeline({ ...base, dispatchRecord: stale }), (error) => error.code === "PC-DISPATCH-STALE"); });
test("rejects invalid type and empty stage", t => { const root = repo(t); const dispatchRecord = record(root); assert.throws(() => commitPipeline({ root, type: "Bad", scope: "x", message: "x", dispatchRecord }), (error) => error.code === "PC-INPUT"); execFileSync("git", ["reset", "-q"], { cwd: root }); assert.throws(() => commitPipeline({ root, type: "fix", scope: "x", message: "x", dispatchRecord }), (error) => error.code === "PC-EMPTY-STAGE"); });
test("a refusing commit-msg hook blocks execution without moving HEAD or dropping the stage", t => {
  const root = repo(t);
  const dispatchRecord = record(root);
  const hook = join(root, ".git", "hooks", "commit-msg");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n");
  chmodSync(hook, 0o755);
  const before = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  assert.throws(() => commitPipeline({ root, type: "fix", scope: "core", message: "respect commit hooks\n\nThe hook must retain veto authority.", dispatchRecord, execute: true }), error => error.code === "PC-COMMIT");
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), before);
  assert.match(execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: root, encoding: "utf8" }), /file with spaces\.txt/u);
});
