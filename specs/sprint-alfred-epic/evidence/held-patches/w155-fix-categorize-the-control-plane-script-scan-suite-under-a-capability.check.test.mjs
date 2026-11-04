// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w155 exists and touches only its one briefed file. It does not apply the patch
// (the patch is built on the chain through w154, see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w155-fix-categorize-the-control-plane-script-scan-suite-under-a-capability.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the inventory file", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  assert.deepEqual([...files], ["docs/product-capability-inventory.json"]);
});
