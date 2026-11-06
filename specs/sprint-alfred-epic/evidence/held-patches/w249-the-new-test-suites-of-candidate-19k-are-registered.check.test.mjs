// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w249: the patch exists and touches only the registration files of the 19k suites.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w249-the-new-test-suites-of-candidate-19k-are-registered.patch"), "utf8");

test("w249 patch exists, is non-empty and touches only registration files", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]).sort();
  assert.deepEqual(files, [
    "docs/product-capability-inventory.json",
    "harness/scripts/check-verify-case-completion.test.mjs",
    "harness/verify-suites.json",
  ]);
  for (const needle of ["agent-guidance-w247-tests", "NGSP9D", "\"top-level-assertions\",66]"]) {
    assert.ok(patch.includes(needle), needle);
  }
});
