// SPDX-License-Identifier: SUL-1.0
// C19K-W247-GUIDANCE: the held patch exists, is non-empty and touches only plugin hooks, lib and scripts.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const patch = join(dirname(fileURLToPath(import.meta.url)), "w247-refusals-name-the-full-working-command-and-the-current-stop-failure-and-failed-natives-are-named.patch");

test("the W247 patch exists, is non-empty and stays inside hooks, lib and scripts", () => {
  assert.ok(statSync(patch).size > 0);
  const files = [...readFileSync(patch, "utf8").matchAll(/^diff --git a\/(\S+) b\/\S+$/gmu)].map((match) => match[1]);
  assert.ok(files.length > 0);
  for (const file of files) assert.match(file, /^plugins\/pipeline-core\/(?:hooks|lib|scripts)\//u, file);
});
