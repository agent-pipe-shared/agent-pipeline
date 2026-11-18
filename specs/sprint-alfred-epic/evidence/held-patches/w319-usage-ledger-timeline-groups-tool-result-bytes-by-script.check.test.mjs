// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w319 (candidate 31, C31-B9): the patch exists, is non-empty and touches only its write list.
// It does not run git apply: the patch is a delta on the base clone of candidate 31.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PATCH = join(dirname(fileURLToPath(import.meta.url)), "w319-usage-ledger-timeline-groups-tool-result-bytes-by-script.patch");
const ALLOWED = [
  "plugins/pipeline-core/scripts/usage-ledger.mjs",
  "plugins/pipeline-core/scripts/usage-ledger.test.mjs",
];

test("w319 patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("w319 patch touches only the briefed files", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.includes(path), `unexpected path ${path}`);
  for (const path of ALLOWED) assert.ok(touched.includes(path), `missing ${path}`);
});
