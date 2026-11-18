// SPDX-License-Identifier: SUL-1.0
// C31-C3B check: the held patch exists, is non-empty and touches only the two restated pin files.
// It does not run git apply (the patch is a delta on the base clone of candidate 31).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const patchPath = fileURLToPath(new URL(
  "./w313B-the-pins-of-the-grammar-refusal-trim-are-restated.patch", import.meta.url));
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/pins/grammar-listing-once-per-context-window.test.mjs",
  "plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patchPath).size > 0);
});

test("the patch touches only the two restated pin files", () => {
  const text = readFileSync(patchPath, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(ALLOWED.has(f), `unexpected file ${f}`);
  assert.deepEqual(new Set(files), ALLOWED);
});
