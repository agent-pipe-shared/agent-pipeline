// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w156 exists and touches only its four briefed files. It does not apply the patch
// (the patch is built on the chain through w154, see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w156-d4b-a-pure-decision-whether-evidence-only-commits-carry-verify-and-security-forward.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the four briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowed = new Set([
    "docs/product-capability-inventory.json",
    "harness/verify-suites.json",
    "plugins/pipeline-core/lib/evidence-carry-forward.mjs",
    "plugins/pipeline-core/lib/evidence-carry-forward.test.mjs",
  ]);
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowed.has(file), file);
});
