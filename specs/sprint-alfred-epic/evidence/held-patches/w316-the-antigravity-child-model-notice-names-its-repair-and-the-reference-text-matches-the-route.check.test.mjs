// SPDX-License-Identifier: SUL-1.0
// Check for held patch w316 (C31-B6): the patch exists, is non-empty and touches only its four files. It does not apply the patch: it is a
// delta on the base clone of candidate 31 (see the notes file for the order).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = join(here, "w316-the-antigravity-child-model-notice-names-its-repair-and-the-reference-text-matches-the-route.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/agy-native-goldfish.mjs",
  "plugins/pipeline-core/lib/pins/antigravity-native-goldfish-dispatch-needs-consent-and-has-no-parent-binding.test.mjs",
  "plugins/pipeline-core/skills/pipeline-start/references/design-course.md",
  "plugins/pipeline-core/skills/pipeline-start/references/antigravity-native-dispatch.md",
]);

test("w316 patch exists, is non-empty and touches only the write list", () => {
  assert.ok(statSync(patch).size > 0);
  const files = [...readFileSync(patch, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(ALLOWED.has(file), `unexpected file in patch: ${file}`);
  assert.equal(new Set(files).size, ALLOWED.size, "all four files are touched");
});
