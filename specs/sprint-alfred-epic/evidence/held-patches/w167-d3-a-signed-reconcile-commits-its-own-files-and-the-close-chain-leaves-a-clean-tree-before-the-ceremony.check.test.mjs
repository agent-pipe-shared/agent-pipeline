// SPDX-License-Identifier: SUL-1.0
// Check for held patch w167 (D3): the patch exists, is non-empty and touches only the named files.
// It does not run git apply against the repository: the patch is a delta on held patch w166 (see the notes).
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./w167-d3-a-signed-reconcile-commits-its-own-files-and-the-close-chain-leaves-a-clean-tree-before-the-ceremony.patch", import.meta.url));
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
  "plugins/pipeline-core/scripts/po-approval-request.mjs",
  "plugins/pipeline-core/lib/pipeline-owned-files.mjs",
  "plugins/pipeline-core/lib/protected-baseline.mjs",
  "plugins/pipeline-core/lib/human-guard-override.mjs",
  "plugins/pipeline-core/scripts/guard-human-override.mjs",
  "plugins/pipeline-core/scripts/commit-pipeline-owned.mjs",
  "plugins/pipeline-core/scripts/d3-signed-reconcile-commit.test.mjs",
  "harness/verify-suites.json",
  "docs/product-capability-inventory.json",
]);

test("the w167 patch exists and is non-empty", () => {
  assert.equal(existsSync(PATCH), true);
  assert.ok(statSync(PATCH).size > 0);
});

test("the w167 patch touches only the named files", () => {
  const files = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(files.length > 0, "the patch names at least one file");
  assert.deepEqual([...new Set(files)].filter((file) => !ALLOWED.has(file)), []);
});
