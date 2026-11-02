// SPDX-License-Identifier: SUL-1.0
// A18-M1c (AC-108): the held patch exists and touches only the named files. It is a delta on w85, w94, w99 and w102, so it is not applied here.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./w107-a18-m1c-build-and-probe-know-the-antigravity-runner.patch", import.meta.url));
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/native-goldfish-host-return.mjs",
  "plugins/pipeline-core/scripts/dispatch-briefing.mjs",
  "plugins/pipeline-core/scripts/dispatch-briefing.test.mjs",
]);

test("the w107 patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("the w107 patch touches only the named files", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.has(path), `unexpected file in patch: ${path}`);
  assert.ok(touched.includes("plugins/pipeline-core/lib/native-goldfish-host-return.mjs"));
});
