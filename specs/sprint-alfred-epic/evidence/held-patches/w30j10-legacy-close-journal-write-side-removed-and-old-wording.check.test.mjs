// Check for held patch w30j10 (C30J-J10): the patch exists, is non-empty and touches only the allowed files.
// It never runs git apply: the patch is a delta on the integrated 30i tree (see the notes file).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w30j10-legacy-close-journal-write-side-removed-and-old-wording.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/publication-close-journal.mjs",
  "plugins/pipeline-core/scripts/publication-close-journal.test.mjs",
  "plugins/pipeline-core/scripts/goldfish-commit-command-flow.test.mjs",
  "plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs",
]);

test("w30j10: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(readFileSync(PATCH, "utf8").length > 0);
});

test("w30j10: the patch touches only the allowed files", () => {
  const files = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)];
  assert.ok(files.length > 0);
  for (const [, a, b] of files) {
    assert.equal(a, b);
    assert.ok(ALLOWED.has(b), `unexpected file in patch: ${b}`);
  }
});
