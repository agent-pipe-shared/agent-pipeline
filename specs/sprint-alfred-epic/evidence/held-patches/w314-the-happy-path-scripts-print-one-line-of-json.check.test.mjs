// C31-C4 (B2): the held patch exists and touches only the six named files.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./w314-the-happy-path-scripts-print-one-line-of-json.patch", import.meta.url));
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
  "plugins/pipeline-core/scripts/pipeline-state-inspect.test.mjs",
  "plugins/pipeline-core/scripts/finish-feature.mjs",
  "plugins/pipeline-core/scripts/finish-feature.test.mjs",
  "plugins/pipeline-core/scripts/dispatch-briefing.mjs",
  "plugins/pipeline-core/scripts/dispatch-briefing.test.mjs",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(readFileSync(PATCH, "utf8").length > 0);
});

test("the patch touches only the named files", () => {
  const files = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(ALLOWED.has(file), `unexpected file in patch: ${file}`);
  assert.equal(new Set(files).size, ALLOWED.size);
});
