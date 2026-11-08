// SPDX-License-Identifier: SUL-1.0
// Delivery check for the held patch w272 (candidate 20d, G20-45, AC-108): the patch exists, is non-empty, and touches only
// plugins/pipeline-core/, harness/ or docs/ (docs only where the notes name them). The behavioural cases live in the registered
// suites the patch extends (onboarding-consent-mark, pipeline-start-preflight, the plan-submission pin); this check runs no product code.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const patchPath = here("./w272-c20b-consent-scope.patch");
const notesPath = here("./w272-c20b-consent-scope.notes.md");

test("w272: the held patch exists and is non-empty", () => {
  assert.ok(statSync(patchPath).size > 0);
});

test("w272: every file the patch touches is under plugins/pipeline-core/, harness/ or a docs file the notes name", () => {
  const patch = readFileSync(patchPath, "utf8");
  const notes = readFileSync(notesPath, "utf8");
  const touched = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names no file");
  for (const path of new Set(touched)) {
    const allowed = path.startsWith("plugins/pipeline-core/") || path.startsWith("harness/")
      || (path.startsWith("docs/") && notes.includes(path));
    assert.ok(allowed, `${path} is outside plugins/pipeline-core/, harness/ and the docs the notes name`);
  }
});

test("w272: the patch carries the shared scope list, the v2 record and the coverage edges", () => {
  const patch = readFileSync(patchPath, "utf8");
  for (const needle of [
    "lib/onboarding-consent-scope.mjs", "pipeline.onboarding-consent-mark.v2", "coveredBy", "escalationJustification",
    "consentQuestion", "consentRecordAction",
  ]) assert.ok(patch.includes(needle), needle);
});
