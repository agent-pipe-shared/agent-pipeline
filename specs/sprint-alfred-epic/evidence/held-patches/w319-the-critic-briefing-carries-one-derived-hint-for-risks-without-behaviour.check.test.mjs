// SPDX-License-Identifier: SUL-1.0
/**
 * Check for the held patch w319 (C31-M9): the patch exists, is non-empty and touches only the files the lane may change.
 * It does NOT run git apply against the repository: the patch is a delta on the base clone of candidate 31 (see the notes file for the order).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PATCH_URL = new URL("./w319-the-critic-briefing-carries-one-derived-hint-for-risks-without-behaviour.patch", import.meta.url);
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/critic-briefing-build.mjs",
  "plugins/pipeline-core/lib/critic-briefing-build.test.mjs",
  "templates/prompts/critic-review.md",
  "plugins/pipeline-core/templates/prompts/critic-review.md",
  "plugins/pipeline-core/lib/spec-risk-trace.mjs",
  "plugins/pipeline-core/lib/spec-risk-trace.test.mjs",
]);

test("the patch exists and is non-empty", () => {
  const text = readFileSync(fileURLToPath(PATCH_URL), "utf8");
  assert.ok(text.length > 0, "the patch file is empty");
  assert.ok(text.startsWith("diff --git "), "the patch is a git diff");
});

test("the patch touches only the files the lane may change", () => {
  const text = readFileSync(fileURLToPath(PATCH_URL), "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `unexpected file in the patch: ${path}`);
  assert.ok(touched.includes("plugins/pipeline-core/lib/critic-briefing-build.mjs"), "the builder is part of the patch");
  assert.ok(touched.includes("templates/prompts/critic-review.md") && touched.includes("plugins/pipeline-core/templates/prompts/critic-review.md"), "both template copies are part of the patch");
});
