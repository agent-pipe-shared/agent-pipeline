// SPDX-License-Identifier: SUL-1.0
// A18-M1B (AC-108): the held patch exists and touches only the named files. It does not apply the patch to the repository:
// the patch is a delta on held patches w85 and w94 (see the notes file for the required order).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const PATCH = new URL("./w99-a18-m1b-the-briefing-generator-knows-the-antigravity-runner-and-prints-accepted-aliases.patch", import.meta.url);
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/dispatch-briefing.mjs",
  "plugins/pipeline-core/scripts/dispatch-briefing.test.mjs",
  "plugins/pipeline-core/lib/agent-model-registry.mjs",
  "plugins/pipeline-core/lib/agent-model-registry.test.mjs",
  "plugins/pipeline-core/lib/dispatch-model-enforcement.mjs",
  "plugins/pipeline-core/lib/dispatch-model-enforcement.test.mjs",
  "plugins/pipeline-core/scripts/dispatch-record-write.mjs",
  "plugins/pipeline-core/scripts/dispatch-record-write.test.mjs",
  "plugins/pipeline-core/skills/pipeline-start/references/antigravity-native-dispatch.md",
]);

test("A18-M1B the patch exists and is non-empty", () => {
  assert.equal(existsSync(PATCH), true);
  assert.ok(readFileSync(PATCH, "utf8").length > 0);
});

test("A18-M1B the patch touches only the named files", () => {
  const files = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(ALLOWED.has(file), `unexpected file in patch: ${file}`);
});
