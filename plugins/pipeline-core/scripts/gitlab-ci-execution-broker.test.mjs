// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { runGitLabCiExecutionBroker } from "./gitlab-ci-execution-broker.mjs";
const output = { stdout: "", stderr: "" };
const code = runGitLabCiExecutionBroker([], { stdout: { write: (value) => { output.stdout += value; } }, stderr: { write: (value) => { output.stderr += value; } } });
assert.equal(code, 2); assert.match(output.stderr, /usage/u); process.stdout.write("PASS broker CLI rejects absent record without network access\n");
