#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { parseArgs } from "./run-codex-critic-isolation.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS  ${name}\n`); }
check("help is explicit", () => assert.deepEqual(parseArgs(["--help"]), { help: true }));
check("exact commit is required", () => assert.deepEqual(parseArgs(["--commit", "a".repeat(40)]), { help: false, commit: "a".repeat(40) }));
check("debug log is one optional absolute path", () => assert.deepEqual(parseArgs(["--commit", "a".repeat(40), "--debug-log", "/tmp/critic-trace.jsonl"]), { help: false, commit: "a".repeat(40), debugLog: "/tmp/critic-trace.jsonl" }));
check("short, upper-case, extra and unknown arguments fail closed", () => {
  for (const argv of [[], ["--commit", "a".repeat(39)], ["--commit", "A".repeat(40)], ["--commit", "a".repeat(40), "extra"], ["--commit", "a".repeat(40), "--lease-ms", "300000"], ["--commit", "a".repeat(40), "--debug-log", "relative.jsonl"], ["--commit", "a".repeat(40), "--debug-log", "/tmp/a", "--debug-log", "/tmp/b"], ["--debug-log", "/tmp/a", "--commit", "a".repeat(40)], ["--branch", "main"]]) assert.throws(() => parseArgs(argv));
});
process.stdout.write(`\n${passed}/${passed} checks passed.\n`);
