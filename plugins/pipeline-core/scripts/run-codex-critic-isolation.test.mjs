#!/usr/bin/env node
import assert from "node:assert/strict";
import { parseArgs } from "./run-codex-critic-isolation.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS  ${name}\n`); }
check("help is explicit", () => assert.deepEqual(parseArgs(["--help"]), { help: true }));
check("exact commit is required", () => assert.deepEqual(parseArgs(["--commit", "a".repeat(40)]), { help: false, commit: "a".repeat(40) }));
check("short, upper-case, extra and unknown arguments fail closed", () => {
  for (const argv of [[], ["--commit", "a".repeat(39)], ["--commit", "A".repeat(40)], ["--commit", "a".repeat(40), "extra"], ["--branch", "main"]]) assert.throws(() => parseArgs(argv));
});
process.stdout.write(`\n${passed}/${passed} checks passed.\n`);
