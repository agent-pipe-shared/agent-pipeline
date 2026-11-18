// SPDX-License-Identifier: SUL-1.0
// Check for held patch w30j25: the patch exists, is non-empty and touches only the three installer files.
// It does not run git apply: the patch is a delta on the integrated 30j tree (see the notes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w30j25-the-fifth-calibration-path-list-uses-the-shared-one.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/pre-commit-hook-install.mjs",
  "plugins/pipeline-core/scripts/pre-commit-hook-install.test.mjs",
  "plugins/pipeline-core/scripts/pre-commit-hook-install.trust-anchor-bootstrap.test.mjs",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(existsSync(patchPath), "the .patch file must exist");
  assert.ok(readFileSync(patchPath, "utf8").length > 0);
});

test("the patch touches only the installer files of the write list", () => {
  const text = readFileSync(patchPath, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "the patch must contain at least one file diff");
  for (const file of files) assert.ok(ALLOWED.has(file), `unexpected file in patch: ${file}`);
});
