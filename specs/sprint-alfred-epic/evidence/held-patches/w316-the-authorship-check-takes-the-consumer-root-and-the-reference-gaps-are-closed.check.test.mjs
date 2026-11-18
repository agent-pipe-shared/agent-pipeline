// SPDX-License-Identifier: SUL-1.0
// Check for held patch w316: the patch exists, is non-empty and touches only the briefed files.
// It does not apply the patch (it is a delta on the base clone of candidate 31).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w316-the-authorship-check-takes-the-consumer-root-and-the-reference-gaps-are-closed.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs",
  "plugins/pipeline-core/scripts/dispatch-authorship-verify.test.mjs",
  "plugins/pipeline-core/skills/critic-review/SKILL.md",
  "plugins/pipeline-core/skills/pipeline-start/references/antigravity-native-dispatch.md",
  "plugins/pipeline-core/skills/pipeline-start/references/design-course.md",
  "plugins/pipeline-core/skills/pipeline-start/references/happy-path.md",
  "plugins/pipeline-core/skills/pipeline-start/references/onboarding-recovery.md",
]);

test("w316 patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("w316 patch touches only the briefed files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(ALLOWED.has(file), `unexpected file in patch: ${file}`);
});
