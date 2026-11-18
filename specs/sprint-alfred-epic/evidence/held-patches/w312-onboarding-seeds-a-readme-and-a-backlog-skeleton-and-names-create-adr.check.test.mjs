// SPDX-License-Identifier: SUL-1.0
// Check for held patch w312 (C31-B2): the patch exists, is non-empty and touches only the briefed files.
// It does not apply the patch (it is a delta on the base clone of candidate 31).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w312-onboarding-seeds-a-readme-and-a-backlog-skeleton-and-names-create-adr.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/architecture-map-scaffold.mjs",
  "plugins/pipeline-core/lib/architecture-map-scaffold.test.mjs",
  "plugins/pipeline-core/lib/project-onboarding-v3.mjs",
  "plugins/pipeline-core/lib/project-onboarding-v3.test.mjs",
  "plugins/pipeline-core/lib/guard-devplan-policy.mjs",
  "plugins/pipeline-core/lib/guard-devplan-policy.test.mjs",
  "plugins/pipeline-core/hooks/guard-devplan.test.mjs",
]);

test("w312 patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("w312 patch touches only the briefed files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(ALLOWED.has(file), `unexpected file in patch: ${file}`);
});
