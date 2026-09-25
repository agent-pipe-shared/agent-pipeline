// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { parse, runPipelineCommitCli } from "./pipeline-commit.mjs";
test("CLI parser requires a canonical dispatch record and refuses caller-supplied attribution", () => {
  assert.equal(parse(["--type", "fix", "--scope", "x", "--message", "m", "--dispatch-record", "evidence/dispatch-record-T.json"]).dispatchRecord, "evidence/dispatch-record-T.json");
  assert.throws(() => parse(["--type", "fix", "--scope", "x", "--message", "m", "--dispatch-task", "T", "--dispatch-role", "goldfish"]), /usage/u);
  assert.throws(() => parse(["--type", "fix", "--scope", "x", "--message", "m"]), /usage/u);
});
test("structured CLI composes a WHY body without caller-supplied trailers or shell multiline text", () => {
  const value = parse(["--root", "/repo", "--type", "fix", "--scope", "core",
    "--summary", "handle quoted 'inputs'", "--body", "The old route retried unnecessarily.",
    "--body", "The new route keeps the staged scope.",
    "--dispatch-record", "evidence/dispatch-record-T.json", "--execute"]);
  assert.equal(value.message, "handle quoted 'inputs'\n\nThe old route retried unnecessarily.\n\nThe new route keeps the staged scope.");
  assert.equal(value.execute, true);
  assert.equal(value.dispatchRecord, "evidence/dispatch-record-T.json");
});
test("CLI rejects duplicate, mixed, multiline, unknown and unsafe timeout inputs before Git", () => {
  const base = ["--type", "fix", "--scope", "x", "--summary", "safe", "--body", "why", "--dispatch-record", "evidence/dispatch-record-T.json"];
  assert.throws(() => parse([...base, "--scope", "other"]), /usage/u);
  assert.throws(() => parse([...base, "--message", "extra"]), /usage/u);
  assert.throws(() => parse([...base, "--body", "bad\nbody"]), /usage/u);
  assert.throws(() => parse([...base, "--execute", "--execute"]), /usage/u);
  assert.throws(() => parse([...base, "--no-verify"]), /usage/u);
  assert.throws(() => parse([...base, "--timeout-ms", "NaN"]), /usage/u);
  assert.throws(() => parse([...base, "--timeout-ms", "300001"]), /usage/u);
});
test("CLI returns a nonzero exit for post-commit recovery without exposing private Git diagnostics", () => {
  const output = [], errors = [];
  const argv = ["--type", "fix", "--scope", "core", "--summary", "safe", "--body", "why",
    "--dispatch-record", "evidence/dispatch-record-T.json", "--execute"];
  const exitCode = runPipelineCommitCli(argv, {
    commit: () => ({ status: "recovery-required", code: "PC-COMMIT-READBACK-MISMATCH", commit: "a".repeat(40) }),
    stdout: { write: (value) => output.push(value) }, stderr: { write: (value) => errors.push(value) },
  });
  assert.equal(exitCode, 3);
  assert.equal(JSON.parse(output[0]).status, "recovery-required");
  assert.deepEqual(errors, []);
  const privateError = runPipelineCommitCli(argv, {
    commit: () => { throw Object.assign(new Error("private host path"), { code: "PC-COMMIT" }); },
    stdout: { write: (value) => output.push(value) }, stderr: { write: (value) => errors.push(value) },
  });
  assert.equal(privateError, 2);
  assert.equal(errors[0], "pipeline-commit: PC-COMMIT\n");
  assert.equal(errors[0].includes("private host path"), false);
});
