// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w311 (candidate 31, C31-C1, items L14 + R4 B3): the patch exists, is non-empty and touches only its write list.
// It does not run git apply: the patch is a delta on the base clone of candidate 31 (apply that first).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PATCH = join(dirname(fileURLToPath(import.meta.url)), "w311-the-critic-preparation-names-the-commit-step-and-its-refusals-stay-short.patch");
const ALLOWED = [
  "plugins/pipeline-core/scripts/prepare-dispatch.mjs",
  "plugins/pipeline-core/scripts/prepare-dispatch.test.mjs",
  "plugins/pipeline-core/scripts/commit-pipeline-owned.mjs",
  "plugins/pipeline-core/scripts/commit-pipeline-owned.test.mjs",
];
const REQUIRED = [
  "plugins/pipeline-core/scripts/prepare-dispatch.mjs",
  "plugins/pipeline-core/scripts/prepare-dispatch.test.mjs",
  "plugins/pipeline-core/scripts/commit-pipeline-owned.test.mjs",
];

test("w311 patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("w311 patch touches only the briefed files and carries the change and its tests", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.includes(path), `unexpected path ${path}`);
  for (const path of REQUIRED) assert.ok(touched.includes(path), `missing ${path}`);
});
