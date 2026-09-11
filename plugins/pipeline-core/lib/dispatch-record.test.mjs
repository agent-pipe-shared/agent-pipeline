// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { openSync } from "node:fs";
import { declaredPaths, dispatchRecordSha256, isTerminalOutcome, missingBriefingFields, normalizeDispatchRecordPath, validateDispatchRecord } from "./dispatch-record.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const SHA = "a".repeat(40);
const opening = () => ({ schema: "pipeline.dispatch-record.v2", taskId: "NVA-B-1", agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium", rulesetSha: "0.6.2+local", dispatcher: "Elephant", candidateCommit: SHA, resultSha256: null, outcome: "in-progress", commits: [], log: [], report: null });
const terminal = () => ({ ...opening(), candidateCommit: "b".repeat(40), resultSha256: "d".repeat(64), outcome: "completed", commits: ["b".repeat(40)], log: [{ phase: "verify", toolUseCount: 12, note: "focused checks passed" }], report: { text: "Done.", changedFiles: ["plugins/pipeline-core/lib/x.mjs - implementation", { path: "plugins/pipeline-core/lib/x.test.mjs" }] } });

const cases = [];
function check(name, run) {
  cases.push({ id: `DRC${String(cases.length + 1).padStart(2, "0")}`, name, run });
}

check("opening and terminal records share the strict closed contract", () => {
  assert.deepEqual(validateDispatchRecord(opening()), opening());
  assert.deepEqual(validateDispatchRecord(terminal()), terminal());
  assert.match(dispatchRecordSha256(terminal()), /^[a-f0-9]{64}$/u);
});
check("terminality and legacy briefing/path extraction retain verifier semantics", () => {
  assert.equal(isTerminalOutcome("stopped-tool-budget"), true);
  assert.equal(isTerminalOutcome("in progress"), false);
  assert.deepEqual(missingBriefingFields({ model: "x", rulesetSha: "y", report: {} }), ["report"]);
  assert.deepEqual(declaredPaths(terminal()), ["plugins/pipeline-core/lib/x.mjs", "plugins/pipeline-core/lib/x.test.mjs"]);
});
check("missing, unknown and malformed fields fail closed", () => {
  for (const value of [
    { ...opening(), model: "" }, { ...opening(), effort: "" }, { ...opening(), candidateCommit: "abc" },
    { ...opening(), outcome: "In Progress" }, { ...opening(), unknown: true }, { ...opening(), taskId: "../x" },
    { ...opening(), outcome: "completed" },
    { ...terminal(), resultSha256: null }, { ...terminal(), resultSha256: "bad" },
    { ...terminal(), commits: [] },
    { ...terminal(), candidateCommit: "c".repeat(40) },
    { ...terminal(), commits: ["b".repeat(40), "c".repeat(40)], candidateCommit: "b".repeat(40) },
  ]) assert.throws(() => validateDispatchRecord(value));
});
check("computed, escaping and duplicate paths are rejected", () => {
  for (const path of ["../x", "/tmp/x", "src\\x", "src/$NAME", "src/$(pwd)", "src/*.mjs", "src//x"])
    assert.throws(() => normalizeDispatchRecordPath(path));
  for (const changedFiles of [["../x"], ["src/$NAME"], ["src/x", { path: "src/x" }], [{ path: "src/x", extra: true }]])
    assert.throws(() => validateDispatchRecord({ ...terminal(), report: { text: "Done.", changedFiles } }));
});
check("durable prose rejects private Unix, Windows and WSL absolute paths", () => {
  for (const text of [
    "read /home/alice/private/report.json", "opened C:\\Users\\Alice\\secret.txt",
    "copied from /mnt/c/Users/Alice/OneDrive/key.pem", "visited \\\\wsl.localhost\\Ubuntu\\home\\alice\\src",
    "ran under /root/private/repo", "macOS cache /private/var/folders/xy/cache",
    "/root", "/private/var",
  ]) {
    assert.throws(() => validateDispatchRecord({ ...terminal(), report: { ...terminal().report, text } }), /private absolute path/u);
    assert.throws(() => validateDispatchRecord({ ...terminal(), log: [{ phase: "x", toolUseCount: 1, note: text }] }), /private absolute path/u);
    assert.throws(() => validateDispatchRecord({ ...terminal(), modelOverride: { model: "x", effort: "high", rationale: text } }), /private absolute path/u);
  }
  assert.doesNotThrow(() => validateDispatchRecord({
    ...terminal(),
    report: { text: "repo-relative neighbors root, rooted, private/var, and private/variant are fine", changedFiles: ["root/private/file.mjs", "rooted/file.mjs", "private/var/cache.txt", "private/variant/cache.txt"] },
  }));
});

check("every persisted string lane rejects Unix, Windows, WSL and UNC private paths", () => {
  const paths = [
    "/home/alice/private/report.json",
    "C:\\Users\\Alice\\secret.txt",
    "/mnt/c/Users/Alice/OneDrive/key.pem",
    "\\\\wsl.localhost\\Ubuntu\\home\\alice\\src",
    "/root/private/repo",
    "/private/var/folders/xy/cache",
    "/root",
    "/private/var",
  ];
  const lanes = [
    ["schema", (value, path) => ({ ...value, schema: path })],
    ["taskId", (value, path) => ({ ...value, taskId: path })],
    ["agentType", (value, path) => ({ ...value, agentType: path })],
    ["model", (value, path) => ({ ...value, model: path })],
    ["effort", (value, path) => ({ ...value, effort: path })],
    ["rulesetSha", (value, path) => ({ ...value, rulesetSha: path })],
    ["dispatcher", (value, path) => ({ ...value, dispatcher: path })],
    ["candidateCommit", (value, path) => ({ ...value, candidateCommit: path })],
    ["outcome", (value, path) => ({ ...value, outcome: path })],
    ["commits[]", (value, path) => ({ ...value, commits: [path] })],
    ["log.phase", (value, path) => ({ ...value, log: [{ phase: path, toolUseCount: 1 }] })],
    ["log.note", (value, path) => ({ ...value, log: [{ phase: "done", toolUseCount: 1, note: path }] })],
    ["report.text", (value, path) => ({ ...value, report: { ...value.report, text: path } })],
    ["changedFiles annotation", (value, path) => ({ ...value, report: { ...value.report, changedFiles: [`src/x.mjs - ${path}`] } })],
    ["changedFiles path", (value, path) => ({ ...value, report: { ...value.report, changedFiles: [{ path }] } })],
    ["orchestratorAddedFiles annotation", (value, path) => ({ ...value, report: { ...value.report, orchestratorAddedFiles: [`src/y.mjs - ${path}`] } })],
    ["top-level orchestratorAddedFiles path", (value, path) => ({ ...value, orchestratorAddedFiles: [{ path }] })],
    ["modelOverride.model", (value, path) => ({ ...value, modelOverride: { model: path, effort: "high", rationale: "reviewed" } })],
    ["modelOverride.effort", (value, path) => ({ ...value, modelOverride: { model: "claude-opus-5", effort: path, rationale: "reviewed" } })],
    ["modelOverride.rationale", (value, path) => ({ ...value, modelOverride: { model: "claude-opus-5", effort: "high", rationale: path } })],
    ["criticSkip.schema", (value, path) => ({ ...value, criticSkip: { schema: path, reason: "not needed" } })],
    ["criticSkip.reason", (value, path) => ({ ...value, criticSkip: { schema: "pipeline.critic-skip-decision.v1", reason: path } })],
  ];
  for (const [lane, inject] of lanes) {
    for (const path of paths) {
      assert.throws(
        () => validateDispatchRecord(inject(terminal(), path)),
        (error) => error?.code === "record-private-path",
        `${lane} accepted ${path}`,
      );
    }
  }
});

assert.equal(cases.length, 6, "the complete dispatch-record corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
