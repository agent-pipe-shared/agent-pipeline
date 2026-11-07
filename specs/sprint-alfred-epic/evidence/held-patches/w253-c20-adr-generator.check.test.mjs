// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w253 (C20-G2026-ADR): the patch exists, is non-empty and touches only the ADR generator, its schemas,
// the architecture-decision skill, the guard admission and their tests.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w253-c20-adr-generator.patch"), "utf8");
const ALLOWED = [
  "plugins/pipeline-core/scripts/",
  "plugins/pipeline-core/lib/",
  "plugins/pipeline-core/schemas/",
  "plugins/pipeline-core/skills/architecture-decision/",
  "schemas/",
];

test("w253 patch exists, is non-empty and every touched file is inside the allowed trees", () => {
  assert.ok(patch.length > 0, "the patch is empty");
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0, "the patch names no file");
  for (const file of files) assert.ok(ALLOWED.some((prefix) => file.startsWith(prefix)), `${file} is outside the allowed trees`);
});
