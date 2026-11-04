// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w159 exists and touches only its six briefed files. It does not apply the patch
// (the patch is built on the chain through w158, see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w159-d4b-stage-2a-the-evidence-freshness-check-carries-a-stable-code-and-satisfiability-prefers-it.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the six briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowed = new Set([
    "docs/product-capability-inventory.json",
    "harness/verify-suites.json",
    "plugins/pipeline-core/lib/evidence-freshness-codes.mjs",
    "plugins/pipeline-core/lib/evidence-freshness-codes.test.mjs",
    "plugins/pipeline-core/scripts/push-gate-satisfiability.mjs",
    "plugins/pipeline-core/scripts/push-prepare.mjs",
  ]);
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowed.has(file), file);
});
