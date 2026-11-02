// SPDX-License-Identifier: SUL-1.0
// Candidate 18 turn hygiene: the held patch exists and touches only the two files of the slice. It is a delta on w79, w93 and w98, so it is not applied here.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./w103-drive-names-an-already-closed-lifecycle.patch", import.meta.url));
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/close-coordinator.mjs",
  "plugins/pipeline-core/scripts/close-coordinator.test.mjs",
]);

test("the w103 patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("the w103 patch touches only the named files", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.has(path), `unexpected file in patch: ${path}`);
  assert.ok(touched.includes("plugins/pipeline-core/scripts/close-coordinator.mjs"));
});
