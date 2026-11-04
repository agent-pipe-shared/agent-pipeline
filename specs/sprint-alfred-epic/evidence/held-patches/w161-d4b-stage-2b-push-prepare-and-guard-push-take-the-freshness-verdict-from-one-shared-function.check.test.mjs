// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w161 exists and touches only its four briefed files. It does not apply the patch
// (the patch is built on the chain through w160, see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w161-d4b-stage-2b-push-prepare-and-guard-push-take-the-freshness-verdict-from-one-shared-function.patch", import.meta.url);

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
    "plugins/pipeline-core/hooks/guard-push.mjs",
    "plugins/pipeline-core/lib/evidence-freshness-codes.mjs",
    "plugins/pipeline-core/lib/evidence-freshness-codes.test.mjs",
    "plugins/pipeline-core/scripts/push-prepare.mjs",
  ]);
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowed.has(file), file);
});
