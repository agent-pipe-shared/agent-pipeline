// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w158 exists and touches only its five briefed files. It does not apply the patch
// (the patch is built on the chain through w157, see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w158-d4b-stage-2-the-record-only-path-set-lives-in-one-module-the-promotion-envelope-re-exports.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the five briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowed = new Set([
    "docs/product-capability-inventory.json",
    "harness/verify-suites.json",
    "plugins/pipeline-core/lib/record-only-paths.mjs",
    "plugins/pipeline-core/lib/record-only-paths.test.mjs",
    "plugins/pipeline-core/lib/release-promotion-envelope.mjs",
  ]);
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowed.has(file), file);
});
