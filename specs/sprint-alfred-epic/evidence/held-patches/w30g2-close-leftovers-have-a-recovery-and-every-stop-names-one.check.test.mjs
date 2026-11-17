// SPDX-License-Identifier: SUL-1.0
// C30G-D2 check: the held patch exists, is not empty and touches only the briefed files. No producer or product run.
// It does NOT run git apply against the repository: the patch is a delta on the applied chain plus the C30G-D1 patch, which must be applied first (see the notes).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const PATCH = join(import.meta.dirname, "w30g2-close-leftovers-have-a-recovery-and-every-stop-names-one.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/commit-pipeline-owned.mjs",
  "plugins/pipeline-core/scripts/commit-pipeline-owned.test.mjs",
  "plugins/pipeline-core/scripts/finish-feature.mjs",
  "plugins/pipeline-core/scripts/finish-feature.test.mjs",
  "plugins/pipeline-core/lib/gate-definition-changes.mjs",
  "plugins/pipeline-core/lib/gate-definition-changes.test.mjs",
]);

test("the patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the patch touches only the briefed files", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `${path} is outside the briefed files`);
});
