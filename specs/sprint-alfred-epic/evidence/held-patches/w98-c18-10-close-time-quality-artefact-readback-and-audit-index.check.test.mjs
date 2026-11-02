// SPDX-License-Identifier: SUL-1.0
// C18-10 (AC-239): the held patch exists and touches only the six files of the slice. It is a delta on w79 and w93, so it is not applied here.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./w98-c18-10-close-time-quality-artefact-readback-and-audit-index.patch", import.meta.url));
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/close-quality-readback.mjs",
  "plugins/pipeline-core/lib/close-quality-readback.test.mjs",
  "plugins/pipeline-core/scripts/close-coordinator.mjs",
  "plugins/pipeline-core/scripts/close-coordinator.test.mjs",
  "plugins/pipeline-core/lib/close-chain-guide.mjs",
  "plugins/pipeline-core/lib/close-chain-guide.test.mjs",
]);

test("the w98 patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("the w98 patch touches only the named files", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.has(path), `unexpected file in patch: ${path}`);
  assert.ok(touched.includes("plugins/pipeline-core/lib/close-quality-readback.mjs"));
});
