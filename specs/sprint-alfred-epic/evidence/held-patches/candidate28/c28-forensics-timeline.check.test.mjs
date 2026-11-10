// SPDX-License-Identifier: SUL-1.0
// Candidate 28, C28-FORENSICS-TIMELINE (AC-108): the held patch exists, is not empty, and touches only the plugin.
// The product behaviour is proven by the usage-ledger suite the notes name, not here.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./c28-forensics-timeline.patch", import.meta.url));

test("C28 forensics timeline: the patch exists and is non-empty", () => {
  const info = statSync(PATCH);
  assert.ok(info.isFile() && info.size > 0, "the held patch is a non-empty regular file");
});

test("C28 forensics timeline: every touched file is under plugins/pipeline-core/", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = new Set();
  for (const line of text.split(/\r?\n/u)) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { touched.add(match[1]); touched.add(match[2]); }
  }
  assert.ok(touched.size > 0, "the patch names at least one file");
  const outside = [...touched].filter((path) => !/^plugins\/pipeline-core\//u.test(path));
  assert.deepEqual(outside, [], `files outside plugins/pipeline-core/: ${outside.join(", ")}`);
});
