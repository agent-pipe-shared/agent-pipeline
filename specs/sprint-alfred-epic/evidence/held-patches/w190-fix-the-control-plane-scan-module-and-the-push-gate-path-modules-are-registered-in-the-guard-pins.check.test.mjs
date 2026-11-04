// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w190 exists and touches only its four briefed files. It does not apply the patch
// (the patch is a delta on the stamped candidate 19a plus w165 and w166, see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w190-fix-the-control-plane-scan-module-and-the-push-gate-path-modules-are-registered-in-the-guard-pins.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the four briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowed = new Set([
    "docs/guard-maintenance-window-threat-model.md",
    "harness/guard-split-map.json",
    "plugins/pipeline-core/lib/guard-maintenance-window.mjs",
    "plugins/pipeline-core/lib/guard/guard-split-contract.test.mjs",
  ]);
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowed.has(file), file);
});
