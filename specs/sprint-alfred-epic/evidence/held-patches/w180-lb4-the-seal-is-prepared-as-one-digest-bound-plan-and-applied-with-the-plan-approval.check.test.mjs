// SPDX-License-Identifier: SUL-1.0
// Check of the held patch w180-lb4 (late-binding build step 4, AC-108 closest accepted criterion): the patch exists, is
// non-empty, and touches only the files the slice may touch. It does NOT run `git apply` against the repository: the patch is a
// delta on the held patch w179 (apply order: w179 first, then this patch), so an apply check against the bare repository is
// expected to fail until w179 is applied.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./w180-lb4-the-seal-is-prepared-as-one-digest-bound-plan-and-applied-with-the-plan-approval.patch", import.meta.url));

const ALLOWED_PREFIXES = [
  "plugins/pipeline-core/lib/",
  "plugins/pipeline-core/scripts/",
  "plugins/pipeline-core/hooks/",
  "plugins/pipeline-core/runbooks/",
];
const ALLOWED_FILES = new Set([
  "docs/guard-maintenance-window-threat-model.md",
  "harness/verify-suites.json",
  "docs/product-capability-inventory.json",
]);

function touchedPaths(text) {
  const paths = new Set();
  for (const line of text.split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { paths.add(match[1]); paths.add(match[2]); }
  }
  return [...paths];
}

test("the w180-lb4 patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "the held patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "the held patch file is empty");
});

test("the w180-lb4 patch touches only the files of the slice", () => {
  const paths = touchedPaths(readFileSync(PATCH, "utf8"));
  assert.ok(paths.length > 0, "the patch names no file");
  const outside = paths.filter((path) => !(ALLOWED_FILES.has(path) || ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))));
  assert.deepEqual(outside, [], `files outside the slice: ${outside.join(", ")}`);
  assert.ok(paths.includes("plugins/pipeline-core/lib/authority-seal-plan.mjs"), "the seal plan module is part of the patch");
  assert.ok(paths.includes("plugins/pipeline-core/lib/authority-seal-plan.test.mjs"), "the seal plan suite is part of the patch");
});
