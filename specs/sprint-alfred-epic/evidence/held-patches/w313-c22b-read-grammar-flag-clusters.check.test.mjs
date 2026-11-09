// SPDX-License-Identifier: SUL-1.0
// w313 (C22B, AC-108) delivery check: the held patch exists, is non-empty, and touches only files under plugins/pipeline-core/.
// No product run: the cases of the change itself live in the patch (lib/read-command-diagnosis.test.mjs, RCD17 restated and RCD19-RCD21 added).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const patchPath = fileURLToPath(new URL("./w313-c22b-read-grammar-flag-clusters.patch", import.meta.url));

test("the w313 patch exists and is a non-empty regular file", () => {
  const info = statSync(patchPath);
  assert.equal(info.isFile(), true);
  assert.ok(info.size > 0);
});

test("every file the w313 patch touches is under plugins/pipeline-core/", () => {
  const text = readFileSync(patchPath, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(path.startsWith("plugins/pipeline-core/"), `outside plugins/pipeline-core/: ${path}`);
});
