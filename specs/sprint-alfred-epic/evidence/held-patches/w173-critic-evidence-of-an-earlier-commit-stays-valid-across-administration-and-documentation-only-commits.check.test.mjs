// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w173 exists and touches only its briefed files. It does not apply the patch against the repository:
// the patch is a delta on the chain through w171 (see the notes file for the required order).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w173-critic-evidence-of-an-earlier-commit-stays-valid-across-administration-and-documentation-only-commits.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowed = new Set([
    "plugins/pipeline-core/lib/administration-documentation-paths.mjs",
    "plugins/pipeline-core/lib/critic-evidence-carry.mjs",
    "plugins/pipeline-core/lib/record-only-paths.mjs",
    "plugins/pipeline-core/lib/feature-package-registration.mjs",
    "plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs",
    "plugins/pipeline-core/hooks/guard-push.mjs",
    "plugins/pipeline-core/scripts/push-prepare.mjs",
    "plugins/pipeline-core/lib/critic-evidence-carry.test.mjs",
    "plugins/pipeline-core/lib/guard-maintenance-window.mjs",
    "docs/guard-maintenance-window-threat-model.md",
    "docs/push-release-flow.md",
    "docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md",
    "docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.json",
    "harness/verify-suites.json",
    "docs/product-capability-inventory.json",
  ]);
  const libDirectory = /^plugins\/pipeline-core\/lib\/[^/]+$/u;
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowed.has(file) || libDirectory.test(file), file);
});

test("the patch carries the new modules and the new suite", () => {
  const text = readFileSync(patch, "utf8");
  for (const path of ["lib/administration-documentation-paths.mjs", "lib/critic-evidence-carry.mjs", "lib/critic-evidence-carry.test.mjs"]) {
    assert.ok(text.includes(`diff --git a/plugins/pipeline-core/${path} b/plugins/pipeline-core/${path}`), path);
  }
});
