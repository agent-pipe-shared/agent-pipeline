// Check for held patch w30i8 (C30I-S4B): the patch exists, is non-empty and touches only the allowed files.
// It never runs git apply: the patch is a delta on the integrated tree including the 30i slices (see the notes file).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w30i8-obligations-teach-the-one-command-commit.patch");
const ALLOWED = new Set([
  "harness/scripts/generate-agent-obligations.mjs",
  "harness/scripts/generate-agent-obligations.test.mjs",
  "templates/prompts/agent-obligations.md",
  "plugins/pipeline-core/templates/prompts/agent-obligations.md",
  "templates/prompts/goldfish-task.md",
  "plugins/pipeline-core/templates/prompts/goldfish-task.md",
  "plugins/pipeline-core/lib/goldfish-commit-command-flow.mjs",
  "plugins/pipeline-core/scripts/goldfish-commit-command-flow.mjs",
  "plugins/pipeline-core/lib/guard/shell-grammar.mjs",
  "plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md",
  "plugins/pipeline-core/lib/pins/agent-obligations-says-no-and-and-while-the-guard-admits-six-segments.test.mjs",
]);

test("w30i8: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(readFileSync(PATCH, "utf8").length > 0);
});

test("w30i8: the patch touches only the allowed files", () => {
  const files = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)];
  assert.ok(files.length > 0);
  for (const [, a, b] of files) {
    assert.equal(a, b);
    assert.ok(ALLOWED.has(b), `unexpected file in patch: ${b}`);
  }
});

test("w30i8: the patch drops the blanket claim and adds the one-command form", () => {
  const patch = readFileSync(PATCH, "utf8");
  assert.match(patch, /^\+.*GIT-03-TRAILERS-GLUED-TO-BODY/mu);
  assert.match(patch, /^-.*is refused by guard-push/mu);
  assert.doesNotMatch(patch, /^\+ +put\(.*is refused by guard-push/mu);
});
