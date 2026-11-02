// SPDX-License-Identifier: SUL-1.0
// C18-15 (AC-239) held-patch check: the patch exists, is non-empty and touches only the two named files.
// It does not run git apply: the patch is a delta on held patch w85 (see the notes for the order).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w94-c18-15-an-optional-visual-check-in-the-goldfish-briefing.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/dispatch-briefing-build.mjs",
  "plugins/pipeline-core/scripts/dispatch-briefing.test.mjs",
];

test("C18-15 the held patch exists and is non-empty", () => {
  assert.equal(existsSync(PATCH), true);
  assert.ok(readFileSync(PATCH, "utf8").length > 0);
});

test("C18-15 the held patch touches only the builder and its test", () => {
  const files = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(files.length > 0, "the patch has file headers");
  assert.deepEqual([...new Set(files)].sort(), [...ALLOWED].sort());
});
