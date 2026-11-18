// SPDX-License-Identifier: SUL-1.0
// C31-B10 delivery check: the held patch exists, is non-empty and touches only the four files of its write list.
// It does not run git apply: the patch is a delta on the base clone of candidate 31 (see the notes file for the order).

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const patchPath = fileURLToPath(new URL("./w3110-preflight-hints-a-stale-origin-head-before-a-worktree-dispatch.patch", import.meta.url));
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/pipeline-start-preflight.mjs",
  "plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs",
  "plugins/pipeline-core/lib/bootstrap-payload-budget.mjs",
  "plugins/pipeline-core/lib/bootstrap-payload-budget.test.mjs",
]);

test("C31-B10: the patch exists and is non-empty", () => {
  assert.ok(statSync(patchPath).size > 0);
});

test("C31-B10: the patch touches only the four allowed files and carries the notice", () => {
  const patch = readFileSync(patchPath, "utf8");
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(files.length > 0, "the patch names at least one file");
  for (const file of files) assert.ok(ALLOWED.has(file), `file outside the write list: ${file}`);
  assert.match(patch, /observeOriginHeadNotice/u);
});
