// SPDX-License-Identifier: SUL-1.0
// C23-ROUTING-USER-OWNED (AC-108): the held patch exists, is non-empty, and touches only plugins/pipeline-core/ plus pipeline.user.yaml.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w321-c23-routing-user-owned.patch");

test("C23 the held patch exists and is non-empty", () => {
  assert.equal(existsSync(PATCH), true);
  assert.ok(statSync(PATCH).size > 0);
});

test("C23 every file the held patch touches is under plugins/pipeline-core/, except pipeline.user.yaml", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names no file");
  for (const path of touched) {
    assert.ok(path === "pipeline.user.yaml" || path.startsWith("plugins/pipeline-core/"), `${path} is outside plugins/pipeline-core/`);
  }
});
