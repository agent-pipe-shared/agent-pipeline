// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w248: the patch exists and touches only the routine-repair library, its test and its CLI.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w248-heal-moves-a-stale-armed-member-aside-without-a-human-and-move-aside-admits-what-heal-recommends.patch"), "utf8");

test("w248 patch exists, is non-empty and touches only routine-repair files", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]).sort();
  assert.deepEqual(files, [
    "plugins/pipeline-core/lib/routine-repair.mjs",
    "plugins/pipeline-core/lib/routine-repair.test.mjs",
    "plugins/pipeline-core/scripts/routine-repair.mjs",
  ]);
  assert.ok(patch.includes("--no-goldfish-running"));
});
