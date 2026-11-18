// Check for held patch C30J-J19: the patch exists, is non-empty and touches only the briefed files.
// It does not apply the patch: the patch is a delta on the integrated 30i tree (the clone base9).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w30j19-the-tool-check-judges-usable-by-the-trust-rule-of-the-scan.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/trusted-tool-resolution.mjs",
  "plugins/pipeline-core/lib/trusted-tool-resolution.test.mjs",
  "plugins/pipeline-core/scripts/toolchain-preflight.mjs",
  "plugins/pipeline-core/scripts/toolchain-preflight.test.mjs",
  "plugins/pipeline-core/scripts/toolchain-preflight.schema.json",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patchPath).size > 0);
});

test("the patch touches only the briefed files", () => {
  const text = readFileSync(patchPath, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "the patch names files");
  const outside = [...new Set(files)].filter((f) => !ALLOWED.has(f));
  assert.deepEqual(outside, []);
});
