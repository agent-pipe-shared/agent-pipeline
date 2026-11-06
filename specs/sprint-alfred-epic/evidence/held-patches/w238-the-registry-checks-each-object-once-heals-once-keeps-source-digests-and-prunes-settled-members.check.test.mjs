// SPDX-License-Identifier: SUL-1.0
// w238 (options O7, O8, O3 (ii), O9 and the settled-member prune of the native checks analysis, AC-108 closest accepted criterion):
// the held patch exists, is non-empty and touches only plugins/pipeline-core/lib/ and plugins/pipeline-core/scripts/.
// The behaviour is asserted by plugins/pipeline-core/lib/session-authority-registry-fewer-checks.test.mjs, which the patch adds.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w238-the-registry-checks-each-object-once-heals-once-keeps-source-digests-and-prunes-settled-members.patch");
const ALLOWED_PREFIXES = ["plugins/pipeline-core/lib/", "plugins/pipeline-core/scripts/"];

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("the patch touches only plugins/pipeline-core/lib/ and plugins/pipeline-core/scripts/", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "no file in the patch");
  for (const file of files) assert.ok(ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix)) && !file.includes(".."), `outside the write scope: ${file}`);
  assert.ok(files.includes("plugins/pipeline-core/lib/session-authority-registry.mjs"), "the registry is changed");
  assert.ok(files.includes("plugins/pipeline-core/lib/source-digest-memo.mjs"), "the new source-digest memo module is added");
  assert.ok(files.includes("plugins/pipeline-core/lib/session-authority-registry-fewer-checks.test.mjs"), "the new test file is added");
});
