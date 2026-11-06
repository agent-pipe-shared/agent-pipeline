// SPDX-License-Identifier: SUL-1.0
// C19J-W242 (AC-108): the held patch exists, is not empty, and changes only plugins/pipeline-core/hooks/ and plugins/pipeline-core/lib/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = join(here, "w242-the-second-stop-of-a-simultaneous-pair-lands-its-host-commit-and-a-refused-admission-leaves-no-ready-row.patch");
const ALLOWED = ["plugins/pipeline-core/hooks/", "plugins/pipeline-core/lib/"];

test("C19J-W242 the held patch exists and is not empty", () => {
  assert.ok(existsSync(patch), "the .patch file exists");
  assert.ok(statSync(patch).size > 0, "the .patch file is not empty");
});

test("C19J-W242 the held patch touches only plugins/pipeline-core/hooks/ and plugins/pipeline-core/lib/", () => {
  const text = readFileSync(patch, "utf8");
  const paths = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(paths.length > 0, "the patch names at least one file");
  for (const path of paths) assert.ok(ALLOWED.some((prefix) => path.startsWith(prefix)), `${path} is outside the allowed directories`);
  for (const path of ["plugins/pipeline-core/lib/native-goldfish-host-state.mjs", "plugins/pipeline-core/lib/native-goldfish-host-stop-pair.test.mjs"]) assert.ok(paths.includes(path), `${path} is part of the patch`);
});
