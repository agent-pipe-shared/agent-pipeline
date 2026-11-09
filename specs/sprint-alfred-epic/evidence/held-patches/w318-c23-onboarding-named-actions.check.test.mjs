// SPDX-License-Identifier: SUL-1.0
// w318 (C23, AC-108) delivery check: the held patch exists, is non-empty, and touches only files under plugins/pipeline-core/.
// No product run: the cases of the change itself live in the patch (hooks/guard-lifecycle-ready.test.mjs and lib/human-guard-override.test.mjs, cases named C23).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const patchPath = fileURLToPath(new URL("./w318-c23-onboarding-named-actions.patch", import.meta.url));

test("the w318 patch exists and is a non-empty regular file", () => {
  const info = statSync(patchPath);
  assert.equal(info.isFile(), true);
  assert.ok(info.size > 0);
});

test("every file the w318 patch touches is under plugins/pipeline-core/", () => {
  const text = readFileSync(patchPath, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(path.startsWith("plugins/pipeline-core/"), `outside plugins/pipeline-core/: ${path}`);
});
