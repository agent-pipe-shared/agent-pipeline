// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w30k12-one-source-for-the-vendored-template-pairs.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/check-vendored-template-sync.mjs",
  "plugins/pipeline-core/scripts/check-vendored-template-sync.test.mjs",
  "harness/scripts/generate-vendored-canon.mjs",
  "harness/scripts/generate-vendored-canon.test.mjs",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("the patch touches only the four named files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map((m) => m[2]);
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(ALLOWED.has(f), `unexpected file in patch: ${f}`);
});
