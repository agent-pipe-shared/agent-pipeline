// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w154 exists and touches only its two briefed files. It does not apply the patch
// (the patch is a delta on w153, see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w154-q2-the-outside-root-read-refusal-says-it-is-intended-and-names-the-alternative.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the two briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowed = new Set([
    "plugins/pipeline-core/lib/guard/grammar-denials.mjs",
    "plugins/pipeline-core/lib/read-command-diagnosis.test.mjs",
  ]);
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowed.has(file), file);
});
