// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w30k20-the-close-names-the-ignored-addenda-paths-and-the-staging-command.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/close-coordinator.mjs",
  "plugins/pipeline-core/scripts/close-coordinator.test.mjs",
  "plugins/pipeline-core/lib/pins/close-coordinator-refuses-a-required-critic-without-evidence.test.mjs",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

// The patch is a delta on the integrated 30j tree, so it is not applied to the repository here (see the notes for the order).
test("the patch touches only the named files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map((m) => m[2]);
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(ALLOWED.has(f), `unexpected file in patch: ${f}`);
});
