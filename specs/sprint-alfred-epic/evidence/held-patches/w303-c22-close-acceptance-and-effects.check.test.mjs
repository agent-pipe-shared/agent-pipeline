// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w303 exists, is non-empty and touches only files under plugins/pipeline-core/.
// It does not apply the patch (the patch is a delta on the candidate 22 chain, see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w303-c22-close-acceptance-and-effects.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("every file the patch touches is under plugins/pipeline-core/", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(file.startsWith("plugins/pipeline-core/"), file);
});
