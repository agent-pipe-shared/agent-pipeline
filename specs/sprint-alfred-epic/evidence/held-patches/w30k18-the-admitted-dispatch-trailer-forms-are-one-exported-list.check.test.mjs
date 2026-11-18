// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w30k18-the-admitted-dispatch-trailer-forms-are-one-exported-list.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/commit-message-policy.mjs",
  "plugins/pipeline-core/lib/commit-message-policy.test.mjs",
  "plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs",
  "harness/scripts/generate-agent-obligations.mjs",
  "harness/scripts/generate-agent-obligations.test.mjs",
  "templates/prompts/agent-obligations.md",
  "plugins/pipeline-core/templates/prompts/agent-obligations.md",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

// The patch is a delta on the integrated 30j tree, so it is not applied to the repository here (see the notes for the order).
test("the patch touches only the named files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map((m) => m[2]);
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(ALLOWED.has(f), `unexpected file in patch: ${f}`);
});
