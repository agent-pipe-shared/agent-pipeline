// SPDX-License-Identifier: SUL-1.0
// w233 (E4, AC-108 closest accepted criterion): the held patch exists and touches only the named files.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w233-e4-the-queue-preparation-waits-for-a-sibling-launch-lock-within-the-admission-deadline.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/native-goldfish-host-state.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch.test.mjs",
  "harness/config/verify-case-completion-augmentations.v1.json",
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
