// SPDX-License-Identifier: SUL-1.0
// Check for held patch w30k23: the patch exists, is non-empty and touches only the two push-init files.
// It does not run git apply (the patch is a delta on the integrated 30j tree).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const patchPath = join(dirname(fileURLToPath(import.meta.url)), "w30k23-push-init-names-the-transport-reference-value.patch");

test("w30k23 patch is non-empty and touches only the push-init script and its test", () => {
  const text = readFileSync(patchPath, "utf8");
  assert.ok(text.length > 0);
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap((match) => [match[1], match[2]]);
  assert.ok(files.length > 0);
  const allowed = new Set(["plugins/pipeline-core/scripts/push-init.mjs", "plugins/pipeline-core/scripts/push-init.test.mjs"]);
  for (const file of files) assert.ok(allowed.has(file), `unexpected file in patch: ${file}`);
});
