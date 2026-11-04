// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w170 exists and touches only its briefed files. It does not apply the patch
// (the patch is a delta on the held patch w166, see the notes file for the required order).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w170-e1-one-typed-orchestrator-commit-helper-checks-commits-with-the-trailer-and-writes-the-dispatch-record.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowedExact = new Set([
    "plugins/pipeline-core/scripts/goldfish-host-commit-recover.mjs",
    "plugins/pipeline-core/scripts/dispatch-record-write.mjs",
    "plugins/pipeline-core/hooks/native-goldfish-host.mjs",
    "plugins/pipeline-core/scripts/orchestrator-commit-record.test.mjs",
    "harness/verify-suites.json",
    "docs/product-capability-inventory.json",
  ]);
  const allowedPrefix = "plugins/pipeline-core/lib/";
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowedExact.has(file) || file.startsWith(allowedPrefix), file);
});
