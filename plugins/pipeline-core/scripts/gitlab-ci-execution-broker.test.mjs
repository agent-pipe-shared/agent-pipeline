// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { runGitLabCiExecutionBroker } from "./gitlab-ci-execution-broker.mjs";
const output = { stdout: "", stderr: "" };
const code = runGitLabCiExecutionBroker([], { stdout: { write: (value) => { output.stdout += value; } }, stderr: { write: (value) => { output.stderr += value; } } });
assert.equal(code, 2); assert.match(output.stderr, /usage/u); process.stdout.write("PASS broker CLI rejects absent record without network access\n");
const malformed = { stdout: "", stderr: "" };
const malformedCode = runGitLabCiExecutionBroker(["record.json"], { stdout: { write: (value) => { malformed.stdout += value; } }, stderr: { write: (value) => { malformed.stderr += value; } }, readFile: () => "{}" });
assert.equal(malformedCode, 2); assert.deepEqual(JSON.parse(malformed.stdout), { ok: false, code: "SCHEMA:broker" }); process.stdout.write("PASS broker CLI applies the closed structural schema before semantic admission\n");
for (const source of ['{"schema":"pipeline.gitlab-ci-execution-broker.v1","schema":"forged"}', '{"record":{"state":"submitted","state":"forged"}}']) {
  const duplicate = { stdout: "", stderr: "" };
  const duplicateCode = runGitLabCiExecutionBroker(["record.json"], { stdout: { write: (value) => { duplicate.stdout += value; } }, stderr: { write: (value) => { duplicate.stderr += value; } }, readFile: () => source });
  assert.equal(duplicateCode, 2); assert.equal(duplicate.stdout, ""); assert.match(duplicate.stderr, /invalid broker record/u);
}
process.stdout.write("PASS broker CLI rejects root and nested duplicate JSON fields before schema admission\n");
