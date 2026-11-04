// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w157 exists and touches only its three briefed files. It does not apply the patch
// (the patch is a delta on w156, see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w157-f9-a-refused-attached-flag-value-names-the-separate-argument-spelling.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the three briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowed = new Set([
    "plugins/pipeline-core/lib/guard/evaluate.mjs",
    "plugins/pipeline-core/lib/read-command-diagnosis.mjs",
    "plugins/pipeline-core/lib/read-command-diagnosis.test.mjs",
  ]);
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowed.has(file), file);
});
