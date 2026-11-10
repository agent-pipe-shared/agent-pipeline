// SPDX-License-Identifier: SUL-1.0
// Candidate 28, C28-DECLINED-ACCEPTANCE-ROUTE (AC-108): the held patch exists, is not empty, and touches only the
// plugin, its docs and its schemas. The product behaviour is proven by the suites the notes name, not here.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./c28-declined-acceptance.patch", import.meta.url));
const ALLOWED = [/^plugins\/pipeline-core\//u, /^docs\//u, /^schemas\//u];

test("C28 declined acceptance: the patch exists and is non-empty", () => {
  const info = statSync(PATCH);
  assert.ok(info.isFile() && info.size > 0, "the held patch is a non-empty regular file");
});

test("C28 declined acceptance: every touched file is under plugins/pipeline-core/, docs/ or schemas/", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = new Set();
  for (const line of text.split(/\r?\n/u)) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { touched.add(match[1]); touched.add(match[2]); }
  }
  assert.ok(touched.size > 0, "the patch names at least one file");
  const outside = [...touched].filter((path) => !ALLOWED.some((allowed) => allowed.test(path)));
  assert.deepEqual(outside, [], `files outside plugins/pipeline-core/, docs/ and schemas/: ${outside.join(", ")}`);
});
