// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w177-lb2 exists and touches only its briefed files. It does not apply the patch to the repository:
// the patch is a delta on the held patch w190 (it edits the same files), so the order is w190 first, then this one (see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w177-lb2-the-continuity-schema-knows-the-draft-state-and-the-core-readers-move-onto-the-shared-seal-reader.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowedExact = new Set([
    "plugins/pipeline-core/lib/continuity-state.mjs",
    "plugins/pipeline-core/lib/onboarding-continuity.mjs",
    "plugins/pipeline-core/lib/plan-spec-state-v2.mjs",
    "plugins/pipeline-core/lib/po-gate-authority-read.mjs",
    "plugins/pipeline-core/lib/critical-action-authorization-read.mjs",
    "plugins/pipeline-core/lib/push-batch-contract.mjs",
    "plugins/pipeline-core/lib/scoped-verify-registration.mjs",
    "plugins/pipeline-core/lib/authority-seal-reader.mjs",
    "plugins/pipeline-core/lib/authority-seal-reader.test.mjs",
    "plugins/pipeline-core/lib/authority-seal-readers.test.mjs",
    "harness/verify-suites.json",
    "docs/product-capability-inventory.json",
  ]);
  // continuity fixtures and pins that must be restated live directly in these two directories
  const allowedDirectory = /^plugins\/pipeline-core\/(?:lib|scripts)\/[^/]+$/u;
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowedExact.has(file) || allowedDirectory.test(file), file);
});
