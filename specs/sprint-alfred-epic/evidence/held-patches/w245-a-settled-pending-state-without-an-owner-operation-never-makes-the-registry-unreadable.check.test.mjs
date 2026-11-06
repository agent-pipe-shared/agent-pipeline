// SPDX-License-Identifier: SUL-1.0
// C19K-W245 (AC-108): the held patch exists, is not empty and touches only the plugin's hooks, lib and scripts folders.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const patch = new URL("./w245-a-settled-pending-state-without-an-owner-operation-never-makes-the-registry-unreadable.patch", import.meta.url);

test("the w245 patch exists and is not empty", () => {
  assert.equal(statSync(patch).isFile(), true);
  assert.ok(statSync(patch).size > 0, "the patch has content");
});

test("the w245 patch touches only plugins/pipeline-core/hooks/, lib/ and scripts/", () => {
  const touched = [...readFileSync(patch, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((row) => [row[1], row[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.match(path, /^plugins\/pipeline-core\/(hooks|lib|scripts)\//u, `${path} is inside the allowed folders`);
});
