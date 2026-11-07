// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w264 (C20-G2035-E2E-CLOSE-PATH): the patch exists, is non-empty and touches only plugin or harness files,
// and it carries the end-to-end close-path walk (one walk per runner identity) plus its sanctioned steps.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w264-c20-e2e-close-path.patch"), "utf8");

test("w264 patch exists, is non-empty and every touched file is under plugins/pipeline-core/ or harness/", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.ok(file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/"), `outside plugins/pipeline-core/ and harness/: ${file}`);
  }
  assert.ok(files.includes("plugins/pipeline-core/scripts/close-path-e2e.test.mjs"), "the end-to-end walk test is part of the patch");
});

test("w264 patch carries one walk per runner identity and the sanctioned close-path steps", () => {
  for (const needle of ["claude", "codex", "antigravity", "session-critic-finalizer", "close-coordinator", "close-feature", "release-preflight"]) {
    assert.ok(patch.includes(needle), needle);
  }
});
