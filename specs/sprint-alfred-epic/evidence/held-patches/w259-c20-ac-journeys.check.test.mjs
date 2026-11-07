// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w259-c20-ac-journeys.patch (C20 finding G20-27, AC-108): the patch exists, is non-empty, and every file it touches lives under a
// path the slice is allowed to change. The behavioural cases live in the patch itself (plugins/pipeline-core/lib/pins/
// acceptance-criteria-are-examined-as-whole-user-journeys.test.mjs); this file only guards the delivered artefact. Plain node:test, no product run.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchText = () => readFileSync(join(here, "w259-c20-ac-journeys.patch"), "utf8");
const ALLOWED = ["templates/", "roles/", "guardrails/", "docs/", "plugins/pipeline-core/", "harness/"];
const touchedFiles = (text) => [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);

test("the held patch exists and is non-empty", () => {
  const text = patchText();
  assert.ok(text.length > 0, "the patch file is empty");
  assert.ok(/^diff --git /mu.test(text), "the patch holds at least one file diff");
});

test("every file the patch touches is under templates/, roles/, guardrails/, docs/, plugins/pipeline-core/ or harness/", () => {
  const files = touchedFiles(patchText());
  assert.ok(files.length > 0, "no touched file found");
  const outside = [...new Set(files)].filter((file) => !ALLOWED.some((prefix) => file.startsWith(prefix)) || file.includes(".."));
  assert.deepEqual(outside, [], `touched outside the allowed roots: ${outside.join(", ")}`);
});

test("the patch carries the new pin and the shared journey reading", () => {
  const files = new Set(touchedFiles(patchText()));
  for (const file of [
    "plugins/pipeline-core/lib/pins/acceptance-criteria-are-examined-as-whole-user-journeys.test.mjs",
    "plugins/pipeline-core/lib/spec-journey-coverage.mjs",
    "plugins/pipeline-core/lib/plan-handoff-readiness.mjs",
    "plugins/pipeline-core/lib/close-quality-readback.mjs",
    "templates/spec.md",
    "templates/prompts/critic-review.md",
    "templates/prompts/goldfish-task.md",
  ]) assert.ok(files.has(file), `the patch does not touch ${file}`);
});
