#!/usr/bin/env node
import assert from "node:assert/strict";
import { parseArgs } from "./run-codex-critic-probe-split.mjs";
let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS  ${name}\n`); }
check("accepts only an exact lower-case commit", () => assert.deepEqual(parseArgs(["--commit", "a".repeat(40)]), { commit: "a".repeat(40) }));
check("rejects missing, upper-case and surplus arguments", () => {
  for (const argv of [[], ["--commit", "A".repeat(40)], ["--commit", "a".repeat(39)], ["--commit", "a".repeat(40), "extra"]]) assert.throws(() => parseArgs(argv));
});
process.stdout.write(`\n${passed}/${passed} checks passed.\n`);
