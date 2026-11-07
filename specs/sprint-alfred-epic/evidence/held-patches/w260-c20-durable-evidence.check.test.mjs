// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w260 (C20-G2029-DURABLE-EVIDENCE): the patch exists, is non-empty, touches only plugin or template surfaces and
// carries the audit mirror, its auditor-index check, the guard admission and the fresh-clone pin.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w260-c20-durable-evidence.patch"), "utf8");
const ALLOWED = ["plugins/pipeline-core/", "templates/"];

test("w260 patch exists, is non-empty and touches only plugins/pipeline-core/ and templates/", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.ok(ALLOWED.some((prefix) => file.startsWith(prefix)), `outside the permitted surfaces: ${file}`);
  }
  for (const needed of [
    "plugins/pipeline-core/lib/durable-evidence.mjs",
    "plugins/pipeline-core/scripts/durable-evidence.mjs",
    "plugins/pipeline-core/lib/pins/durable-evidence-survives-a-fresh-clone.test.mjs",
    "plugins/pipeline-core/lib/guard/constants.mjs",
    "plugins/pipeline-core/lib/guard/command-catalogue.mjs",
  ]) assert.ok(files.includes(needed), needed);
});

test("w260 patch carries the projections, the check codes with repairs and the guard admission", () => {
  for (const needle of [
    "pipeline.audit-index.v1", "pipeline.durable-dispatch-evidence.v1", "pipeline.durable-verify-evidence.v1", "pipeline.durable-approval-reference.v1",
    "AUDIT-ENTRY-DIFFERS", "AUDIT-NOT-TRACKED", "AUDIT-DIGEST-MISMATCH", "AUDIT-PRIVATE-CONTENT", "AUDIT-UNSYNCED", "AUDIT-PROOF-INVALID",
    "DURABLE_EVIDENCE_SCRIPT", "host-observed", "orchestrator-attested",
  ]) assert.ok(patch.includes(needle), needle);
});
