// SPDX-License-Identifier: SUL-1.0
// w256 (C20 G20-23, ADR binding): shape check of the held patch. No product run; the behavioural proof is the e2e cases 7.12 to 7.14 in
// plugins/pipeline-core/scripts/architecture-baseline.test.mjs, run in the slice clone (see the notes file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const patchPath = fileURLToPath(new URL("./w256-c20-adr-binding.patch", import.meta.url));
const ALLOWED = [
  "plugins/pipeline-core/scripts/",
  "plugins/pipeline-core/lib/",
  "plugins/pipeline-core/schemas/",
  "plugins/pipeline-core/skills/architecture-decision/",
  "schemas/",
];

test("w256 the held patch exists and is not empty", () => {
  assert.ok(existsSync(patchPath), "w256-c20-adr-binding.patch must exist");
  assert.ok(statSync(patchPath).size > 0, "the patch must not be empty");
});

test("w256 every file the patch touches is under an allowed plugin or schema directory", () => {
  const text = readFileSync(patchPath, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch must name at least one file");
  for (const name of new Set(touched)) {
    assert.ok(ALLOWED.some((prefix) => name.startsWith(prefix)), `${name} is outside the allowed directories`);
  }
});

test("w256 the patch carries the binding script, the shared derivation and the end-to-end cases", () => {
  const text = readFileSync(patchPath, "utf8");
  for (const needle of ["plugins/pipeline-core/scripts/bind-adr-proposals.mjs", "deriveAcceptedRecords", "sidecarPreimageSha256", "7.12 create-adr -> bind-adr-proposals"]) {
    assert.ok(text.includes(needle), `the patch must contain ${needle}`);
  }
});
