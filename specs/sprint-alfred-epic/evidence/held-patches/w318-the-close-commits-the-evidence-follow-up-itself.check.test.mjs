// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w318 (candidate 31, C31-B8, L6 decision of 2026-11-19): the patch exists, is non-empty and touches only its write list.
// It does not run git apply: the patch is a delta on the base clone of candidate 31 (apply that base clone, w314 included, first).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PATCH = join(dirname(fileURLToPath(import.meta.url)), "w318-the-close-commits-the-evidence-follow-up-itself.patch");
const ALLOWED = [
  "plugins/pipeline-core/scripts/finish-feature.mjs",
  "plugins/pipeline-core/scripts/finish-feature.test.mjs",
  "plugins/pipeline-core/lib/audit-proof-collection.mjs",
  "plugins/pipeline-core/lib/audit-bundle.test.mjs",
  "plugins/pipeline-core/lib/security-close-status.mjs",
  "plugins/pipeline-core/scripts/close-path-e2e.test.mjs",
];
const REQUIRED = [
  "plugins/pipeline-core/scripts/finish-feature.mjs",
  "plugins/pipeline-core/scripts/finish-feature.test.mjs",
  "plugins/pipeline-core/lib/security-close-status.mjs",
  "plugins/pipeline-core/scripts/close-path-e2e.test.mjs",
];

test("w318 patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("w318 patch touches only the briefed files and carries the change and its tests", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.includes(path), `unexpected path ${path}`);
  for (const path of REQUIRED) assert.ok(touched.includes(path), `missing ${path}`);
});
