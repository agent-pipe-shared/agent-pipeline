// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w314 (candidate 31, C31-B4, lane L6 stage 1): the patch exists, is non-empty and touches only its write list.
// It does not run git apply: the patch is a delta on the base clone of candidate 31 (apply the base clone first).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PATCH = join(dirname(fileURLToPath(import.meta.url)), "w314-the-close-writes-the-evidence-follow-up-at-closed-local.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/audit-proof-collection.mjs",
  "plugins/pipeline-core/lib/audit-bundle.test.mjs",
  "plugins/pipeline-core/scripts/audit-bundle.test.mjs",
  "plugins/pipeline-core/scripts/finish-feature.mjs",
  "plugins/pipeline-core/scripts/finish-feature.test.mjs",
  "plugins/pipeline-core/lib/security-close-status.mjs",
  "plugins/pipeline-core/lib/audit-bundle.mjs",
];
const REQUIRED = [
  "plugins/pipeline-core/lib/audit-proof-collection.mjs",
  "plugins/pipeline-core/scripts/finish-feature.mjs",
  "plugins/pipeline-core/scripts/finish-feature.test.mjs",
  "plugins/pipeline-core/lib/security-close-status.mjs",
];

test("w314 patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("w314 patch touches only the briefed files and carries the change and its tests", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.includes(path), `unexpected path ${path}`);
  for (const path of REQUIRED) assert.ok(touched.includes(path), `missing ${path}`);
});
