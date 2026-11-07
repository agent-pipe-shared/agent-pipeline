// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w267 (C20-G2038-AGENT-RECONCILE): the patch exists, is non-empty and touches only plugin or harness files,
// and it carries the product change (the topology planner and the State command) plus the walk edit.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w267-c20-agent-reconcile.patch"), "utf8");

test("w267 patch exists, is non-empty and every touched file is under plugins/pipeline-core/ or harness/", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.ok(file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/"), `outside plugins/pipeline-core/ and harness/: ${file}`);
  }
  assert.ok(files.includes("plugins/pipeline-core/lib/feature-package-topology.mjs"), "the reconcile planner is part of the patch");
  assert.ok(files.includes("plugins/pipeline-core/scripts/pipeline-state.mjs"), "the State reconcile command is part of the patch");
  assert.ok(files.includes("plugins/pipeline-core/scripts/close-path-e2e.test.mjs"), "the end-to-end walk test is part of the patch");
});
