// SPDX-License-Identifier: SUL-1.0
// w322 C23: the dispatch admits what the project's configuration names (held patch). Plain node:test, no product run: the held patch exists,
// is non-empty and touches only plugin source, the model policy or the vendored copy of the policy (AC-108).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w322-c23-dispatch-admits-config.patch");

test("w322 the held patch exists and is not empty", () => {
  assert.equal(existsSync(patchPath), true, "the held patch is missing");
  assert.ok(statSync(patchPath).size > 0, "the held patch is empty");
});

test("w322 every file the held patch touches is plugin source, the model policy or its vendored copy", () => {
  const text = readFileSync(patchPath, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names no file");
  for (const path of touched) {
    assert.match(path, /^(?:plugins\/pipeline-core\/|policies\/)/u, `${path} is outside plugins/pipeline-core/ and policies/`);
  }
});
