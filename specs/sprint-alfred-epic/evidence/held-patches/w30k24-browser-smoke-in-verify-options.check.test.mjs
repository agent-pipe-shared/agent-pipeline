// SPDX-License-Identifier: SUL-1.0
// Check for held patch w30k24 (analysis document: browser smoke in Verify, options and first stage).
// The patch is a delta on the integrated 30j tree, so it is NOT applied to the repository here:
// this file only asserts that the patch exists, is non-empty and touches the one document of the write list.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w30k24-browser-smoke-in-verify-options.patch");
const ALLOWED = ["specs/sprint-alfred-epic/plans/browser-smoke-in-verify-options-2026-11-18.md"];

test("w30k24 patch exists and is non-empty", () => {
  assert.equal(existsSync(patchPath), true, "the held patch file is missing");
  assert.ok(statSync(patchPath).size > 0, "the held patch file is empty");
});

test("w30k24 patch touches only the analysis document", () => {
  const text = readFileSync(patchPath, "utf8");
  const files = new Set();
  for (const match of text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)) {
    files.add(match[1]);
    files.add(match[2]);
  }
  assert.ok(files.size > 0, "no file entry found in the patch");
  assert.deepEqual([...files].sort(), [...ALLOWED].sort());
});
