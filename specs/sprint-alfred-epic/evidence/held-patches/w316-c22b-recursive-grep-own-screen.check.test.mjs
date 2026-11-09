// SPDX-License-Identifier: SUL-1.0
// w316 (C22B, AC-108) delivery check: the held patch exists, is non-empty, and touches only files under plugins/pipeline-core/.
// No product run: the cases of the change itself live in the patch (lib/read-command-diagnosis.test.mjs, RCD22 and following).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const patchPath = fileURLToPath(new URL("./w316-c22b-recursive-grep-own-screen.patch", import.meta.url));

test("the w316 patch exists and is a non-empty regular file", () => {
  const info = statSync(patchPath);
  assert.equal(info.isFile(), true);
  assert.ok(info.size > 0);
});

test("every file the w316 patch touches is under plugins/pipeline-core/", () => {
  const text = readFileSync(patchPath, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(path.startsWith("plugins/pipeline-core/"), `outside plugins/pipeline-core/: ${path}`);
});
