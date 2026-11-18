// SPDX-License-Identifier: SUL-1.0
// Check of the held patch w30j14 (C30J-J14): the patch exists, is non-empty and touches only the files its scope names.
// It does not run git apply against the repository: the patch is a delta on the integrated 30i tree (see the notes file for the order).

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const DIR = import.meta.dirname;
const PATCH = join(DIR, "w30j14-guard-catalogue-admits-the-feature-selector-of-the-registration.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/guard/command-catalogue.mjs",
  "plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs",
  "plugins/pipeline-core/lib/guard/command-catalogue.test.mjs",
]);

test("the w30j14 patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the w30j14 patch touches only the files its scope names", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `outside the scope: ${path}`);
  assert.ok(touched.includes("plugins/pipeline-core/lib/guard/command-catalogue.mjs"), "the production change is in the patch");
  assert.ok(touched.includes("plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs"), "the new cases are in the patch");
});
