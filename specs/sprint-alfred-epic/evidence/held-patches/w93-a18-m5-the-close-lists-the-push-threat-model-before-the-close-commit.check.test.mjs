// Held patch w93 check: the patch exists, is non-empty, and touches only the named files.
// It is a delta on w79 and is deliberately not applied against the repository here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./w93-a18-m5-the-close-lists-the-push-threat-model-before-the-close-commit.patch", import.meta.url));
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/close-coordinator.mjs",
  "plugins/pipeline-core/scripts/close-coordinator.test.mjs",
  "plugins/pipeline-core/lib/close-chain-guide.mjs",
  "plugins/pipeline-core/lib/close-chain-guide.test.mjs",
  "plugins/pipeline-core/skills/close-feature/SKILL.md",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(readFileSync(PATCH).length > 0);
});

test("the patch touches only the named files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(ALLOWED.has(file), `unexpected file in patch: ${file}`);
});
