// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w3110 (candidate 31, C31-M10, lane L13): the patch exists, is non-empty and touches only its write list.
// It does not run git apply: the patch is a delta on the base clone of candidate 31.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PATCH = join(dirname(fileURLToPath(import.meta.url)), "w3110-a-digest-mismatch-names-the-first-differing-line.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/dispatch-briefing-build.mjs",
  "plugins/pipeline-core/scripts/dispatch-briefing.test.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch.mjs",
  "plugins/pipeline-core/lib/briefing-file-reference.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch.test.mjs",
];
const REQUIRED = [
  "plugins/pipeline-core/lib/dispatch-briefing-build.mjs",
  "plugins/pipeline-core/scripts/dispatch-briefing.test.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch.test.mjs",
];

test("w3110 patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("w3110 patch touches only the briefed files and carries the change and its tests", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.includes(path), `unexpected path ${path}`);
  for (const path of REQUIRED) assert.ok(touched.includes(path), `missing ${path}`);
});
