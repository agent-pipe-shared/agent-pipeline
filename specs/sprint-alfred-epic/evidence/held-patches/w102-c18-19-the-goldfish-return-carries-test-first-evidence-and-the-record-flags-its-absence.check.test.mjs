// Structural check of the w102 held patch (delta on w76, w90, w95, w96-c18-1e and w97; deliberately not applied to the repository here).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const patch = join(dirname(fileURLToPath(import.meta.url)), "w102-c18-19-the-goldfish-return-carries-test-first-evidence-and-the-record-flags-its-absence.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/native-goldfish-host-return.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-return.test.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-finalizer.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-finalizer.test.mjs",
  "plugins/pipeline-core/lib/dispatch-briefing-build.mjs",
  "plugins/pipeline-core/scripts/dispatch-briefing.test.mjs",
];

test("the patch exists and is non-empty", () => {
  assert.ok(existsSync(patch));
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the six named files", () => {
  const files = [...readFileSync(patch, "utf8").matchAll(/^diff --git a\/(\S+) b\/\S+$/gmu)].map((m) => m[1]);
  assert.ok(files.length > 0);
  assert.deepEqual([...new Set(files)].sort(), [...ALLOWED].sort());
});
