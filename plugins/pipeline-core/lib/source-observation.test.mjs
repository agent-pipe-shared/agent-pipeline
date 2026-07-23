// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { observeGitSource } from "./source-observation.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS SO${String(passed).padStart(2, "0")} ${name}\n`); }
function sequence(results, calls) {
  return (command, args, options) => { calls.push({ command, args, options }); return results.shift(); };
}
check("observes exact sha1 HEAD through two fixed shell-free calls", () => {
  const calls = [];
  const result = observeGitSource("/repo", { spawnFn: sequence([{ status: 0, stdout: "sha1\n" }, { status: 0, stdout: `${"a".repeat(40)}\n` }], calls) });
  assert.deepEqual(result, { ok: true, code: "SO-OBSERVED", objectFormat: "sha1", sourceOid: "a".repeat(40) });
  assert.equal(calls.every(({ command, options }) => command === "git" && options.shell === false && options.timeout === 5000), true);
});
check("supports sha256 and rejects malformed object identity", () => {
  assert.equal(observeGitSource("/repo", { spawnFn: sequence([{ status: 0, stdout: "sha256\n" }, { status: 0, stdout: `${"b".repeat(64)}\n` }], []) }).ok, true);
  assert.deepEqual(observeGitSource("/repo", { spawnFn: sequence([{ status: 0, stdout: "sha1\n" }, { status: 0, stdout: "short\n" }], []) }), { ok: false, code: "SO-SOURCE-OID" });
});
check("classifies timeout and Git failure without guessing a source", () => {
  assert.deepEqual(observeGitSource("/repo", { spawnFn: () => ({ status: null, error: { code: "ETIMEDOUT" } }) }), { ok: false, code: "SO-TIMEOUT" });
  assert.deepEqual(observeGitSource("/repo", { spawnFn: () => ({ status: 128, stderr: "bad" }) }), { ok: false, code: "SO-GIT" });
});
process.stdout.write(`${passed}/3 checks passed.\n`);
