// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w3112 (candidate 31, C31-M12, lane L10a verb part): the patch exists, is non-empty and touches only its write list.
// It does not run git apply: the patch is a delta on the base clone of candidate 31 (apply the base clone first, then w312, w3111, then this one).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PATCH = join(dirname(fileURLToPath(import.meta.url)), "w3112-the-delta-verb-exempts-registered-evidence-paths-and-the-help-says-so.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/feature-package-registration.mjs",
  "plugins/pipeline-core/scripts/register-feature-package.mjs",
  "plugins/pipeline-core/scripts/register-feature-package-readback.test.mjs",
  "plugins/pipeline-core/lib/critic-course-admission.test.mjs",
  "plugins/pipeline-core/lib/review-economy.test.mjs",
];
const REQUIRED = [
  "plugins/pipeline-core/lib/feature-package-registration.mjs",
  "plugins/pipeline-core/scripts/register-feature-package.mjs",
  "plugins/pipeline-core/scripts/register-feature-package-readback.test.mjs",
];

test("w3112 patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("w3112 patch touches only the briefed files and carries the change, the help text and the readback cases", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.includes(path), `unexpected path ${path}`);
  for (const path of REQUIRED) assert.ok(touched.includes(path), `missing ${path}`);
});
