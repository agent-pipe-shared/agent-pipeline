// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w179-lb3 exists and touches only its briefed files. It does not apply the patch to the repository:
// the patch is a delta on the held patch w177 (it edits the same files), so the order is w177 first, then this one (see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w179-lb3-the-remaining-authority-readers-the-guard-tripwire-and-the-review-digests-follow-the-draft-state.patch", import.meta.url);

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
    "docs/guard-maintenance-window-threat-model.md",
    "harness/verify-suites.json",
    "docs/product-capability-inventory.json",
  ]);
  // the readers, the guard tripwire modules, the binding modules and the tests that must follow live in these three directories
  const allowedDirectory = /^plugins\/pipeline-core\/(?:lib|scripts|hooks)\/.+$/u;
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowedExact.has(file) || allowedDirectory.test(file), file);
});
