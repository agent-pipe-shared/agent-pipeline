// Check for held patch C30K-K13: the patch exists, is non-empty and touches only the briefed files.
// It does not apply the patch: the patch is a delta on the integrated 30j tree (all 30j lanes applied first).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w30k13-the-case-completion-sync-is-part-of-the-derived-files-refresh.patch");
const ALLOWED = new Set([
  "scripts/refresh-derived-files.mjs",
  "scripts/refresh-derived-files.test.mjs",
  "harness/scripts/verify-case-completion-augmentation.mjs",
  "harness/scripts/verify-case-completion-augmentation.test.mjs",
  "harness/scripts/check-verify-case-completion.mjs",
  "docs/operating-tools.md",
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
