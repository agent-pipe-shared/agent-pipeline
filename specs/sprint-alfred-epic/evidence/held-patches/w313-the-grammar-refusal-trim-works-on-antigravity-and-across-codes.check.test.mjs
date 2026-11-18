// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w313 (candidate 31, C31-C3, R4 B1): the patch exists, is non-empty and touches only its write list.
// It does not run git apply: the patch is a delta on the base clone of candidate 31.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PATCH = join(dirname(fileURLToPath(import.meta.url)), "w313-the-grammar-refusal-trim-works-on-antigravity-and-across-codes.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/guard/denial-telemetry.mjs",
  "plugins/pipeline-core/lib/guard/denial-telemetry.test.mjs",
  "plugins/pipeline-core/lib/guard/evaluate.mjs",
  "plugins/pipeline-core/lib/guard/grammar-denials.mjs",
];
const REQUIRED = [
  "plugins/pipeline-core/lib/guard/denial-telemetry.mjs",
  "plugins/pipeline-core/lib/guard/denial-telemetry.test.mjs",
  "plugins/pipeline-core/lib/guard/grammar-denials.mjs",
];

test("w313 B1 patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("w313 B1 patch touches only the briefed files and carries the change, its wording and its tests", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.includes(path), `unexpected path ${path}`);
  for (const path of REQUIRED) assert.ok(touched.includes(path), `missing ${path}`);
});
