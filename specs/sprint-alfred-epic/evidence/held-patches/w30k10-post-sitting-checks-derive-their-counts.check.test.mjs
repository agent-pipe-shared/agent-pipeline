// SPDX-License-Identifier: SUL-1.0
// Purpose: check the held patch w30k10 exists and touches only its three files (it is a delta on the integrated 30j tree, so it is not applied here).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const patch = join(dirname(fileURLToPath(import.meta.url)), "w30k10-post-sitting-checks-derive-their-counts.patch");
const ALLOWED = ["scripts/post-sitting-checks.mjs", "scripts/post-sitting-checks.test.mjs", "docs/operating-tools.md"];

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the three named files", () => {
  const files = [...readFileSync(patch, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(ALLOWED.includes(f), `unexpected file in patch: ${f}`);
  for (const f of ALLOWED) assert.ok(files.includes(f), `file missing from patch: ${f}`);
});
