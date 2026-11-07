// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w269 (C20-G2041-AGY-CRITIC-SOURCE-RETURN): the patch exists, is non-empty and touches only plugin or harness files
// (plus the docs a pin demands, if any), and it carries the Antigravity producer (the PreToolUse hook issues the Source return record on the
// Critic child's send_message), its registration in the hook manifest, and the end-to-end walk.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w269-c20-agy-critic-source-return.patch"), "utf8");

test("w269 patch exists, is non-empty and every touched file is under plugins/pipeline-core/ or harness/", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  // The only two docs a pin may demand together with code (the threat model lists every never-liftable kernel path, the human-authorization
  // inventory every approval kind and verb); this patch is expected to need neither.
  const DOCS_THE_PINS_DEMAND = new Set(["docs/guard-maintenance-window-threat-model.md", "docs/human-authorization-inventory.md"]);
  for (const file of files) {
    assert.ok(file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/") || DOCS_THE_PINS_DEMAND.has(file), `outside plugins/pipeline-core/ and harness/: ${file}`);
  }
  assert.ok(files.includes("plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs"), "the Antigravity PreToolUse hook issues the record");
  assert.ok(files.includes("plugins/pipeline-core/hooks.json"), "send_message is registered in the Antigravity hook manifest matcher");
  assert.ok(files.includes("plugins/pipeline-core/lib/critic-source-return.mjs"), "the shared producer module gains the runner-agnostic export");
  assert.ok(files.includes("plugins/pipeline-core/scripts/close-path-e2e.test.mjs"), "the end-to-end walk test is part of the patch");
  assert.ok(files.includes("plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs"), "the criterion-bound producer cases are part of the patch");
});
