// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w148 exists and touches only its four briefed files. It does not apply the patch
// (the patch is a delta on w147, see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w148-f2b-the-shell-guard-admits-the-analysis-run-command-by-its-exact-argument-shape.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the four briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowed = new Set([
    "plugins/pipeline-core/lib/guard/analysis-run-command-admission.test.mjs",
    "plugins/pipeline-core/lib/guard/command-catalogue.mjs",
    "plugins/pipeline-core/lib/guard/constants.mjs",
    "plugins/pipeline-core/lib/guard/devplan-shell-lane.mjs",
  ]);
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowed.has(file), file);
});
