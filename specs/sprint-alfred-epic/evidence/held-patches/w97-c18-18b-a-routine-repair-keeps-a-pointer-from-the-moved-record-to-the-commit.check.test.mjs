// Structural check of the w97 held patch (delta on w76, w90, w95, w96-c18-1e; deliberately not applied to the repository here).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const patch = join(dirname(fileURLToPath(import.meta.url)), "w97-c18-18b-a-routine-repair-keeps-a-pointer-from-the-moved-record-to-the-commit.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/native-goldfish-host-state.mjs",
  "plugins/pipeline-core/scripts/session-authority-repair.mjs",
  "plugins/pipeline-core/lib/routine-repair.mjs",
  "plugins/pipeline-core/lib/routine-repair.test.mjs",
  "plugins/pipeline-core/skills/critic-review/SKILL.md",
];

test("the patch exists and is non-empty", () => {
  assert.ok(existsSync(patch));
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the five named files", () => {
  const files = [...readFileSync(patch, "utf8").matchAll(/^diff --git a\/(\S+) b\/\S+$/gmu)].map((m) => m[1]);
  assert.ok(files.length > 0);
  assert.deepEqual([...new Set(files)].sort(), [...ALLOWED].sort());
});
