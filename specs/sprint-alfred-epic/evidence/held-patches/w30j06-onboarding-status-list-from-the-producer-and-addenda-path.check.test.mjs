// SPDX-License-Identifier: SUL-1.0
// Check of the held patch w30j06 (C30J-J6, analysis C7 / SM-5): the patch exists, is non-empty and touches only the files its scope names.
// It does not run git apply against the repository: the patch is a delta on the integrated 30i tree (the clone base9), see the notes file for the order.

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const DIR = import.meta.dirname;
const PATCH = join(DIR, "w30j06-onboarding-status-list-from-the-producer-and-addenda-path.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/project-onboarding-v3.mjs",
  "plugins/pipeline-core/lib/project-onboarding-v3.test.mjs",
  "plugins/pipeline-core/scripts/project-onboarding-v3.mjs",
  "plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs",
  "plugins/pipeline-core/lib/project-onboarding-ready-gate.test.mjs",
  "plugins/pipeline-core/lib/critic-disposition-addendum.mjs",
  "plugins/pipeline-core/lib/critic-disposition-addendum.test.mjs",
  "plugins/pipeline-core/lib/close-commit-split.mjs",
  "plugins/pipeline-core/lib/close-commit-split.test.mjs",
]);

test("the w30j06 patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the w30j06 patch touches only the files its scope names", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `outside the scope: ${path}`);
  assert.ok(touched.includes("plugins/pipeline-core/lib/project-onboarding-v3.mjs"), "the producer change is in the patch");
  assert.ok(touched.includes("plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs"), "the gate change is in the patch");
});
