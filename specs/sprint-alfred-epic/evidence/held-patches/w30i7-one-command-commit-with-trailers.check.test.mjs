// SPDX-License-Identifier: SUL-1.0
// C30I-S4 check: the held patch exists, is not empty and touches only the briefed files. No producer or product run.
// The patch is a delta on the 30h chain plus the skill split, the agent fields, the bound-session advance and the registration
// --supersedes (the clone base7), which is not applied to the repository yet, so this check never runs `git apply` against the
// repository root: the notes name the required order (apply that chain first, then this patch).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const PATCH = join(import.meta.dirname, "w30i7-one-command-commit-with-trailers.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/hooks/guard-git.mjs",
  "plugins/pipeline-core/hooks/guard-git.test.mjs",
  "plugins/pipeline-core/lib/commit-message-policy.mjs",
  "plugins/pipeline-core/lib/commit-message-policy.test.mjs",
  "plugins/pipeline-core/lib/pins/agent-obligations-says-no-and-and-while-the-guard-admits-six-segments.test.mjs",
  "templates/prompts/agent-obligations.md",
  "plugins/pipeline-core/templates/prompts/agent-obligations.md",
  "guardrails/git.md",
  "plugins/pipeline-core/guardrails/git.md",
  "plugins/pipeline-core/skills/conventional-commit/SKILL.md",
  "harness/config/verify-case-completion-augmentations.v1.json",
]);

test("the patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the patch touches only the briefed files", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `${path} is outside the briefed files`);
});

test("the patch carries the Git-exact reconstruction, the glue refusal and the one-command repair text", () => {
  const text = readFileSync(PATCH, "utf8");
  for (const needle of ["GIT-03-TRAILERS-GLUED-TO-BODY", "ONE_COMMAND_TRAILER_FORM", "gitReadsLastParagraphAsTrailerBlock", "Commit route (C30-19)"]) {
    assert.ok(text.includes(needle), `${needle} is part of the patch`);
  }
});
