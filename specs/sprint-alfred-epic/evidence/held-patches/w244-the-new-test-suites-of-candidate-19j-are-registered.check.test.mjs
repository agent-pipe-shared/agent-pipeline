// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w244: the patch exists and touches only the registration files of the three new 19j suites.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w244-the-new-test-suites-of-candidate-19j-are-registered.patch"), "utf8");

test("w244 patch exists, is non-empty and touches only registration files", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]).sort();
  assert.deepEqual(files, [
    "docs/product-capability-inventory.json",
    "harness/config/verify-case-completion.v1.json",
    "harness/scripts/check-verify-case-completion.test.mjs",
    "harness/verify-suites.json",
  ]);
  for (const suite of ["native-goldfish-host-stop-pair-tests", "session-authority-registry-leftover-tests", "session-authority-repair-aside-tests"]) {
    assert.ok(patch.includes(suite), suite);
  }
});
