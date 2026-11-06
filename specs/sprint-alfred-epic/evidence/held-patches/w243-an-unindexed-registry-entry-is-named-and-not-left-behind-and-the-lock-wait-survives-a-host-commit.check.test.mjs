// SPDX-License-Identifier: SUL-1.0
// C19J-W243 (AC-108): the held patch exists, is not empty, and changes only plugins/pipeline-core/lib/ and plugins/pipeline-core/scripts/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = join(here, "w243-an-unindexed-registry-entry-is-named-and-not-left-behind-and-the-lock-wait-survives-a-host-commit.patch");
const ALLOWED = ["plugins/pipeline-core/lib/", "plugins/pipeline-core/scripts/"];

test("C19J-W243 the held patch exists and is not empty", () => {
  assert.ok(existsSync(patch), "the .patch file exists");
  assert.ok(statSync(patch).size > 0, "the .patch file is not empty");
});

test("C19J-W243 the held patch touches only plugins/pipeline-core/lib/ and plugins/pipeline-core/scripts/", () => {
  const text = readFileSync(patch, "utf8");
  const paths = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(paths.length > 0, "the patch names at least one file");
  for (const path of paths) assert.ok(ALLOWED.some((prefix) => path.startsWith(prefix)), `${path} is outside the allowed directories`);
  for (const path of ["plugins/pipeline-core/lib/session-authority-registry.mjs", "plugins/pipeline-core/scripts/session-authority-repair.mjs"]) assert.ok(paths.includes(path), `${path} is part of the patch`);
});
