// SPDX-License-Identifier: SUL-1.0
// C28-PLAN-GATES check (AC-108): the held patch exists, is not empty, and touches only the plugin and docs/. No product run (60 s).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PATCH = `${HERE}c28-plan-gates.patch`;
const NOTES = `${HERE}c28-plan-gates.notes.md`;

test("the held patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0, "an empty patch delivers nothing");
});

test("every file the held patch touches is under plugins/pipeline-core/ or docs/", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names no file");
  const outside = [...new Set(touched)].filter((path) => !path.startsWith("plugins/pipeline-core/") && !path.startsWith("docs/"));
  assert.deepEqual(outside, [], `outside the allowed trees: ${outside.join(", ")}`);
});

test("the notes exist and state what was not changed and not proven", () => {
  const notes = readFileSync(NOTES, "utf8");
  assert.match(notes, /^## Not changed/mu);
  assert.match(notes, /^## Not proven/mu);
  assert.match(notes, /AC-108/u);
});
