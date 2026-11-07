// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w268 (C20-G2039-CRITIC-SOURCE-RETURN): the patch exists, is non-empty and touches only plugin or harness files,
// and it carries the producer (the Critic stop hook issues the Source return record) next to the end-to-end walk.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w268-c20-critic-source-return.patch"), "utf8");

test("w268 patch exists, is non-empty and every touched file is under plugins/pipeline-core/ or harness/", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  // The Elephant's completion step added exactly two docs the pins demand together with the code: the threat model lists every
  // never-liftable kernel path (GMWKC03) and the human-authorization inventory lists every approval kind and verb (auth-gate drift).
  const DOCS_THE_PINS_DEMAND = new Set(["docs/guard-maintenance-window-threat-model.md", "docs/human-authorization-inventory.md"]);
  for (const file of files) {
    assert.ok(file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/") || DOCS_THE_PINS_DEMAND.has(file), `outside plugins/pipeline-core/ and harness/: ${file}`);
  }
  assert.ok(files.includes("plugins/pipeline-core/lib/critic-source-return.mjs"), "the producer and reader module is part of the patch");
  assert.ok(files.includes("plugins/pipeline-core/hooks/native-goldfish-host.mjs"), "the stop hook issues the record");
  assert.ok(files.includes("plugins/pipeline-core/scripts/close-path-e2e.test.mjs"), "the end-to-end walk test is part of the patch");
});
