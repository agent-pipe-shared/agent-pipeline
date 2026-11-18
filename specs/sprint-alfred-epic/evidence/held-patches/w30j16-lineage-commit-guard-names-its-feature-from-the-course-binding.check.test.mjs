// SPDX-License-Identifier: SUL-1.0
// Check of the held patch w30j16 (C30J-J16): the patch exists, is non-empty and touches only the files its scope names.
// It does not run git apply against the repository: the patch is a delta on the integrated 30i tree plus the held patch of slice C30J-J13 (see the notes file for the order).

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const DIR = import.meta.dirname;
const PATCH = join(DIR, "w30j16-lineage-commit-guard-names-its-feature-from-the-course-binding.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/feature-package-registration.mjs",
  "plugins/pipeline-core/scripts/register-feature-package-readback.test.mjs",
  "plugins/pipeline-core/scripts/commit-msg-hook-install.mjs",
  "plugins/pipeline-core/scripts/commit-msg-hook-install.test.mjs",
]);

test("the w30j16 patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the w30j16 patch touches only the files its scope names", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `outside the scope: ${path}`);
  assert.ok(touched.includes("plugins/pipeline-core/lib/feature-package-registration.mjs"), "the production change is in the patch");
  assert.ok(touched.includes("plugins/pipeline-core/scripts/register-feature-package-readback.test.mjs"), "the new cases are in the patch");
});
