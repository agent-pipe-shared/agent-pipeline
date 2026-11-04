// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w171 exists and touches only its briefed files. It does not apply the patch against the repository:
// the patch is a delta on the chain through w162 (see the notes file for the required order).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w171-d4b-the-pre-push-hook-and-the-security-gate-take-the-shared-freshness-verdict-and-the-carry-forward-is-on.patch", import.meta.url);

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
    "plugins/pipeline-core/lib/security-completeness-gate.mjs",
    "plugins/pipeline-core/scripts/pre-push-hook-install.mjs",
    "plugins/pipeline-core/lib/evidence-carry-forward-reader.mjs",
    "plugins/pipeline-core/lib/evidence-freshness-codes.mjs",
    "plugins/pipeline-core/hooks/guard-push.mjs",
    "plugins/pipeline-core/scripts/push-prepare.mjs",
    "plugins/pipeline-core/scripts/push-gate-satisfiability.mjs",
    "plugins/pipeline-core/lib/push-gate-real-decision-carry.test.mjs",
    "docs/push-release-flow.md",
    "docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md",
    "docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.json",
    "harness/verify-suites.json",
    "docs/product-capability-inventory.json",
  ]);
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowed.has(file), file);
});
