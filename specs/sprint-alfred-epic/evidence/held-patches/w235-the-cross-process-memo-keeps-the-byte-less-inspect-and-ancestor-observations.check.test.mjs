// SPDX-License-Identifier: SUL-1.0
// w235 (option O3 (i) of the native checks analysis, AC-108 closest accepted criterion): the held patch exists and touches only the named files.
// It does not run git apply against the repository: the patch is a delta on w233 and w234.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w235-the-cross-process-memo-keeps-the-byte-less-inspect-and-ancestor-observations.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/windows-owned-authority-backend.mjs",
  "plugins/pipeline-core/lib/authority-trace-hook.mjs",
  "plugins/pipeline-core/scripts/authority-trace-preload.mjs",
  "plugins/pipeline-core/scripts/authority-trace-preload.test.mjs",
  "plugins/pipeline-core/scripts/session-authority-repair.test.mjs",
  "harness/config/verify-case-completion-augmentations.v1.json",
  "harness/scripts/check-verify-case-completion.test.mjs",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("the patch touches only the named files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "no file in the patch");
  for (const file of files) assert.ok(ALLOWED.has(file), `outside the write scope: ${file}`);
});
