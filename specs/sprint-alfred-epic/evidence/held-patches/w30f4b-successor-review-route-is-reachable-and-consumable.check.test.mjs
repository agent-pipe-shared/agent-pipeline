// SPDX-License-Identifier: SUL-1.0
// Check of the held patch w30f4b (C30F-G4B): the patch exists, is non-empty and touches only the files its scope names.
// It does not run git apply against the repository: the patch is a delta on the 30e chain plus C30F-G2 plus C30F-G4 (see the notes file for the order).

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const DIR = import.meta.dirname;
const PATCH = join(DIR, "w30f4b-successor-review-route-is-reachable-and-consumable.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/critic-course-admission.mjs",
  "plugins/pipeline-core/lib/critic-course-admission.test.mjs",
  "plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs",
  "plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs",
  "plugins/pipeline-core/scripts/prepare-dispatch.mjs",
  "plugins/pipeline-core/scripts/prepare-dispatch.test.mjs",
  "plugins/pipeline-core/lib/critic-generic-batch.mjs",
  "plugins/pipeline-core/lib/critic-generic-batch.test.mjs",
]);

test("the w30f4b patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the w30f4b patch touches only the files its scope names", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `outside the scope: ${path}`);
  for (const path of [
    "plugins/pipeline-core/lib/critic-course-admission.mjs",
    "plugins/pipeline-core/lib/critic-generic-batch.mjs",
    "plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs",
    "plugins/pipeline-core/scripts/prepare-dispatch.mjs",
  ]) assert.ok(touched.includes(path), `the production change is in the patch: ${path}`);
});

test("the w30f4b patch changes no persisted record format", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.doesNotMatch(text, /^[+-].*COURSE_BINDING_KEYS/mu, "COURSE_BINDING_KEYS is untouched");
});
