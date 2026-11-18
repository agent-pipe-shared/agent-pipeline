// Targeted check for held patch w30k25 (C30K-K25): an analysis document only.
// It asserts that the patch exists, is non-empty and touches only the one
// document of the write list. It does not run `git apply` (the patch is a delta
// on the integrated 30j tree); the notes state the required application order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w30k25-design-round-improvement-options.patch");
const ALLOWED = new Set([
  "specs/sprint-alfred-epic/plans/design-round-improvement-options-2026-11-18.md",
]);

test("the held patch exists and is non-empty", () => {
  assert.equal(existsSync(PATCH), true, "the .patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "the .patch file is empty");
});

test("the held patch touches only the analysis document", () => {
  assert.equal(existsSync(PATCH), true, "the .patch file is missing");
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)];
  assert.ok(files.length > 0, "the patch names no file");
  for (const [, from, to] of files) {
    assert.ok(ALLOWED.has(from) && ALLOWED.has(to), `the patch touches a file outside the write list: ${from} -> ${to}`);
  }
});
